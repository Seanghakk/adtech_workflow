import type { Metadata } from 'next'
import { getServerTranslator } from '@/lib/i18n/server'
import { cmmsUrl } from '@/lib/cmms-url'
import { safeNextPath } from '@/lib/auth/security-gate'
import { firstParam, requireGate } from '../page-gate'
import { CmmsLink, SecurityCard } from '../SecurityCard'
import { TwoStepForm } from './TwoStepForm'

export const metadata: Metadata = { title: 'Two-step code — ADTECH Workflow Tracker' }

/**
 * ADTECH_WF_Brief_107 Part A — a person with an authenticator, signed in
 * with only their password. "Use a recovery code" is the CMMS's own flow
 * (its /api/auth/mfa/recover spends the code once and removes the lost
 * authenticator), reached from the CMMS sign-in, so there is one recovery
 * check, not two.
 */
export default async function TwoStepPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNextPath(firstParam((await searchParams).next))
  await requireGate('verify', next)
  const t = await getServerTranslator()
  return (
    <SecurityCard title={t('securityTwoStepTitle')} body={t('securityTwoStepBody')} signOutLabel={t('securitySignOut')}>
      <TwoStepForm next={next} />
      <div className="login-form__fields">
        <p className="login-form__reset">{t('securityTwoStepRecovery')}</p>
      </div>
      <CmmsLink href={cmmsUrl('/login')} label={t('securityOpenCmms')} missing={t('securityCmmsLinkMissing')} />
    </SecurityCard>
  )
}
