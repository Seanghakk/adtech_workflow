'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { createTower } from './actions'
import { floorZoneInitialState } from './floors-shared'

/** Brief 047 — "optionally define one or more towers/wings by label."
 *  sort_order is auto-assigned (count + 1), same convention update/
 *  floor-actions.ts's own addFloor already uses — reorder afterward via
 *  each tower's own edit form. */
export function AddTowerForm({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(createTower, floorZoneInitialState)

  return (
    <form action={formAction} className="floor-config__add-form">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="field floor-config__edit-field">
        <span className="field__label">{t('floorConfigTowerLabel')}</span>
        <input className="field__input" name="label" placeholder={t('floorConfigTowerPlaceholder')} required />
      </label>
      <button type="submit" className="btn btn--outline" disabled={pending}>
        {t('floorConfigAddTowerSubmit')}
      </button>
      {state.error && <span className="floor-config__error">{state.error}</span>}
    </form>
  )
}
