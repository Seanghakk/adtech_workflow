import Link from 'next/link'
import { LanguageToggle } from './LanguageToggle'
import { SignOutButton } from './SignOutButton'
import type { CurrentMember } from '@/lib/auth/current-member'

/**
 * App shell topbar — logo, identity, language/sign-out. Brief 039 §1
 * moved every actual nav link (the old three role-gated <nav> blocks:
 * unconditional, sales-only, manager/admin-only) out of here and into
 * AppSidebar.tsx's collapsible side nav, mirroring the CMMS's own split
 * between HubNav's topbar row and its sidebar. src/lib/nav.ts is now the
 * single source of truth for that link list and its access gating
 * (canSeeNavEntry) — see that file for the exact per-brief reasoning
 * each entry used to carry inline in this file's old <nav> blocks.
 *
 * Brand mark — Visual Round Restyle §3.5 / Design Note Rev 3 §3: "Two
 * flush rectangles, blue then ink, no gap and no radius, ADTECH in the
 * heaviest weight with the app name beside it in regular." Replaces the
 * old bordered .brand-box here (that markup stays on the login screen —
 * see globals.css's own note on why that screen isn't touched this
 * round). Block order never changes; only the second word does, and the
 * docs' own worked example for this app is "ADTECH Workflow" — dropping
 * "Tracker" from what was here before, flagged in this brief's Result.
 * "ADTECH" and "Workflow" are the brand mark itself, not run through the
 * dictionary — same treatment as the technical nouns Design Note §4.9
 * says stay upright English always (SO, BOQ, PIC, ...); a product name
 * isn't translated any more than those are.
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
      <span style={{ marginLeft: 'auto' }} />
      <div className="app-header__actions">
        <LanguageToggle />
        <SignOutButton />
      </div>
    </header>
  )
}
