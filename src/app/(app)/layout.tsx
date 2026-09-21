import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { AppHeader } from '@/components/AppHeader'
import { AppSidebar } from '@/components/AppSidebar'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import { ADMIN_GROUP_EXPANDED_COOKIE, EXECUTION_SUBTREE_EXPANDED_COOKIE } from '@/lib/sidebarCookieNames'
import { daysSinceICT } from '@/lib/format/datetime'
import { buildExceptionGroups, countInExceptionGroups, type ExceptionProject } from '@/lib/reporting/exceptions'

/**
 * The access gate lives here (Brief 002 §5.1) — every route under the
 * (app) route group passes through this layout. src/proxy.ts already
 * redirects a request with no Supabase session to /login, but a session
 * is not access: this is where the workflow.members check happens, and
 * where "no access" renders as a real screen rather than a redirect.
 */
export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const { user, member } = await getCurrentMember()

  // Belt-and-suspenders on top of src/proxy.ts — see current-member.ts's
  // comment on why this is checked again here rather than trusted from
  // Proxy alone. In practice src/proxy.ts already redirected this case.
  if (!user) {
    return <NoAccessScreen />
  }

  if (!member) {
    return <NoAccessScreen />
  }

  // Brief 064 §2.5 — same mechanism Brief 043 item 1 built for the old
  // sidebar-collapsed cookie (see useSidebarCollapsed.ts's own header),
  // now also reading the Admin-group-expanded cookie so this Server
  // Component's own SSR output already matches the client's persisted
  // preference. Undefined (no cookie yet) falls through to
  // useAdminGroupExpanded()'s own client-side default (collapsed).
  const cookieStore = await cookies()
  const adminCookie = cookieStore.get(ADMIN_GROUP_EXPANDED_COOKIE)?.value
  const initialAdminExpanded = adminCookie === undefined ? undefined : adminCookie === '1'
  // Brief 067 §3 — same mechanism, the Execution subtree's own cookie.
  const executionCookie = cookieStore.get(EXECUTION_SUBTREE_EXPANDED_COOKIE)?.value
  const initialExecutionExpanded = executionCookie === undefined ? undefined : executionCookie === '1'

  const isManager = isManagerOrAdmin(member)

  // Brief 067 §3 — the "Delays & blockers" subtree item's own count
  // badge (v5 §2.3), computed on EVERY page load since the rail renders
  // everywhere, not just on that page. Deliberately the SAME
  // buildExceptionGroups/countInExceptionGroups the renamed page itself
  // now calls (lib/reporting/exceptions.ts) — one shared definition, so
  // this number can never quietly disagree with what that page shows.
  // Minimal column selection (only what classification needs, not the
  // display-only name/soNumber/stream fields that page also selects).
  const supabase = await createClient()
  const [{ data: badgeProjectRows }, { data: badgeProgressRows }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, pic_id, percent_complete, last_meaningful_movement_at, opened_at')
      .eq('status', 'open'),
    supabase
      .from('progress_updates')
      .select('subject_id')
      .eq('subject_type', 'project'),
  ])
  const reportedProjectIds = new Set((badgeProgressRows ?? []).map((r) => r.subject_id))
  const badgeExceptionProjects: ExceptionProject[] = (badgeProjectRows ?? []).map((p) => ({
    id: p.id,
    name: '',
    stream: '',
    soNumber: null,
    percentComplete: p.percent_complete,
    picId: p.pic_id,
    stallDays: daysSinceICT(p.last_meaningful_movement_at ?? p.opened_at),
    hasReasonOnFile: reportedProjectIds.has(p.id),
  }))
  const delaysAndBlockersCount = countInExceptionGroups(buildExceptionGroups(badgeExceptionProjects))

  return (
    <div className="app-shell">
      <AppHeader
        member={member}
        isManager={isManager}
        initialAdminExpanded={initialAdminExpanded}
        initialExecutionExpanded={initialExecutionExpanded}
        delaysAndBlockersCount={delaysAndBlockersCount}
      />
      <div className="app-shell__body">
        <AppSidebar
          isManager={isManager}
          initialAdminExpanded={initialAdminExpanded}
          initialExecutionExpanded={initialExecutionExpanded}
          delaysAndBlockersCount={delaysAndBlockersCount}
        />
        <main className="app-shell__main">{children}</main>
      </div>
    </div>
  )
}
