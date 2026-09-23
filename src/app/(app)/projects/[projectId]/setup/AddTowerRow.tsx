'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { createTower } from '../floors/actions'
import { floorZoneInitialState } from '../floors/floors-shared'

/** Brief 097 — the 4.1 form-row shared part. Reuses floors/actions.ts's
 *  createTower unchanged. */
export function AddTowerRow({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(createTower, floorZoneInitialState)

  return (
    <form action={formAction} className="wf-form-row">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="wf-form-row__field">
        <span className="wf-form-row__label">{t('setupStructureColTower')}</span>
        <input className="wf-form-row__input" name="label" required />
      </label>
      <button type="submit" className="wf-form-row__submit" disabled={pending}>
        {t('setupStructureAddTower')}
      </button>
      {state.error && <span className="update-card__error">{state.error}</span>}
    </form>
  )
}
