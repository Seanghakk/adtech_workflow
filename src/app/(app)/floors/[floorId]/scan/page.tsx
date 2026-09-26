import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/uuid'
import { getServerTranslator } from '@/lib/i18n/server'
import { formatDateICT } from '@/lib/format/datetime'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getUserProfilesByIds, formatMemberName } from '@/lib/auth/user-profiles'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { floorScanAncestors } from '@/lib/breadcrumbs'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import {
  buildPhoneRows,
  groupPhoneRows,
  showsQcNothingWaiting,
  type PhoneSubStageInput,
  type Stage,
} from '@/lib/floorScan/rows'
import { FloorScanRows } from './FloorScanRows'
import { chooseSystem } from '@/lib/progressPerSystem/phoneSystem'
import { SystemStep } from './SystemStep'
import { SUB_STAGE_KEYS } from '@/lib/floorScan/rows'
import { daysSinceICT } from '@/lib/format/datetime'

export const metadata: Metadata = {
  title: 'Floor — ADTECH Workflow Tracker',
}

/**
 * Brief 078 built §12.2's header. Brief 100 Part E adds the rest of
 * v7.2 §12: the five rows and their groups (§12.3-§12.4), the status
 * control (§12.5), the photo gate (§12.6, its own route), the save
 * outcomes (§12.7), inspections (§12.8) and the project-level material
 * inspection block (§12.9), each with §21.6's empty state.
 *
 * ROUTE: /floors/[floorId]/scan, unchanged. v7.2 §20's route table lists
 * this screen under /f/[id], but its own preamble says "where a route's
 * path is not given, it is whatever the app already uses; do not rename
 * routes to match this table" — so /f/[id] REDIRECTS here rather than
 * this page moving.
 *
 * NO BREADCRUMB (§12.1): "Nobody arriving from a QR sticker is
 * navigating a hierarchy." floorScanAncestors() is a named, empty
 * derivation — see its own header in src/lib/breadcrumbs.ts.
 *
 * AUTH: no gate built here. This route sits under the (app) route group,
 * so src/proxy.ts's existing gate covers it — it redirects to
 * /login?next=<path> and safeNextPath() lands back on this exact floor,
 * which is what §12.10 asks for ("preserve the scanned floor id across
 * the round trip"). §12.10's own phone login CARD is not built: login is
 * a shared platform function held until the platform migration (v7.2
 * §7), and drawing a second login screen now would be a screen thrown
 * away at that migration. Flagged in the Result doc.
 */
export default async function FloorScanPage({
  params,
  searchParams,
}: {
  params: Promise<{ floorId: string }>
  searchParams: Promise<{ system?: string }>
}) {
  const { floorId } = await params
  // §12.2a — the choice rides in the URL so a reopened or shared link lands
  // on the same system. The session remembers it too, in the client.
  const { system: systemFromUrl } = await searchParams

  if (!isUuid(floorId)) {
    notFound()
  }

  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  const { data: floor, error: floorError } = await supabase
    .from('project_floors')
    .select('id, label, tower_id, project_id')
    .eq('id', floorId)
    .maybeSingle()

  if (floorError) return <FloorScanLoadFailed t={t} />
  if (!floor) notFound()

  const [{ data: tower }, { data: project, error: projectError }] = await Promise.all([
    floor.tower_id
      ? supabase.from('project_towers').select('label').eq('id', floor.tower_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('projects')
      .select('id, name, so_number, stream, pic_id')
      .eq('id', floor.project_id)
      .maybeSingle(),
  ])

  if (projectError) return <FloorScanLoadFailed t={t} />
  if (!project) {
    // Same "not found or not visible under RLS" convention as above.
    notFound()
  }

  // Brief 094 — every read's error is captured. A failed read shows
  // §21.0's failed state; it is never allowed to render as "this floor
  // has nothing on it", which on this screen would read as a fact about
  // the building.
  // Brief 106b / §12.2a — cells belong to a system now. The scan still
  // resolves only the FLOOR (§4.1: the printed labels are per floor and
  // already in the field), so this loads every system's cells for the
  // floor and the page resolves which system to show.
  const { data: subStageRows, error: subStageError } = await supabase
    .from('progress_cells')
    .select(
      'id, project_system_id, stage, sub_stage, sequence, status, photo_url, updated_at, updated_by',
    )
    .eq('floor_id', floor.id)

  if (subStageError) return <FloorScanLoadFailed t={t} />

  // Every system on the PROJECT, not only those covering this floor —
  // §12.2a lists the ones that do not, read-only, so a crew can see why
  // the system they expected is absent.
  const { data: phoneSystemRows, error: phoneSystemsError } = await supabase
    .from('project_systems')
    .select('id, name')
    .eq('project_id', floor.project_id)
    .order('name')

  if (phoneSystemsError) return <FloorScanLoadFailed t={t} />

  const { data: phoneCoverage, error: phoneCoverageError } = (phoneSystemRows ?? []).length
    ? await supabase
        .from('project_system_floors')
        .select('project_system_id, floor_id')
        .in('project_system_id', (phoneSystemRows ?? []).map((r) => r.id))
        .is('removed_at', null)
    : { data: [], error: null }

  if (phoneCoverageError) return <FloorScanLoadFailed t={t} />

  // §12.2a lists the floors a NON-covering system does cover, so the labels
  // of every floor on the project are needed, not just this one.
  const { data: projectFloorRows } = await supabase
    .from('project_floors')
    .select('id, label, sort_order')
    .eq('project_id', floor.project_id)
    .order('sort_order')

  const floorLabelById = new Map((projectFloorRows ?? []).map((f) => [f.id, f.label]))
  const floorLabelsBySystem = new Map<string, string[]>()
  for (const c of phoneCoverage ?? []) {
    const label = floorLabelById.get(c.floor_id)
    if (!label) continue
    floorLabelsBySystem.set(c.project_system_id, [
      ...(floorLabelsBySystem.get(c.project_system_id) ?? []),
      label,
    ])
  }

  const subStageIds = (subStageRows ?? []).map((s) => s.id)

  const [
    { data: inspectionRows, error: inspectionError },
    { data: materialRows, error: materialError },
  ] = await Promise.all([
    subStageIds.length
      ? supabase
          .from('qc_inspections')
          .select('progress_cell_id, status, inspected_at, created_at, notes')
          .in('progress_cell_id', subStageIds)
      : Promise.resolve({ data: [], error: null }),
    // §12.9 — project-level, exactly as the data already is. No floor
    // filter anywhere in this read: a material inspection is not a fact
    // about this floor, and filtering it by floor here would quietly
    // reintroduce the very confusion §12.9 exists to prevent.
    supabase
      .from('qc_inspections')
      .select('id, status, inspected_at, created_at, notes, inspector_id')
      .eq('project_id', project.id)
      .eq('inspection_type', 'material')
      .order('created_at', { ascending: false }),
  ])

  if (inspectionError || materialError) return <FloorScanLoadFailed t={t} />

  const profiles = await getUserProfilesByIds(supabase, [
    project.pic_id,
    ...(subStageRows ?? []).map((s) => s.updated_by),
    ...(materialRows ?? []).map((m) => m.inspector_id),
  ])
  const nameOf = (id: string | null) =>
    id ? formatMemberName(profiles.get(id), t('updateUnreported')) : null

  const inspectionsBySubStage = new Map<
    string,
    Array<{ result: 'pass' | 'fail'; date: string; notes: string | null }>
  >()
  for (const row of inspectionRows ?? []) {
    if (row.status !== 'pass' && row.status !== 'fail') continue
    const key = row.progress_cell_id as string
    const list = inspectionsBySubStage.get(key) ?? []
    list.push({
      result: row.status,
      date: row.inspected_at ?? row.created_at,
      notes: row.notes ?? null,
    })
    inspectionsBySubStage.set(key, list)
  }

  // §12.2a — which system opens. The scan resolved the FLOOR; this resolves
  // the system, without touching the label, the route or the scan (§4.1).
  const phoneSystems = (phoneSystemRows ?? []).map((sys) => {
    const covers = (phoneCoverage ?? []).some(
      (c) => c.project_system_id === sys.id && c.floor_id === floor.id,
    )
    return {
      id: sys.id,
      name: sys.name,
      coversThisFloor: covers,
      coversLabels: floorLabelsBySystem.get(sys.id) ?? [],
    }
  })

  // §12.2a names the PIC in two places — the "not on this floor" list and
  // the no-coverage empty state — because they are the person who can fix
  // it, and a crew on a floor should not have to ask who that is.
  const picLabel = nameOf(project.pic_id)

  // §12.2a — "its state in words": "1 of 5 done · Vuthy Long · 3d on second
  // fix", or "Not started". Built from the cells already loaded, so the
  // picker cannot disagree with the rows behind it.
  // §12.2a — "systems with work waiting for QC come first". Awaiting QC is
  // the §11.1 derivation: marked done, with no inspection yet. Counted from
  // the same rows the picker shows, so the order and the states agree.
  const awaitingQcBySystem = new Map<string, number>()
  const awaitingSubStagesBySystem = new Map<string, string[]>()
  for (const c of subStageRows ?? []) {
    if (c.status !== 'done') continue
    if ((inspectionsBySubStage.get(c.id) ?? []).length > 0) continue
    awaitingQcBySystem.set(
      c.project_system_id,
      (awaitingQcBySystem.get(c.project_system_id) ?? 0) + 1,
    )
    // §12.8 — named, not just counted: "2 awaiting QC" without saying
    // which two is a number an inspector then has to go looking for.
    awaitingSubStagesBySystem.set(c.project_system_id, [
      ...(awaitingSubStagesBySystem.get(c.project_system_id) ?? []),
      t(SUB_STAGE_KEYS[c.sub_stage] ?? 'subStageFirstFix'),
    ])
  }
  function systemStateLine(systemId: string): string {
    const cells = (subStageRows ?? []).filter((c) => c.project_system_id === systemId)
    if (cells.length === 0) return t('phoneSystemNotStarted')

    const done = cells.filter((c) => c.status === 'done').length
    if (done === 0 && cells.every((c) => c.status === 'not_started')) {
      return t('phoneSystemNotStarted')
    }

    const openCell = cells
      .filter((c) => c.status === 'in_progress')
      .sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''))[0]

    const parts = [`${done} ${t('phoneSystemDoneMiddle')} ${cells.length} ${t('phoneSystemDoneSuffix')}`]
    if (openCell) {
      const who = nameOf(openCell.updated_by)
      if (who) parts.push(who)
      if (openCell.updated_at) {
        parts.push(
          `${daysSinceICT(openCell.updated_at)}d ${t('phoneSystemOnPrefix')} ${t(
            SUB_STAGE_KEYS[openCell.sub_stage] ?? 'subStageFirstFix',
          )}`,
        )
      }
    }
    return parts.join(' · ')
  }

  const choice = chooseSystem({
    systems: phoneSystems,
    fromUrl: systemFromUrl ?? null,
    // The session's own memory lives in the client (sessionStorage); the
    // server only ever sees what the URL carries. That keeps this render
    // deterministic and cacheable, and the client writes the URL on choice.
    remembered: null,
  })

  const activeSystemId =
    choice.kind === 'only' || choice.kind === 'remembered' ? choice.systemId : null

  const subStages: PhoneSubStageInput[] = (subStageRows ?? [])
    .filter((s) => activeSystemId === null || s.project_system_id === activeSystemId)
    .map((s) => ({
    id: s.id,
    stage: s.stage as Stage,
    subStage: s.sub_stage,
    sequence: s.sequence,
    status: s.status as PhoneSubStageInput['status'],
    photoUrl: s.photo_url,
    updatedAt: s.updated_at,
    updatedByName: nameOf(s.updated_by),
    inspections: inspectionsBySubStage.get(s.id) ?? [],
  }))

  const viewer = { teamCode: member?.teamCode ?? null }
  const rows = buildPhoneRows(subStages, viewer)
  const groups = groupPhoneRows(rows, viewer)

  const materialInspections = (materialRows ?? []).map((m) => ({
    id: m.id,
    result: m.status as string,
    date: m.inspected_at ?? m.created_at,
    inspectorName: nameOf(m.inspector_id),
  }))

  return (
    <>
      <Breadcrumbs ancestors={floorScanAncestors()} current={floor.label} />
      <div className="phone-floor">
        {/* §12.2 — the most important block on the page. */}
        <div className="phone-floor-header">
          <div className="phone-floor-header__kicker">{t('phoneFloorHeaderKicker')}</div>
          <h1 className="phone-floor-header__floor-name">{floor.label}</h1>
          <div className="phone-floor-header__tower-project">
            {tower && <span className="phone-floor-header__tower">{tower.label}</span>}
            {tower && (
              <span className="phone-floor-header__separator" aria-hidden="true">
                ·
              </span>
            )}
            <span className="phone-floor-header__project">{project.name}</span>
          </div>
          <div className="phone-floor-header__so-system">
            {project.so_number ? (
              <span className="so-number">{project.so_number}</span>
            ) : (
              <span className="so-number so-number--pending">{t('soRecordNoSoYet')}</span>
            )}
            <span className="phone-floor-header__separator" aria-hidden="true">
              ·
            </span>
            <span className="stream-tag">{project.stream.toUpperCase()}</span>
          </div>
        </div>

        {/* §4.3 / §12.2a — BELOW the floor header, never above it. The
            first question after a scan is "did I scan the right label";
            the system is named clearly, and second. */}
        <SystemStep
          floorLabel={floor.label}
          systems={phoneSystems.map((sys) => ({
            id: sys.id,
            name: sys.name,
            coversThisFloor: sys.coversThisFloor,
            coversLabels: sys.coversLabels,
            stateLine: systemStateLine(sys.id),
            awaitingQc: awaitingQcBySystem.get(sys.id) ?? 0,
            awaitingSubStages: awaitingSubStagesBySystem.get(sys.id) ?? [],
          }))}
          chosenId={activeSystemId}
          picName={picLabel}
          isQcMember={viewer.teamCode === 'qc'}
          wrongFloor={
            choice.kind === 'picker_wrong_floor'
              ? { systemName: choice.systemName, coversLabels: choice.coversLabels }
              : null
          }
        />

        {activeSystemId !== null && (
        <FloorScanRows
          floorId={floor.id}
          floorLabel={floor.label}
          projectId={project.id}
          groups={groups}
          showQcNothingWaiting={showsQcNothingWaiting(groups, viewer)}
        />
        )}

        {/* §12.9 — outside the list, between two heavy rules, on grey.
            Never a sixth row. */}
        <section className="phone-material">
          <div className="phone-material__kicker">{t('phoneFloorMaterialKicker')}</div>
          <h2 className="phone-material__heading">{t('phoneFloorMaterialHeading')}</h2>
          <p className="phone-material__body">
            {t('phoneFloorMaterialBodyPrefix')} {project.name} {t('phoneFloorMaterialBodyMiddle')}{' '}
            {floor.label}.
          </p>

          <div className="phone-material__recorded">
            <div className="phone-material__recorded-title">
              {t('phoneFloorMaterialRecordedSoFar')}
            </div>
            {materialInspections.length === 0 ? (
              <p className="phone-material__none">
                {t('phoneFloorMaterialNonePrefix')} {project.name}{' '}
                {t('phoneFloorMaterialNoneSuffix')}
              </p>
            ) : (
              <ul className="phone-material__list">
                {materialInspections.map((m) => (
                  <li key={m.id} className="phone-material__item">
                    <span className="phone-material__result">{m.result}</span>
                    <span className="phone-material__meta">
                      {formatDateICT(m.date)}
                      {m.inspectorName ? ` · ${m.inspectorName}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Brief 100 §3 — the material inspection screen is NOT DRAWN in
              v7.2 §20, so this opens the honest "not built yet" page
              rather than nowhere, and rather than a design invented here. */}
          <Link href="/soon/material-inspection" className="phone-material__action">
            {t('phoneFloorMaterialAction')}
          </Link>
        </section>
      </div>
    </>
  )
}

function FloorScanLoadFailed({ t }: { t: (key: DictionaryKey) => string }) {
  return (
    <div className="phone-floor">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('phoneFloorLoadFailed')}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
