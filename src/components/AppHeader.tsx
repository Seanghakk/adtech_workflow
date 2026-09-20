import { LanguageToggle } from './LanguageToggle'
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
 */
export function AppHeader({ member }: { member: CurrentMember }) {
  return (
    <header className="app-header">
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
