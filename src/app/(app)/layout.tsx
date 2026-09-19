import { cookies } from 'next/headers'
import { getCurrentMember } from '@/lib/auth/current-member'
import { AppHeader } from '@/components/AppHeader'
import { AppSidebar } from '@/components/AppSidebar'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { isSalesTeamMember } from '@/lib/auth/sales-roles'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import { SIDEBAR_COLLAPSED_COOKIE } from '@/lib/sidebarCookieNames'

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

  // Brief 043 item 1 — read the same cookie useSidebarCollapsed.ts's
  // toggle() writes, so this Server Component's own SSR output already
  // matches the client's persisted preference. Undefined (no cookie yet)
  // falls through to that hook's own client-side default/localStorage
  // handling unchanged — see its header for the full mechanism.
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get(SIDEBAR_COLLAPSED_COOKIE)?.value
  const initialSidebarCollapsed = sidebarCookie === undefined ? undefined : sidebarCookie === '1'

  return (
    <div className="app-shell">
      <AppHeader member={member} />
      <div className="app-shell__body">
        <AppSidebar
          isSales={isSalesTeamMember(member)}
          isManager={isManagerOrAdmin(member)}
          initialCollapsed={initialSidebarCollapsed}
        />
        <main className="app-shell__main">{children}</main>
      </div>
    </div>
  )
}
