import { getCurrentMember } from '@/lib/auth/current-member'
import { AppHeader } from '@/components/AppHeader'
import { NoAccessScreen } from '@/components/NoAccessScreen'

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

  return (
    <div className="app-shell">
      <AppHeader member={member} />
      <main className="app-shell__main">{children}</main>
    </div>
  )
}
