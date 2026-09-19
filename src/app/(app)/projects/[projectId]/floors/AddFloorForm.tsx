'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { createFloor } from './actions'
import { floorZoneInitialState } from './floors-shared'
import type { TowerData } from './TowerRow'

/** Brief 047 — "Add floor rows... optionally under a tower/wing."
 *  towerId is fixed (hidden) when rendered inside a specific tower's own
 *  section; left as a visible select (defaulting to "No tower") when
 *  rendered at the top level, matching how AddContractBoqLineForm's own
 *  sibling round handles an optional relationship. */
export function AddFloorForm({
  projectId,
  towers,
  fixedTowerId,
}: {
  projectId: string
  towers: TowerData[]
  fixedTowerId?: string
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(createFloor, floorZoneInitialState)

  return (
    <form action={formAction} className="floor-config__add-form">
      <input type="hidden" name="projectId" value={projectId} />
      {fixedTowerId !== undefined && <input type="hidden" name="towerId" value={fixedTowerId} />}
      <label className="field floor-config__edit-field">
        <span className="field__label">{t('floorConfigLabel')}</span>
        <input className="field__input" name="label" placeholder={t('floorConfigFloorPlaceholder')} required />
      </label>
      {fixedTowerId === undefined && towers.length > 0 && (
        <label className="field floor-config__edit-field">
          <span className="field__label">{t('floorConfigTower')}</span>
          <select className="field__input" name="towerId" defaultValue="">
            <option value="">{t('floorConfigNoTower')}</option>
            {towers.map((tower) => (
              <option key={tower.id} value={tower.id}>
                {tower.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" className="btn btn--outline" disabled={pending}>
        {t('floorConfigAddFloorSubmit')}
      </button>
      {state.error && <span className="floor-config__error">{state.error}</span>}
    </form>
  )
}
