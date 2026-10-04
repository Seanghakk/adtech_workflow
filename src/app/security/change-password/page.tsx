import type { Metadata } from 'next'
import Link from 'next/link'
import { getServerTranslator } from '@/lib/i18n/server'
import { cmmsUrl } from '@/lib/cmms-url'
import { safeNextPath } from '@/lib/auth/security-gate'
import { firstParam, requireGate } from '../page-gate'
import { CmmsLink, SecurityCard } from '../SecurityCard'

export const metadata: Metadata = { title: 'Account check — ADTECH Workflow Tracker' }

/**
 * ADTECH_WF_Brief_107 Part A — nothing in the Workflow is reachable until
 * this is done in the CMMS, which owns it. "Continue" re-checks: the gate
 * reads the account fresh on every request, so it lets the person through
 * the moment the CMMS has recorded the change.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNextPath(firstParam((await searchParams).next))
  await requireGate('change_password', next)
  const t = await getServerTranslator()
  return (
    <SecurityCard title={t('securityChangePasswordTitle')} body={t('securityChangePasswordBody')} signOutLabel={t('securitySignOut')}>
      <CmmsLink href={cmmsUrl('/change-password')} label={t('securityOpenCmms')} missing={t('securityCmmsLinkMissing')} />
      <div className="login-form__fields">
        <Link className="btn" href={`/security/change-password${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
          {t('securityContinue')}
        </Link>
      </div>
    </SecurityCard>
  )
}
