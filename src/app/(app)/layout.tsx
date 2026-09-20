import { cookies } from 'next/headers'
import { getCurrentMember } from '@/lib/auth/current-member'
import { AppHeader } from '@/components/AppHeader'
import { AppSidebar } from '@/components/AppSidebar'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import { ADMIN_GROUP_EXPANDED_COOKIE } from '@/lib/sidebarCookieNames'

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

  return (
    <div className="app-shell">
      <AppHeader member={member} />
      <div className="app-shell__body">
        <AppSidebar isManager={isManagerOrAdmin(member)} initialAdminExpanded={initialAdminExpanded} />
        <main className="app-shell__main">{children}</main>
      </div>
    </div>
  )
}
