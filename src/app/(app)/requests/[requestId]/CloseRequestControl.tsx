'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { closeRequest, type CloseRequestState } from './actions'

const initialState: CloseRequestState = { error: null }

/**
 * Screen 1e's "close it" action (Brief §1.3) — either the requester or the
 * current owner. That check runs server-side in actions.ts (the real
 * gate); canClose here only decides whether the button renders at all, so
 * someone who cannot close this request is not shown a control that would
 * only ever refuse them.
 */
export function CloseRequestControl({ requestId, canClose }: { requestId: string; canClose: boolean }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(closeRequest, initialState)

  if (!canClose) return null

  return (
    <form action={formAction} className="request-detail__close-form">
      <input type="hidden" name="requestId" value={requestId} />
      <button type="submit" disabled={pending} className="btn btn--outline">
        {pending ? t('requestDetailClosePending') : t('requestDetailClose')}
      </button>
      {state.error && <div className="update-card__error" role="alert">{state.error}</div>}
    </form>
  )
}
