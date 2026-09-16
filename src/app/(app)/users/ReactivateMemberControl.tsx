'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { reactivateMember, type ReactivateMemberState } from './actions'

const initialState: ReactivateMemberState = { error: null }

/**
 * Brief 014 §2 — a single action, no two-step confirmation: unlike
 * Deactivate/Unlink there is no consequence to name before reactivating
 * someone (§2's own wording never asks for one).
 */
export function ReactivateMemberControl({ memberId }: { memberId: string }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(reactivateMember, initialState)

  return (
    <form action={formAction} className="wf-admin-row__reactivate-form">
      <input type="hidden" name="memberId" value={memberId} />
      <button type="submit" className="wf-admin-row__reactivate" disabled={pending}>
        {pending ? t('usersReactivatePending') : t('usersReactivate')}
      </button>
      {state.error && <span className="wf-admin-row__confirm-error">{t('usersReactivateError')}</span>}
    </form>
  )
}
