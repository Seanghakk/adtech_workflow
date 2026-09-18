'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { handOffRequest, type HandOffState } from './actions'

const initialState: HandOffState = { error: null }

/**
 * Screen 1e's "hand it on" action (Brief §1.2/§3.4) — any active member,
 * matching triage's own picker shape (this component is used both to
 * claim a freshly triaged request and to re-route sideways to a different
 * team; the person pool is every active member, not filtered to the
 * destination team — see actions.ts's own comment for why).
 */
export function HandOffForm({
  requestId,
  memberOptions,
}: {
  requestId: string
  memberOptions: { userId: string; label: string; teamLabel?: string }[]
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(handOffRequest, initialState)

  return (
    <form action={formAction} className="request-detail__handoff-form">
      <input type="hidden" name="requestId" value={requestId} />
      <select name="toOwnerId" defaultValue="" required aria-label={t('requestDetailHandOffChoose')}>
        <option value="" disabled>
          {t('requestDetailHandOffChoose')}
        </option>
        {memberOptions.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.teamLabel ? `${m.label} — ${m.teamLabel}` : m.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? t('requestDetailHandOffPending') : t('requestDetailHandOff')}
      </button>
      {state.error && <div className="update-card__error" role="alert">{state.error}</div>}
    </form>
  )
}
