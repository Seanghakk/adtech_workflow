/**
 * Brief 100 Part A — everything the AutoCAD export panel shows, and
 * everything the CSV sends, loaded once here so the panel and the download
 * can never disagree about what is about to be sent. The download re-reads
 * through this same function at the moment it is clicked, so the recorded
 * snapshot is the file that actually left, not what the page showed when
 * it was opened.
 */
import type { createClient } from '@/lib/supabase/server'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { getUserProfilesByIds, formatMemberName } from '@/lib/auth/user-profiles'
import {
  buildProjectValues,
  buildDrawingValues,
  buildMissingValueWarnings,
  isPreStandardProject,
  type ProjectValues,
  type DrawingValues,
  type MissingValueWarning,
  type ExportSnapshot,
} from '@/lib/autocad/export'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>
type Translate = (key: DictionaryKey) => string

const DRAWING_TYPE_KEYS: Record<string, DictionaryKey> = {
  schematic: 'drawingTypeSchematic',
  typical_section: 'drawingTypeTypicalSection',
  layout: 'drawingTypeLayout',
  detail_connection: 'drawingTypeDetailConnection',
}

const STATUS_KEYS: Record<string, DictionaryKey> = {
  not_started: 'statusNotStarted',
  in_progress: 'statusInProgress',
  done: 'statusDone',
}

export interface ExportData {
  project: {
    id: string
    name: string
    soNumber: string | null
    picId: string | null
    picName: string | null
    startDate: string | null
    numberingMode: string | null
  }
  values: ProjectValues
  drawings: DrawingValues[]
  warnings: MissingValueWarning[]
  snapshot: ExportSnapshot
  preStandard: boolean
  lastExport: { at: string; byName: string; snapshot: ExportSnapshot } | null
}

export async function loadExportData(
  supabase: SupabaseClient,
  projectId: string,
  t: Translate,
): Promise<ExportData | { error: true }> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, name, so_number, pic_id, start_date, cad_owner_name, cad_consultant_name, drawing_numbering_mode, clients(name)',
    )
    .eq('id', projectId)
    .maybeSingle()

  if (projectError || !project) return { error: true }

  const [
    { data: floorRows, error: floorError },
    { data: systemRows, error: systemError },
    { data: itemRows, error: itemError },
    { data: lastExportRow },
  ] = await Promise.all([
    supabase.from('project_floors').select('id, label, drawing_code').eq('project_id', projectId),
    supabase.from('project_systems').select('id, cad_code').eq('project_id', projectId),
    supabase
      .from('shop_drawing_items')
      .select('id, floor_id, scope, drawing_type, status, drawing_number, drafter_id, approver_id')
      .eq('project_id', projectId),
    supabase
      .from('autocad_export_log')
      .select('exported_at, exported_by, snapshot')
      .eq('project_id', projectId)
      .order('exported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // v7.2 §21.0 — a failed read shows the failed state, never an empty table.
  if (floorError || systemError || itemError) return { error: true }

  const floors = floorRows ?? []
  const systems = systemRows ?? []
  const items = itemRows ?? []
  const floorLabelById = new Map(floors.map((f) => [f.id, f.label]))

  // REV and ISSUEDATE come from the approval lifecycle (§8.2), and CHECKEDBY
  // from whoever recorded the internal check — three separate tables, read
  // only for the items this project actually has.
  const itemIds = items.map((i) => i.id)
  const [{ data: submissionRows }, { data: checkRows }] = itemIds.length
    ? await Promise.all([
        supabase
          .from('shop_drawing_submissions')
          .select('item_id, revision, submitted_at, returned_at')
          .in('item_id', itemIds),
        supabase.from('shop_drawing_checks').select('item_id, revision, checked_by').in('item_id', itemIds),
      ])
    : [{ data: [] }, { data: [] }]

  const latestSubmission = new Map<string, { revision: number; issueDate: string | null }>()
  for (const s of submissionRows ?? []) {
    const current = latestSubmission.get(s.item_id)
    if (!current || s.revision > current.revision) {
      latestSubmission.set(s.item_id, {
        revision: s.revision,
        issueDate: (s.returned_at ?? s.submitted_at ?? null)?.slice(0, 10) ?? null,
      })
    }
  }

  const latestCheck = new Map<string, { revision: number; checkedBy: string }>()
  for (const c of checkRows ?? []) {
    const current = latestCheck.get(c.item_id)
    if (!current || c.revision > current.revision) {
      latestCheck.set(c.item_id, { revision: c.revision, checkedBy: c.checked_by })
    }
  }

  const peopleIds = new Set<string>()
  if (project.pic_id) peopleIds.add(project.pic_id)
  for (const i of items) {
    if (i.drafter_id) peopleIds.add(i.drafter_id)
    if (i.approver_id) peopleIds.add(i.approver_id)
  }
  for (const c of latestCheck.values()) peopleIds.add(c.checkedBy)
  if (lastExportRow?.exported_by) peopleIds.add(lastExportRow.exported_by)

  const profiles = await getUserProfilesByIds(supabase, [...peopleIds])
  const nameOf = (id: string | null | undefined): string | null =>
    id ? formatMemberName(profiles.get(id), t('membersNoProfile')) : null

  const client = Array.isArray(project.clients) ? project.clients[0] : project.clients

  const values = buildProjectValues({
    soNumber: project.so_number,
    name: project.name,
    clientName: client?.name ?? null,
    cadOwnerName: project.cad_owner_name,
    cadConsultantName: project.cad_consultant_name,
  })

  const drawings: DrawingValues[] = items.map((i) => {
    const sub = latestSubmission.get(i.id)
    const chk = latestCheck.get(i.id)
    return buildDrawingValues({
      drawingNumber: i.drawing_number,
      typeLabel: t(DRAWING_TYPE_KEYS[i.drawing_type] ?? 'drawingTypeLayout'),
      floorLabel: i.floor_id ? (floorLabelById.get(i.floor_id) ?? null) : null,
      revision: sub?.revision ?? null,
      statusLabel: t(STATUS_KEYS[i.status] ?? 'statusNotStarted'),
      issueDate: sub?.issueDate ?? null,
      drafterName: nameOf(i.drafter_id),
      checkerName: chk ? nameOf(chk.checkedBy) : null,
      approverName: nameOf(i.approver_id),
    })
  })

  const drawingsMissingPeople = items.filter(
    (i) => !i.drafter_id || !i.approver_id || !latestCheck.has(i.id),
  ).length

  const warnings = buildMissingValueWarnings({
    ownerSet: Boolean(project.cad_owner_name),
    consultantSet: Boolean(project.cad_consultant_name),
    floorsWithoutDrawingCode: floors.filter((f) => !f.drawing_code).length,
    systemsWithoutCadCode: systems.filter((s) => !s.cad_code).length,
    drawingsMissingPeople,
  })

  const picName = nameOf(project.pic_id)

  const snapshot: ExportSnapshot = {
    picName,
    owner: values.OWNER,
    consultant: values.CONSULTANT,
    floorCount: floors.length,
    systemCount: systems.length,
    drawingCount: items.length,
    maxRevision: [...latestSubmission.values()].reduce((max, s) => Math.max(max, s.revision), 0),
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      soNumber: project.so_number,
      picId: project.pic_id,
      picName,
      startDate: project.start_date,
      numberingMode: project.drawing_numbering_mode,
    },
    values,
    drawings,
    warnings,
    snapshot,
    preStandard: isPreStandardProject(project.start_date),
    lastExport: lastExportRow
      ? {
          at: lastExportRow.exported_at,
          byName: nameOf(lastExportRow.exported_by) ?? t('membersNoProfile'),
          snapshot: lastExportRow.snapshot as ExportSnapshot,
        }
      : null,
  }
}
