import Link from 'next/link'
import { LanguageToggle } from './LanguageToggle'
import { SignOutButton } from './SignOutButton'
import type { CurrentMember } from '@/lib/auth/current-member'
import { isSalesTeamMember } from '@/lib/auth/sales-roles'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import { getServerTranslator } from '@/lib/i18n/server'

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
 * "ADTECH" and "Workflow" are the brand mark itself, not run through the
 * dictionary — same treatment as the technical nouns Design Note §4.9
 * says stay upright English always (SO, BOQ, PIC, ...); a product name
 * isn't translated any more than those are.
 *
 * ADTECH_WF_Brief_003_Sales_Roles: the /sales link only renders for the
 * two tiers it's actually for (Sales Engineer/Supervisor) — everyone
 * else already has their own full, unrestricted view of every project
 * via "/", so a second link to the same underlying data would be
 * confusing rather than useful.
 *
 * Brief 010 §6 — this file's own nav links used to be hardcoded English,
 * bypassing the dictionary entirely even though navSales/navExceptions/
 * navLoad already existed as keys (SignOutButton, right beside this,
 * already used t('navSignOut') correctly). Fixed here: async Server
 * Component, same pattern as exceptions/page.tsx's getServerTranslator().
 */
export async function AppHeader({ member }: { member: CurrentMember }) {
  const t = await getServerTranslator()

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
      {/* Brief 015 §4 — any active member, no role gate: posting a request
          is meant to be as easy as sending a Telegram message, so this
          link is unconditional, unlike the two role-gated <nav> blocks
          below it. */}
      <nav className="app-header__nav">
        <Link href="/requests/new">{t('navRequests')}</Link>
      </nav>
      {isSalesTeamMember(member) && (
        <nav className="app-header__nav">
          <Link href="/sales">{t('navSales')}</Link>
        </nav>
      )}
      {isManagerOrAdmin(member) && (
        // Fable Brief 002 §2/§3 — the reviewer board and load screens are
        // built for whoever is running the weekly reporting review, same
        // gating precedent as /sales above: everyone else already has a
        // full, unrestricted view of their own work via "/", so a second
        // link to the same underlying data would add noise, not access
        // (the underlying RLS scoping is unchanged either way — this is
        // a navigation judgment call, not a security boundary. See
        // Result 003). /users (Brief 012 §2.7) joins this same group —
        // an actual access boundary this time (workflow.members writes),
        // not just a navigation one.
        <nav className="app-header__nav">
          <Link href="/exceptions">{t('navExceptions')}</Link>
          <Link href="/load">{t('navLoad')}</Link>
          <Link href="/users">{t('navUsers')}</Link>
        </nav>
      )}
      <div className="app-header__actions">
        <LanguageToggle />
        <SignOutButton />
      </div>
    </header>
  )
}
