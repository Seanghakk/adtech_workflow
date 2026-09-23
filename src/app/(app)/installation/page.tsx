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
import { bucketFloorsByStage } from '@/lib/reporting/floorStageBuckets'

export const metadata: Metadata = {
  title: 'Installation — ADTECH Workflow Tracker',
}

const INSTALLATION_ORDER = ['first_fix', 'second_fix', 'third_fix']

/**
 * Brief 080 / Handoff Addendum v6.1 §2 — Installation cross-project list.
 * DESTINATION (addendum §6 blocking question 1): /projects/[projectId]?
 * view=matrix. No dedicated Installation route exists anywhere in this
 * app — confirmed by src/lib/nav.ts's own extensive (A)/(B)/(C) route
 * classification (its own header, case (C): "Installation... checked
 * directly, no dedicated route exists anywhere, global or per-project
 * ... live only as SECTIONS inside /projects/[projectId]/update's own
 * floor breakdown panel, never promoted to a route of their own"). The
 * matrix is genuinely the best existing destination — using it here, not
 * building a new per-project screen.
 *
 * Bucket rule ("floor counts at first/second/third fix, plus not
 * started, plus complete") — see floorStageBuckets.ts's own header
 * (Brief 082 §2 added the 'complete' bucket so counts sum to the
 * project's real floor total).
 */
export default async function InstallationPage({
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
  if (projectRowsError) console.error('InstallationPage: projects read failed', projectRowsError)
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
  if (memberRowsError) console.error('InstallationPage: members read failed', memberRowsError)
  const teamIdByUserId = new Map((memberRows ?? []).map((m) => [m.user_id, m.team_id]))
  const loadError = Boolean(projectRowsError) || Boolean(memberRowsError)

  const scopedProjects = filterProjectsByScope(allProjects, scope, member, teamIdByUserId)
  const trackData = await fetchFloorTrackData(
    supabase,
    scopedProjects.map((p) => p.id),
  )

  const rows: CrossListRow[] = scopedProjects
    .filter((p) => (trackData.get(p.id)?.floors.length ?? 0) > 0)
    .map((project) => {
      const data = trackData.get(project.id)!
      const buckets = bucketFloorsByStage(
        data.subStages,
        data.floors.map((f) => f.id),
        INSTALLATION_ORDER,
      )
      // Brief 082 §2 — 'complete' added so counts sum to the project's
      // real floor total (previously a fully-finished floor was dropped
      // entirely — the AD9001-26S bug: 5 counted of 6).
      const counts = { not_started: 0, first_fix: 0, second_fix: 0, third_fix: 0, complete: 0 }
      let oldestAge = 0
      for (const b of buckets) {
        counts[b.bucket as keyof typeof counts]++
        // A complete floor has nothing stuck — excluded from the age key
        // (floorStageBuckets.ts's own header, Brief 082 §2).
        if (b.bucket !== 'complete') oldestAge = Math.max(oldestAge, daysSinceICT(b.stuckSince))
      }

      return {
        projectId: project.id,
        projectName: project.name,
        soLabel: project.soNumber ?? t('soRecordNoSoYet'),
        soIsPending: !project.soNumber,
        ageDays: oldestAge,
        ageBand: getAgeLabelBand(oldestAge),
        href: `/projects/${project.id}?view=matrix`,
        summary: (
          <div className="cross-list__row-summary-line">
            {counts.not_started} {t('crossListInstallationNotStarted')} · {counts.first_fix}{' '}
            {t('crossListInstallationFirstFix')} · {counts.second_fix} {t('crossListInstallationSecondFix')} ·{' '}
            {counts.third_fix} {t('crossListInstallationThirdFix')} · {counts.complete}{' '}
            {t('crossListInstallationComplete')}
          </div>
        ),
      }
    })

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_EXECUTION.label), href: CRUMB_EXECUTION.href }]}
        current={t('navExecInstallation')}
      />
      <ScopeSync scope={scope} />
      <CrossProjectList
        titleKey="navExecInstallation"
        scope={scope}
        basePath="/installation"
        rows={sortByAgeDescending(rows)}
        t={t}
        loadError={loadError}
      />
    </>
  )
}
