import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'
import { getAgeLabelBand } from '@/lib/age'
import { daysSinceICT } from '@/lib/format/datetime'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_EXECUTION } from '@/lib/breadcrumbs'
import { ScopeSync } from '@/components/ScopeSync'
import { CrossProjectList, type CrossListRow } from '@/components/CrossProjectList'
import { SCOPE_COOKIE } from '@/lib/scopeCookie'
import { defaultScopeForRole, type Scope } from '@/lib/reporting/board'
import { filterProjectsByScope, sortByAgeDescending } from '@/lib/reporting/crossProjectLists'
import { fetchFloorTrackData } from '@/lib/reporting/floorTrackData'
import { buildMatrixRows, type MatrixCellState } from '../projects/[projectId]/floor-matrix'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

export const metadata: Metadata = {
  title: 'Floor progress — ADTECH Workflow Tracker',
}

const COUNT_LABEL_KEYS: Partial<Record<MatrixCellState, DictionaryKey>> = {
  not_started: 'crossListFloorProgressNotStarted',
  in_progress: 'crossListFloorProgressInProgress',
  awaiting_qc: 'crossListFloorProgressAwaitingQc',
  qc_passed: 'crossListFloorProgressQcPassed',
  qc_failed: 'crossListFloorProgressQcFailed',
  stalled: 'crossListFloorProgressStalled',
}
const BAR_ORDER: MatrixCellState[] = ['not_started', 'in_progress', 'awaiting_qc', 'qc_passed', 'qc_failed', 'stalled']

/**
 * Brief 080 / Handoff Addendum v6.1 §2, §3 — the Floor progress
 * cross-project list. "One horizontal bar of ALL floor x sub-stage cells
 * for the project, segmented by state in matrix order and matrix fills
 * ... Never a second matrix on this page." This page calls floor-
 * matrix.ts's own buildMatrixRows() per project — the EXACT SAME
 * function and cell-state derivation the matrix itself uses (which
 * itself calls src/lib/subStageDisplayState.ts) — and only counts/
 * flattens the resulting cells into one bar. No cell state is derived a
 * second time anywhere in this file.
 */
export default async function FloorProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()
  if (!member) return null

  const cookieStore = await cookies()
  const persistedScope = cookieStore.get(SCOPE_COOKIE)?.value
  const scopeParam = Array.isArray(params.scope) ? params.scope[0] : params.scope
  const scope: Scope =
    scopeParam === 'mine' || scopeParam === 'my-team' || scopeParam === 'everything'
      ? scopeParam
      : persistedScope === 'mine' || persistedScope === 'my-team' || persistedScope === 'everything'
        ? persistedScope
        : defaultScopeForRole(member.role)

  const { data: projectRows } = await supabase.from('projects').select('id, name, so_number, pic_id').eq('status', 'open')
  const allProjects = (projectRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    soNumber: p.so_number as string | null,
    picId: p.pic_id as string | null,
  }))

  const { data: memberRows } = await supabase.from('members').select('user_id, team_id').eq('is_active', true)
  const teamIdByUserId = new Map((memberRows ?? []).map((m) => [m.user_id, m.team_id]))

  const scopedProjects = filterProjectsByScope(allProjects, scope, member, teamIdByUserId)

  // §4/§6 item 2 — ONE bulk fetch for every project in scope (see
  // fetchFloorTrackData's own header). NOT timed inline here: Date.now()
  // inside a Server Component's render is an impure call (React's own
  // render-purity rule correctly flags it — checked, not overridden).
  // Measured instead via a one-off script against the real database; see
  // this brief's Result doc for the actual number observed.
  const trackData = await fetchFloorTrackData(
    supabase,
    scopedProjects.map((p) => p.id),
  )

  const rows: CrossListRow[] = scopedProjects
    .filter((p) => (trackData.get(p.id)?.floors.length ?? 0) > 0) // no floors = nothing for the bar to show
    .map((project) => {
      const data = trackData.get(project.id)!
      const matrixRows = buildMatrixRows({
        towers: data.towers,
        floors: data.floors,
        subStages: data.subStages,
        latestInspectionBySubStageId: data.latestInspectionBySubStageId,
        daysSince: (isoDate) => daysSinceICT(isoDate),
        isStale: (days) => getAgeLabelBand(days) === 'stalled',
      })

      const counts: Record<MatrixCellState, number> = {
        not_applicable: 0,
        not_started: 0,
        in_progress: 0,
        awaiting_qc: 0,
        qc_passed: 0,
        qc_failed: 0,
        stalled: 0,
      }
      let oldestStalledAge = 0
      for (const row of matrixRows) {
        for (const cell of row.cells) {
          counts[cell.state]++
          if (cell.state === 'stalled' && cell.subStageId) {
            const subStage = data.subStages.find((s) => s.id === cell.subStageId)
            if (subStage) {
              const latest = data.latestInspectionBySubStageId.get(subStage.id) ?? null
              // Same clock-source rule as floor-matrix.ts's own
              // computeCellState (v6 §7.3): a cell whose underlying
              // display state was qc_failed clocks from the failed
              // inspection's date; every other stalled cell clocks from
              // the sub-stage's own status date. Re-checking which one
              // applies here (not re-deriving the STATE, which already
              // came from buildMatrixRows above) is unavoidable since
              // computeCellState's own return type is state-only.
              const clockDate = latest?.result === 'fail' ? latest.date : subStage.updatedAt
              oldestStalledAge = Math.max(oldestStalledAge, daysSinceICT(clockDate))
            }
          }
        }
      }

      const totalCells = BAR_ORDER.reduce((sum, s) => sum + counts[s], 0)

      return {
        projectId: project.id,
        projectName: project.name,
        soLabel: project.soNumber ?? t('soRecordNoSoYet'),
        soIsPending: !project.soNumber,
        ageDays: oldestStalledAge,
        ageBand: getAgeLabelBand(oldestStalledAge),
        href: `/projects/${project.id}?view=matrix`,
        summary: (
          <>
            <div className="cross-list__bar" aria-hidden="true">
              {BAR_ORDER.map(
                (state) =>
                  counts[state] > 0 && (
                    <span
                      key={state}
                      className={`floor-matrix__cell floor-matrix__cell--${state} cross-list__bar-segment`}
                      style={{ flex: counts[state] }}
                    />
                  ),
              )}
            </div>
            <div className="cross-list__bar-counts">
              {BAR_ORDER.filter((s) => counts[s] > 0)
                .map((s) => `${counts[s]} ${t(COUNT_LABEL_KEYS[s]!)}`)
                .join(' · ')}
              {totalCells === 0 && '—'}
            </div>
          </>
        ),
      }
    })

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_EXECUTION.label), href: CRUMB_EXECUTION.href }]}
        current={t('navExecFloorProgress')}
      />
      <ScopeSync scope={scope} />
      <CrossProjectList titleKey="navExecFloorProgress" scope={scope} basePath="/floor-progress" rows={sortByAgeDescending(rows)} t={t} />
    </>
  )
}
