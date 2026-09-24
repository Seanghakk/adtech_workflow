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
export default async function FloorScanPage({ params }: { params: Promise<{ floorId: string }> }) {
  const { floorId } = await params

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
      .select('id, name, so_number, stream')
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
  const { data: subStageRows, error: subStageError } = await supabase
    .from('floor_sub_stages')
    .select('id, stage, sub_stage, sequence, status, photo_url, updated_at, updated_by')
    .eq('floor_id', floor.id)

  if (subStageError) return <FloorScanLoadFailed t={t} />

  const subStageIds = (subStageRows ?? []).map((s) => s.id)

  const [
    { data: inspectionRows, error: inspectionError },
    { data: materialRows, error: materialError },
  ] = await Promise.all([
    subStageIds.length
      ? supabase
          .from('qc_inspections')
          .select('floor_sub_stage_id, status, inspected_at, created_at, notes')
          .in('floor_sub_stage_id', subStageIds)
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
    const key = row.floor_sub_stage_id as string
    const list = inspectionsBySubStage.get(key) ?? []
    list.push({
      result: row.status,
      date: row.inspected_at ?? row.created_at,
      notes: row.notes ?? null,
    })
    inspectionsBySubStage.set(key, list)
  }

  const subStages: PhoneSubStageInput[] = (subStageRows ?? []).map((s) => ({
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

        <FloorScanRows
          floorId={floor.id}
          floorLabel={floor.label}
          projectId={project.id}
          groups={groups}
          showQcNothingWaiting={showsQcNothingWaiting(groups, viewer)}
        />

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
