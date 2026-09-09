'use client'

import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { SignOutButton } from './SignOutButton'

/**
 * Brief 002 §5.1's access-gate requirement, verbatim: "A user who
 * authenticates but has no members row gets a clear 'no access to the
 * Workflow Tracker' screen — NOT a crash, NOT an empty dashboard, NOT a
 * redirect loop." This is the state every current ADTECH CMMS user is in
 * today, so it is not an edge case — it is the default first-run state.
 */
export function NoAccessScreen() {
  const { t } = useLanguage()

  return (
    <div className="no-access-screen">
      <div className="brand-box" aria-hidden="true">
        <div className="brand-box__name">ADTECH</div>
        <div className="brand-box__kicker">Workflow Tracker</div>
      </div>
      <h1 className="no-access-screen__title">{t('noAccessTitle')}</h1>
      <p className="no-access-screen__body">{t('noAccessBody')}</p>
      <SignOutButton />
    </div>
  )
}
