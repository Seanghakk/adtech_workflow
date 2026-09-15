import Link from 'next/link'
import { LanguageToggle } from './LanguageToggle'
import { SignOutButton } from './SignOutButton'
import type { CurrentMember } from '@/lib/auth/current-member'
import { isSalesTeamMember } from '@/lib/auth/sales-roles'

/**
 * App shell nav.
 *
 * Brand mark — Visual Round Restyle §3.5 / Design Note Rev 3 §3: "Two
 * flush rectangles, blue then ink, no gap and no radius, ADTECH in the
 * heaviest weight with the app name beside it in regular." Replaces the
 * old bordered .brand-box here (that markup stays on the login screen —
 * see globals.css's own note on why that screen isn't touched this
 * round). Block order never changes; only the second word does, and the
 * docs' own worked example for this app is "ADTECH Workflow" — dropping
 * "Tracker" from what was here before, flagged in this brief's Result.
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
      <Link href="/" className="brand-mark">
        <span className="brand-mark__blocks" aria-hidden="true">
          <span className="brand-mark__block brand-mark__block--blue" />
          <span className="brand-mark__block brand-mark__block--ink" />
        </span>
        <span className="brand-mark__text">
          <span className="brand-mark__name">ADTECH</span>
          <span className="brand-mark__app">Workflow</span>
        </span>
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
