'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { deactivateMember, type DeactivateMemberState } from './actions'

const initialState: DeactivateMemberState = { error: null }

/**
 * Brief 012 §2.6 — "confirms by naming the consequence in plain words
 * before the action, not after." A two-step reveal (button -> inline
 * confirmation naming the PIC count -> the actual submit) rather than a
 * browser confirm() dialog, matching this app's existing refusal-state
 * convention (6a's own guard: no modal, no toast — see globals.css's note
 * on .btn--disabled) of keeping the explanation inline beside the control
 * rather than in a popup.
 */
export function DeactivateMemberControl({
  memberId,
  picProjectCount,
}: {
  memberId: string
  picProjectCount: number
}) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(deactivateMember, initialState)

  if (!confirming) {
    return (
      <button type="button" className="wf-admin-row__deactivate" onClick={() => setConfirming(true)}>
        {t('usersDeactivate')}
      </button>
    )
  }

  return (
    <form action={formAction} className="wf-admin-row__confirm">
      <input type="hidden" name="memberId" value={memberId} />
      <p className="wf-admin-row__confirm-text">
        {t('usersDeactivateConsequenceSignIn')}{' '}
        {picProjectCount > 0
          ? `${picProjectCount} project${picProjectCount === 1 ? '' : 's'} ${t('usersDeactivateConsequencePicSuffix')}`
          : t('usersDeactivateConsequenceNoPic')}
      </p>
      <div className="wf-admin-row__confirm-actions">
        <button type="submit" className="wf-admin-row__confirm-yes" disabled={pending}>
          {pending ? t('usersDeactivateConfirmPending') : t('usersDeactivateConfirmAction')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
          {t('usersDeactivateCancel')}
        </button>
      </div>
      {state.error && (
        <span className="wf-admin-row__confirm-error">
          {state.reason === 'not_found'
            ? t('writeRefusedNotFound')
            : state.reason === 'forbidden'
              ? t('writeRefusedForbidden')
              : t('usersDeactivateError')}
        </span>
      )}
    </form>
  )
}
