'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { assignProjectPic, type AssignPicState } from '@/app/(app)/pic-actions'

const initialState: AssignPicState = { error: null }

/**
 * Brief 012 §3.1 — on the board card itself, visible to managers/admins
 * only (§3.1). §3.3 — reassignment is the same action, so this renders
 * identically whether currentPicId is null or already set; only the
 * button label (Assign vs Reassign) and the select's default change.
 */
export function AssignPicForm({
  projectId,
  currentPicId,
  memberOptions,
}: {
  projectId: string
  currentPicId: string | null
  memberOptions: { userId: string; label: string }[]
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(assignProjectPic, initialState)

  return (
    <form action={formAction} className="board-card__assign-pic" onClick={(e) => e.stopPropagation()}>
      <input type="hidden" name="projectId" value={projectId} />
      <select name="newPicId" defaultValue={currentPicId ?? ''} required aria-label={t('boardAssignPic')}>
        <option value="" disabled>
          {t('boardAssignPicChoose')}
        </option>
        {memberOptions.map((m) => (
          <option key={m.userId} value={m.userId}>
            {m.label}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending}>
        {pending ? t('boardAssignPicPending') : currentPicId ? t('boardReassignPic') : t('boardAssignPic')}
      </button>
      {state.error && <span className="board-card__assign-pic-error">{t('boardAssignPicError')}</span>}
    </form>
  )
}
