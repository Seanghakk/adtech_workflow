'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { unlinkMember, type UnlinkMemberState } from './actions'

const initialState: UnlinkMemberState = { error: null }

/**
 * Brief 014 §3.3 — names the consequence before acting, same two-step
 * pattern as DeactivateMemberControl: access ends AND the account
 * returns to the waiting-to-be-linked queue where it can be linked
 * again. Reuses the deactivate PIC-count wording (usersDeactivateConsequence
 * NoPic/PicSuffix) since that consequence is identical for both actions —
 * only the access-loss sentence differs (Unlink also mentions the queue).
 */
export function UnlinkMemberControl({
  memberId,
  picProjectCount,
}: {
  memberId: string
  picProjectCount: number
}) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(unlinkMember, initialState)

  if (!confirming) {
    return (
      <button type="button" className="wf-admin-row__unlink" onClick={() => setConfirming(true)}>
        {t('usersUnlink')}
      </button>
    )
  }

  return (
    <form action={formAction} className="wf-admin-row__confirm">
      <input type="hidden" name="memberId" value={memberId} />
      <p className="wf-admin-row__confirm-text">
        {t('usersUnlinkConsequenceAccess')}{' '}
        {picProjectCount > 0
          ? `${picProjectCount} project${picProjectCount === 1 ? '' : 's'} ${t('usersDeactivateConsequencePicSuffix')}`
          : t('usersDeactivateConsequenceNoPic')}
      </p>
      <div className="wf-admin-row__confirm-actions">
        <button type="submit" className="wf-admin-row__confirm-yes" disabled={pending}>
          {pending ? t('usersUnlinkConfirmPending') : t('usersUnlinkConfirmAction')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
          {t('usersUnlinkCancel')}
        </button>
      </div>
      {state.error && (
        <span className="wf-admin-row__confirm-error">
          {state.reason === 'not_found'
            ? t('writeRefusedNotFound')
            : state.reason === 'forbidden'
              ? t('writeRefusedForbidden')
              : t('usersUnlinkError')}
        </span>
      )}
    </form>
  )
}
