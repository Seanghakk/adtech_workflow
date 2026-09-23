'use server'

/**
 * Brief 098 §3 — the two halves of the import flow, for all three tiers.
 *
 *   previewBoqImport — reads the file, refuses it whole if it is not the
 *     template (§7.3), groups what a commit WOULD do (§7.4), and proposes
 *     the floors and systems the file names but the project lacks (§7.6).
 *     Writes NOTHING.
 *
 *   commitBoqImport — the only write, through workflow.commit_boq_import
 *     (migration 037): one SECURITY DEFINER function, one transaction, so
 *     a commit is all-or-nothing per §4 and the PIC rule is applied
 *     uniformly across three tiers whose own RLS gates differ.
 */
import { revalidatePath } from 'next/cache'
import type { WorkSheet } from 'xlsx'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { getUserProfilesByIds, formatMemberName } from '@/lib/auth/user-profiles'
import { BOQ_TIER_BY_SLUG, type BoqTierConfig } from '@/lib/boq/tiers'
import { parseBoqSheet, type ParsedBoqLine } from '@/lib/boq/parse'
import { buildFloorColumns } from '../../shop-drawing-boq/floor-columns'
import {
  diffBoqLines,
  buildProposedFloors,
  buildProposedSystems,
  type ExistingBoqLine,
} from '@/lib/boq/diff'
import type { BoqImportState, FloorProposalDecision } from './import-shared'

const fail = (error: string): BoqImportState => ({ notTemplate: null, error, preview: null, result: null })

async function loadProjectAndGate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<{ picId: string | null; userId: string; soNumber: string | null } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'You need to be signed in to do this.' }

  const { data: project, error } = await supabase
    .from('projects')
    .select('pic_id, so_number')
    .eq('id', projectId)
    .maybeSingle()

  if (error) return { error: 'Could not read this project. Nothing was written.' }
  if (!project) return { error: 'Project not found.' }

  return { picId: project.pic_id, userId: user.id, soNumber: project.so_number }
}

/** The project's current floor columns, keyed exactly as a matching
 *  template column would be headed. Always rebuilt from live rows, never
 *  trusted from the uploaded file. */
async function loadFloorColumns(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const [{ data: towerRows }, { data: floorRows }] = await Promise.all([
    supabase.from('project_towers').select('id, label, sort_order').eq('project_id', projectId),
    supabase.from('project_floors').select('id, label, sort_order, tower_id').eq('project_id', projectId),
  ])

  const towers = (towerRows ?? []).map((t) => ({ id: t.id, label: t.label, sortOrder: t.sort_order }))
  const floors = (floorRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    sortOrder: f.sort_order,
    towerId: f.tower_id,
  }))
  const towerLabelById = new Map(towers.map((tw) => [tw.id, tw.label]))
  const columns = buildFloorColumns(towers, floors)
  const floorById = new Map(floors.map((f) => [f.id, f]))

  const byHeader = new Map<string, { floorLabel: string; towerLabel: string | null }>()
  for (const c of columns) {
    const f = floorById.get(c.floorId)
    if (!f) continue
    byHeader.set(c.header, {
      floorLabel: f.label,
      towerLabel: f.towerId ? (towerLabelById.get(f.towerId) ?? null) : null,
    })
  }

  return { byHeader, floors, floorCount: floors.length }
}

export async function previewBoqImport(
  _prev: BoqImportState,
  formData: FormData,
): Promise<BoqImportState> {
  const projectId = String(formData.get('projectId') ?? '')
  const tierSlug = String(formData.get('tier') ?? '')
  const config: BoqTierConfig | undefined = BOQ_TIER_BY_SLUG[tierSlug]
  const file = formData.get('file')

  if (!projectId || !config) return fail('Invalid request.')
  if (!(file instanceof File) || file.size === 0) return fail('Choose a file to import.')

  const supabase = await createClient()
  const gate = await loadProjectAndGate(supabase, projectId)
  if ('error' in gate) return fail(gate.error)

  const t = await getServerTranslator()
  if (gate.picId !== gate.userId) return fail(t('boqImportRefusedNotPic'))

  let rows2d: unknown[][]
  try {
    const XLSX = await import('xlsx')
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) return fail(t('boqImportPreviewFailedBody'))
    const sheet: WorkSheet = workbook.Sheets[firstSheetName]
    // header: 1 — array-of-arrays, so an all-blank but present column still
    // reads as a real header (object mode would silently drop it).
    rows2d = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  } catch {
    // v7.2 §21.2 "Preview failed": the file reached the app but the preview
    // did not finish. Nothing was written and nothing was partly read.
    return fail(t('boqImportPreviewFailedBody'))
  }

  const { byHeader, floors, floorCount } = await loadFloorColumns(supabase, projectId)
  const parsed = parseBoqSheet(rows2d, config, byHeader)

  if (parsed.kind === 'not-template') {
    return {
      notTemplate: {
        fileName: file.name,
        expectedHeaders: parsed.expectedHeaders,
        foundHeaders: parsed.foundHeaders,
      },
      error: null,
      preview: null,
      result: null,
    }
  }
  if (parsed.kind === 'no-data-rows') return fail(t('boqImportNoRows'))

  const selectCols = config.hasSectionLabel
    ? `id, item_number, section_label, description, brand, unit, ${config.quantityColumn}`
    : `id, item_number, system_type, description, brand, unit, ${config.quantityColumn}`

  const [{ data: existingRows, error: existingError }, { data: systemRows }, { data: cadRows }] = await Promise.all([
    supabase.from(config.table).select(selectCols).eq('project_id', projectId),
    supabase.from('project_systems').select('name').eq('project_id', projectId),
    supabase.from('cad_systems').select('code, label_en').eq('is_active', true).order('sort_order'),
  ])

  if (existingError) return fail(t('boqImportPreviewFailedBody'))

  const existing: ExistingBoqLine[] = (existingRows ?? []).map((r) => {
    const row = r as unknown as Record<string, unknown>
    return {
      id: String(row.id),
      itemNumber: (row.item_number as string | null) ?? null,
      sectionLabel: (row.section_label as string | null) ?? null,
      systemType: (row.system_type as string | null) ?? null,
      description: String(row.description ?? ''),
      brand: (row.brand as string | null) ?? null,
      unit: String(row.unit ?? ''),
      quantity: Number(row[config.quantityColumn] ?? 0),
    }
  })

  const diff = diffBoqLines(parsed.lines, existing, config)

  const knownHeaders = new Set(byHeader.keys())
  const proposedFloors = config.hasFloorColumns
    ? buildProposedFloors(parsed.fileFloorHeaders, knownHeaders, floorCount)
    : []

  const existingSystemNames = new Set((systemRows ?? []).map((s) => s.name))
  const cadSystems = (cadRows ?? []).map((c) => ({ code: c.code, labelEn: c.label_en }))
  const proposedSystems = config.hasSystemType
    ? buildProposedSystems(
        parsed.lines.map((l) => l.systemType ?? '').filter(Boolean),
        existingSystemNames,
        cadSystems,
      )
    : []

  return {
    notTemplate: null,
    error: null,
    result: null,
    preview: {
      fileName: file.name,
      lines: parsed.lines,
      rowErrors: parsed.rowErrors,
      newLines: diff.newLines,
      changedLines: diff.changedLines,
      unchangedCount: diff.unchangedLines.length,
      missingLines: diff.missingLines,
      proposedFloors,
      proposedSystems,
      cadSystems,
      existingFloors: floors.map((f) => ({ id: f.id, label: f.label })),
    },
  }
}

export async function commitBoqImport(
  _prev: BoqImportState,
  formData: FormData,
): Promise<BoqImportState> {
  const projectId = String(formData.get('projectId') ?? '')
  const tierSlug = String(formData.get('tier') ?? '')
  const config = BOQ_TIER_BY_SLUG[tierSlug]
  if (!projectId || !config) return fail('Invalid request.')

  const t = await getServerTranslator()

  let lines: ParsedBoqLine[]
  let floorDecisions: FloorProposalDecision[]
  let systems: { name: string; cadCode: string | null }[]
  let rowsLeftOut = 0
  let appLinesKept = 0
  try {
    const payload = JSON.parse(String(formData.get('payload') ?? '{}'))
    lines = payload.lines ?? []
    floorDecisions = payload.floors ?? []
    systems = payload.systems ?? []
    rowsLeftOut = Number(payload.rowsLeftOut ?? 0)
    appLinesKept = Number(payload.appLinesKept ?? 0)
  } catch {
    return fail(t('boqImportPreviewFailedBody'))
  }

  if (lines.length === 0) return fail(t('boqImportNothingToCommit'))

  const supabase = await createClient()
  const gate = await loadProjectAndGate(supabase, projectId)
  if ('error' in gate) return fail(gate.error)
  if (gate.picId !== gate.userId) return fail(t('boqImportRefusedNotPic'))

  // "Map to existing" rewrites the file's own column label onto the floor
  // the user actually meant, so the committed quantity lands on that floor
  // rather than creating a near-duplicate. "Skip" drops the column's
  // quantities entirely — the user declined the proposal, and v7.2 §7.6
  // lets them import the lines anyway.
  const floorsToCreate = floorDecisions.filter((f) => f.choice === 'create')
  const mapped = new Map<string, string>()
  const skipped = new Set<string>()
  const floorById = new Map<string, string>()
  const { floors } = await loadFloorColumns(supabase, projectId)
  for (const f of floors) floorById.set(f.id, f.label)
  for (const d of floorDecisions) {
    if (d.choice === 'map' && d.mapToFloorId) {
      const target = floorById.get(d.mapToFloorId)
      if (target) mapped.set(d.label, target)
    } else if (d.choice === 'skip') {
      skipped.add(d.label)
    }
  }

  const linesForCommit = lines.map((line) => ({
    ...line,
    locations: (line.locations ?? [])
      .filter((loc) => !skipped.has(loc.floorLabel))
      .map((loc) =>
        mapped.has(loc.floorLabel)
          ? { ...loc, floorLabel: mapped.get(loc.floorLabel)!, towerLabel: null }
          : loc,
      ),
  }))

  const { data, error } = await supabase.rpc('commit_boq_import', {
    p_project_id: projectId,
    p_tier: config.tier,
    p_lines: linesForCommit,
    p_floors: floorsToCreate.map((f) => ({
      label: f.label,
      drawingCode: f.drawingCode,
      sortOrder: f.sortOrder,
      towerLabel: f.towerLabel,
    })),
    p_systems: systems,
  })

  if (error) {
    // migration 037 raises a plain, readable exception for every refusal it
    // decides itself (not this project's PIC, a line with no item number, an
    // unknown tier). Those messages are shown as-is; anything else is a real
    // database failure and gets this call site's own copy.
    return fail(error.message || t('boqImportCommitFailed'))
  }

  const counts = (data ?? {}) as {
    linesInserted?: number
    linesUpdated?: number
    floorsCreated?: number
    systemsAdded?: number
  }

  const profiles = await getUserProfilesByIds(supabase, [gate.userId])
  const byName = formatMemberName(profiles.get(gate.userId), t('membersNoProfile'))

  revalidatePath(`/projects/${projectId}/setup`)
  revalidatePath(`/projects/${projectId}/${config.slug}-boq`)
  revalidatePath(`/projects/${projectId}`)

  const linesInserted = counts.linesInserted ?? 0
  const linesUpdated = counts.linesUpdated ?? 0

  return {
    notTemplate: null,
    error: null,
    preview: null,
    result: {
      linesWritten: linesInserted + linesUpdated,
      linesInserted,
      linesUpdated,
      floorsCreated: counts.floorsCreated ?? 0,
      floorsMapped: mapped.size,
      systemsAdded: counts.systemsAdded ?? 0,
      rowsLeftOut,
      appLinesKept,
      byName,
      at: new Date().toISOString(),
    },
  }
}
