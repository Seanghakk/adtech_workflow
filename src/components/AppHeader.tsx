import Link from 'next/link'
import { LanguageToggle } from './LanguageToggle'
import { SignOutButton } from './SignOutButton'
import type { CurrentMember } from '@/lib/auth/current-member'

/**
 * App shell nav. README, Assets: "No logo file — the ADTECH name renders
 * as plain text in a 2px ink box, no wordmark."
 */
export function AppHeader({ member }: { member: CurrentMember }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand-box brand-box--compact">
        <span className="brand-box__name">ADTECH</span>
        <span className="brand-box__kicker">Workflow Tracker</span>
      </Link>
      <div className="app-header__identity">
        <span className="app-header__owner-box">{(member.fullName ?? member.email ?? '—').toUpperCase()}</span>
        <span className="app-header__team">{member.teamLabelEn}</span>
      </div>
      <div className="app-header__actions">
        <LanguageToggle />
        <SignOutButton />
      </div>
    </header>
  )
}
