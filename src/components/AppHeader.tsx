import Link from 'next/link'
import { LanguageToggle } from './LanguageToggle'
import { SignOutButton } from './SignOutButton'
import type { CurrentMember } from '@/lib/auth/current-member'
import { isSalesTeamMember } from '@/lib/auth/sales-roles'

/**
 * App shell nav. README, Assets: "No logo file — the ADTECH name renders
 * as plain text in a 2px ink box, no wordmark."
 *
 * ADTECH_WF_Brief_003_Sales_Roles: the /sales link only renders for the
 * two tiers it's actually for (Sales Engineer/Supervisor) — everyone
 * else already has their own full, unrestricted view of every project
 * via "/", so a second link to the same underlying data would be
 * confusing rather than useful. Not translated, same as this component's
 * own brand text above it — this file has never run any of its static
 * strings through the dictionary.
 */
export function AppHeader({ member }: { member: CurrentMember }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand-box brand-box--compact">
        <span className="brand-box__name">ADTECH</span>
        <span className="brand-box__kicker">Workflow Tracker</span>
      </Link>
      <div className="app-header__identity">
        <span className="app-header__owner-box">
          {(member.fullName ?? member.username ?? member.email ?? '—').toUpperCase()}
        </span>
        <span className="app-header__team">{member.teamLabelEn}</span>
      </div>
      {isSalesTeamMember(member) && (
        <nav className="app-header__nav">
          <Link href="/sales">Maintenance clients</Link>
        </nav>
      )}
      {(member.role === 'manager' || member.role === 'admin') && (
        // Fable Brief 002 §2/§3 — the reviewer board and load screens are
        // built for whoever is running the weekly reporting review, same
        // gating precedent as /sales above: everyone else already has a
        // full, unrestricted view of their own work via "/", so a second
        // link to the same underlying data would add noise, not access
        // (the underlying RLS scoping is unchanged either way — this is
        // a navigation judgment call, not a security boundary. See
        // Result 003).
        <nav className="app-header__nav">
          <Link href="/exceptions">Exceptions</Link>
          <Link href="/load">Load</Link>
        </nav>
      )}
      <div className="app-header__actions">
        <LanguageToggle />
        <SignOutButton />
      </div>
    </header>
  )
}
