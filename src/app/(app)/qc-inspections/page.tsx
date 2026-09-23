import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getUserProfilesByIds, formatMemberName } from '@/lib/auth/user-profiles'
import { getServerTranslator } from '@/lib/i18n/server'
import { getAgeLabelBand } from '@/lib/age'
import { daysSinceICT } from '@/lib/format/datetime'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_EXECUTION } from '@/lib/breadcrumbs'
import { ScopeSync } from '@/components/ScopeSync'
import { CrossProjectListHeader, CrossProjectListRows, type CrossListRow } from '@/components/CrossProjectList'
import { SCOPE_COOKIE } from '@/lib/scopeCookie'
import { defaultScopeForRole, type Scope } from '@/lib/reporting/board'
import { filterProjectsByScope, splitQcInspectionRows, type QcListRow } from '@/lib/reporting/crossProjectLists'
import { fetchFloorTrackData } from '@/lib/reporting/floorTrackData'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

export const metadata: Metadata = {
  title: 'QC inspections — ADTECH Workflow Tracker',
}

const SUB_STAGE_KEYS: Record<string, DictionaryKey> = {
  first_fix: 'subStageFirstFix',
  second_fix: 'subStageSecondFix',
  third_fix: 'subStageThirdFix',
  pre_commissioning: 'subStagePreCommissioning',
  commissioning: 'subStageCommissioning',
}

/**
 * Brief 080 / Handoff Addendum v6.1 §2, §4 — the QC inspections
 * cross-project list. THE ONE EXCEPTION IN LAYOUT (§4): splits into
 * "Waiting for inspection" (anything waiting or failed) and "Nothing
 * waiting" (everything else, still listed/clickable) — a heading, not a
 * filter, so an inspector can still reach a quiet project.
 *
 * Display state comes ONLY from src/lib/subStageDisplayState.ts via
 * fetchFloorTrackData's own resolveLatestInspection() call — this page
 * never re-derives "is this sub-stage awaiting/passed/failed" itself, so
 * it cannot disagree with the matrix or the desktop update screen
 * (Briefs 078/081).
 */
export default async function QcInspectionsPage({
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

  // Brief 094 §3.4 — a failed read here used to render identically to
  // "no projects assigned to you" (see CrossProjectListRows's own
  // loadError prop): both discarded their error and fell back to `?? []`.
  const { data: projectRows, error: projectRowsError } = await supabase
    .from('projects')
    .select('id, name, so_number, pic_id')
    .eq('status', 'open')
  if (projectRowsError) console.error('QcInspectionsPage: projects read failed', projectRowsError)

  const allProjects = (projectRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    soNumber: p.so_number as string | null,
    picId: p.pic_id as string | null,
  }))

  const { data: memberRows, error: memberRowsError } = await supabase
    .from('members')
    .select('user_id, team_id')
    .eq('is_active', true)
  if (memberRowsError) console.error('QcInspectionsPage: members read failed', memberRowsError)
  const teamIdByUserId = new Map((memberRows ?? []).map((m) => [m.user_id, m.team_id]))
  const loadError = Boolean(projectRowsError) || Boolean(memberRowsError)

  const scopedProjects = filterProjectsByScope(allProjects, scope, member, teamIdByUserId)
  const trackData = await fetchFloorTrackData(
    supabase,
    scopedProjects.map((p) => p.id),
  )

  // Brief 095 §4.3 — see installation/page.tsx's own identical comment.
  const picProfiles = await getUserProfilesByIds(
    supabase,
    scopedProjects.map((p) => p.picId),
  )

  const rows: (CrossListRow & QcListRow)[] = scopedProjects.map((project) => {
    const data = trackData.get(project.id)
    const doneSubStages = (data?.subStages ?? []).filter((s) => s.status === 'done')

    const waiting: { subStage: string; floorId: string; date: string }[] = []
    const failed: { subStage: string; floorId: string; date: string }[] = []
    for (const s of doneSubStages) {
      const latest = data?.latestInspectionBySubStageId.get(s.id) ?? null
      if (!latest) waiting.push({ subStage: s.subStage, floorId: s.floorId, date: s.updatedAt })
      else if (latest.result === 'fail') failed.push({ subStage: s.subStage, floorId: s.floorId, date: latest.date })
    }

    // Age key (addendum §2): "oldest wait of either kind." For a failed
    // item the clock runs from the failed inspection's own date (§7.3 /
    // Brief 078), not the status date — same convention every other
    // reader of qc_inspections in this app now uses.
    const allEntries = [...waiting, ...failed]
    const oldestEntry =
      allEntries.length > 0 ? allEntries.reduce((a, b) => (a.date < b.date ? a : b)) : null
    const ageDays = oldestEntry ? daysSinceICT(oldestEntry.date) : 0
    // Brief 095 §4.1/§3 — names the specific floor/sub-stage the age is
    // of; a "quiet" row (no waiting, no failed entries — split out into
    // its own group below) has genuinely nothing to clock.
    const oldestFloorLabel = oldestEntry ? (data?.floors.find((f) => f.id === oldestEntry.floorId)?.label ?? oldestEntry.floorId) : null
    const ageContext = oldestEntry
      ? `${oldestFloorLabel} · ${t(SUB_STAGE_KEYS[oldestEntry.subStage] ?? 'subStageFirstFix')}`
      : t('crossListAgeNothingWaiting')

    const namedWaiting = waiting.slice(0, 2).map((w) => t(SUB_STAGE_KEYS[w.subStage] ?? 'subStageFirstFix'))
    const extraWaiting = waiting.length - namedWaiting.length

    return {
      projectId: project.id,
      projectName: project.name,
      soLabel: project.soNumber ?? t('soRecordNoSoYet'),
      soIsPending: !project.soNumber,
      ageDays,
      ageBand: getAgeLabelBand(ageDays),
      holderLabel: project.picId ? formatMemberName(picProfiles.get(project.picId), t('membersNoProfile')) : t('dashboardUnassigned'),
      ageContext,
      href: `/projects/${project.id}/update`,
      waitingCount: waiting.length,
      failedCount: failed.length,
      summary: (
        <>
          {waiting.length > 0 && (
            <div className="cross-list__row-summary-line">
              {namedWaiting.join(', ')}
              {extraWaiting > 0 && ` +${extraWaiting}`} {t('crossListQcWaitingCount')}
            </div>
          )}
          {failed.length > 0 && (
            <div className="cross-list__row-summary-line cross-list__row-summary-line--qc-failed">
              <span className="cross-list__cell cross-list__cell--qc-failed" aria-hidden="true" />
              {failed.length} {t('crossListQcFailedCount')}
            </div>
          )}
        </>
      ),
    }
  })

  const { waiting: waitingRows, quiet: quietRows } = splitQcInspectionRows(rows)

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_EXECUTION.label), href: CRUMB_EXECUTION.href }]}
        current={t('navExecQcInspections')}
      />
      <ScopeSync scope={scope} />
      <div className="cross-list">
        <CrossProjectListHeader titleKey="navExecQcInspections" scope={scope} basePath="/qc-inspections" t={t} />
        {loadError || rows.length === 0 ? (
          <CrossProjectListRows scope={scope} rows={[]} t={t} loadError={loadError} />
        ) : (
          <>
            <h2 className="cross-list__group-heading">{t('crossListQcWaitingHeading')}</h2>
            <CrossProjectListRows scope={scope} rows={waitingRows} t={t} />
            <h2 className="cross-list__group-heading">{t('crossListQcQuietHeading')}</h2>
            <CrossProjectListRows scope={scope} rows={quietRows} t={t} />
          </>
        )}
      </div>
    </>
  )
}
