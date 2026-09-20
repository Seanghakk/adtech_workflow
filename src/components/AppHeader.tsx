import { LanguageToggle } from './LanguageToggle'
import { NavDrawer } from './NavDrawer'
import { SignOutButton } from './SignOutButton'
import type { CurrentMember } from '@/lib/auth/current-member'

/**
 * App shell topbar — identity, language/sign-out. Brief 039 §1 moved
 * every actual nav link out of here and into AppSidebar.tsx's side nav;
 * src/lib/nav.ts is the source of truth for that structure now.
 *
 * Brief 064 §2.1 — the brand mark (ADTECH Workflow wordmark + two-bar
 * block) MOVED into the new journey rail (AppSidebar.tsx), per v5's own
 * explicit "Brand block" spec for the rail. Removed from here rather
 * than kept in both places: v5 says nothing about a second copy in this
 * topbar, and rendering it twice on one screen would read as a mistake,
 * not a design choice — this file keeps identity/language/sign-out
 * only, unchanged otherwise. Its own "/" home link is preserved: the
 * rail's own brand mark carries that exact same behaviour forward
 * (confirmed by reading this file before removing anything from it —
 * the mark already linked home here, so nothing about that behaviour is
 * new, only where it lives).
 *
 * Brief 065 — NavDrawer's own trigger button lives here (v5/Brief 064
 * §4's own words: "a trigger control in the existing top bar"). CSS-
 * hidden at and above the drawer breakpoint (NavDrawer.tsx's own
 * header has the full reasoning) — this file itself needs no
 * conditional logic, isManager/initialAdminExpanded are the exact
 * same values (app)/layout.tsx already computes for the desktop rail.
 */
export function AppHeader({
  member,
  isManager,
  initialAdminExpanded,
}: {
  member: CurrentMember
  isManager: boolean
  initialAdminExpanded?: boolean
}) {
  return (
    <header className="app-header">
      <NavDrawer isManager={isManager} initialAdminExpanded={initialAdminExpanded} />
      <div className="app-header__identity">
        <span className="app-header__owner-box">
          {(member.fullName ?? member.username ?? member.email ?? '—').toUpperCase()}
        </span>
        <span className="app-header__team">{member.teamLabelEn}</span>
      </div>
      <span style={{ marginLeft: 'auto' }} />
      <div className="app-header__actions">
        <LanguageToggle />
        <SignOutButton />
      </div>
    </header>
  )
}
