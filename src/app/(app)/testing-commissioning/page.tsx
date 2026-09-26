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
import { CrossProjectList, type CrossListRow } from '@/components/CrossProjectList'
import { SCOPE_COOKIE } from '@/lib/scopeCookie'
import { defaultScopeForRole, type Scope } from '@/lib/reporting/board'
import { filterProjectsByScope, sortByAgeDescending } from '@/lib/reporting/crossProjectLists'
import { fetchFloorTrackData, systemOfOldestItem } from '@/lib/reporting/floorTrackData'
import { bucketFloorsByStage } from '@/lib/reporting/floorStageBuckets'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

export const metadata: Metadata = {
  title: 'Testing & commissioning — ADTECH Workflow Tracker',
}

const TNC_ORDER = ['pre_commissioning', 'commissioning']

// Same convention as installation/page.tsx's own local copy — see that
// file's own comment for why this is duplicated per file rather than
// shared.
const SUB_STAGE_KEYS: Record<string, DictionaryKey> = {
  pre_commissioning: 'subStagePreCommissioning',
  commissioning: 'subStageCommissioning',
}

/**
 * Brief 080 / Handoff Addendum v6.1 §2 — Testing & commissioning
 * cross-project list. DESTINATION (addendum §6 blocking question 1):
 * /projects/[projectId]?view=matrix — same reasoning as Installation's
 * own page header (nav.ts's own case (C) classification; no dedicated
 * route exists anywhere for this track either).
 *
 * Summary, REVISED BY BRIEF 082 §2: "floors pre-commissioned /
 * commissioning / complete" — the SAME bucket shape as Installation
 * (floorStageBuckets.ts, TNC_ORDER = [pre_commissioning, commissioning]),
 * summing to the project's real floor total. Brief 080's original version
 * hand-rolled a separate "commissioned" (= all tnc sub-stages done) case
 * outside floorStageBuckets' own buckets, because that function used to
 * drop fully-done floors entirely; now that floorStageBuckets itself
 * buckets a fully-done floor as 'complete' (Brief 082 §2), this page
 * reuses that bucket directly instead of re-deriving "all done" a second
 * time here.
 *
 * "Awaiting QC" is kept as a SUBSET annotation on the complete count
 * (not a fourth disjoint bucket — the three main buckets alone already
 * sum to the floor total, per Brief 082's own sums-to-total rule), via
 * the shared display-state rule directly (a commissioning sub-stage
 * that is 'done' with no pass/fail inspection yet) — the SAME function
 * the matrix and QC inspections list call, not re-derived.
 */
export default async function TestingCommissioningPage({
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
  if (projectRowsError) console.error('TestingCommissioningPage: projects read failed', projectRowsError)
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
  if (memberRowsError) console.error('TestingCommissioningPage: members read failed', memberRowsError)
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

  const rows: CrossListRow[] = scopedProjects
    .filter((p) => (trackData.get(p.id)?.floors.length ?? 0) > 0)
    .map((project) => {
      const data = trackData.get(project.id)!
      const tncSubStages = data.subStages.filter((s) => s.stage === 'tnc')
      const buckets = bucketFloorsByStage(tncSubStages, data.floors.map((f) => f.id), TNC_ORDER)

      // Brief 082 §2 — the three buckets sum to the project's real floor
      // total; 'complete' replaces the old hand-rolled "commissioned"
      // case (see this file's own header).
      const counts = { pre_commissioning: 0, commissioning: 0, complete: 0 }
      let awaitingQc = 0
      // Brief 095 §4.1/§3 — see installation/page.tsx's own identical
      // comment on why oldestFloorId/oldestBucketKey are tracked
      // separately from oldestAge itself.
      let oldestAge = 0
      let oldestFloorId: string | null = null
      let oldestBucketKey: string | null = null
      for (const b of buckets) {
        counts[b.bucket as keyof typeof counts]++
        if (b.bucket === 'complete') {
          // Subset annotation, not a fourth bucket (see this file's own
          // header) — the commissioning sub-stage's own shared display
          // state: awaiting_qc means done with no pass/fail inspection yet.
          const rowsForFloor = tncSubStages.filter((s) => s.floorId === b.floorId)
          const commissioningRow = rowsForFloor.find((r) => r.subStage === 'commissioning')
          if (commissioningRow && !data.latestInspectionBySubStageId.get(commissioningRow.id)) {
            awaitingQc++
          }
        } else {
          // A complete floor has nothing stuck — excluded from the age
          // key (floorStageBuckets.ts's own header, Brief 082 §2).
          const age = daysSinceICT(b.stuckSince)
          if (oldestFloorId === null || age > oldestAge) {
            oldestAge = age
            oldestFloorId = b.floorId
            oldestBucketKey = b.bucket
          }
        }
      }
      const oldestFloorLabel = oldestFloorId ? (data.floors.find((f) => f.id === oldestFloorId)?.label ?? oldestFloorId) : null
      // §10.1 (D096) — name WHICH system the age belongs to, but only on a
      // project that has more than one. The row itself stays one per
      // project; this is the system appearing where it answers a question.
      const oldestSystemName = systemOfOldestItem(data, oldestFloorId, oldestBucketKey)
      const ageContext =
        oldestFloorId === null
          ? t('crossListAgeNothingWaiting')
          : oldestBucketKey === 'not_started'
            ? `${oldestFloorLabel}${oldestSystemName ? ` · ${oldestSystemName}` : ''} · ${t('statusNotStarted')}`
            : `${oldestFloorLabel}${oldestSystemName ? ` · ${oldestSystemName}` : ''} · ${t(SUB_STAGE_KEYS[oldestBucketKey!] ?? 'subStageFirstFix')}`

      return {
        projectId: project.id,
        projectName: project.name,
        soLabel: project.soNumber ?? t('soRecordNoSoYet'),
        soIsPending: !project.soNumber,
        ageDays: oldestAge,
        ageBand: getAgeLabelBand(oldestAge),
        holderLabel: project.picId ? formatMemberName(picProfiles.get(project.picId), t('membersNoProfile')) : t('dashboardUnassigned'),
        ageContext,
        href: `/projects/${project.id}?view=matrix`,
        summary: (
          <div className="cross-list__row-summary-line">
            {counts.pre_commissioning} {t('crossListTncPreCommissioning')} · {counts.commissioning}{' '}
            {t('crossListTncCommissioning')} · {counts.complete} {t('crossListTncComplete')}
            {awaitingQc > 0 ? <> ({awaitingQc} {t('crossListTncAwaitingQc')})</> : null}
          </div>
        ),
      }
    })

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_EXECUTION.label), href: CRUMB_EXECUTION.href }]}
        current={t('navExecTestingCommissioning')}
      />
      <ScopeSync scope={scope} />
      <CrossProjectList
        titleKey="navExecTestingCommissioning"
        scope={scope}
        basePath="/testing-commissioning"
        rows={sortByAgeDescending(rows)}
        t={t}
        loadError={loadError}
      />
    </>
  )
}
