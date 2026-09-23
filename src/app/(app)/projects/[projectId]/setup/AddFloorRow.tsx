'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { createFloor } from '../floors/actions'
import { floorZoneInitialState } from '../floors/floors-shared'

/** Brief 097 — the 4.1 form-row shared part, extended with the new
 *  drawing-code field (migration 030) that /floors' own AddFloorForm
 *  never had. Reuses floors/actions.ts's createFloor unchanged. */
export function AddFloorRow({ projectId, towers }: { projectId: string; towers: { id: string; label: string }[] }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(createFloor, floorZoneInitialState)

  return (
    <form action={formAction} className="wf-form-row">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="wf-form-row__field">
        <span className="wf-form-row__label">{t('setupStructureColFloor')}</span>
        <input className="wf-form-row__input" name="label" required />
      </label>
      <label className="wf-form-row__field">
        <span className="wf-form-row__label">{t('setupStructureColDrawingCode')}</span>
        <input className="wf-form-row__input" name="drawingCode" />
      </label>
      {towers.length > 0 && (
        <label className="wf-form-row__field">
          <span className="wf-form-row__label">{t('setupStructureColTower')}</span>
          <select className="wf-form-row__input" name="towerId" defaultValue="">
            <option value="">—</option>
            {towers.map((tower) => (
              <option key={tower.id} value={tower.id}>
                {tower.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="submit" className="wf-form-row__submit" disabled={pending}>
        {t('setupStructureAddFloor')}
      </button>
      {state.error && <span className="update-card__error">{state.error}</span>}
    </form>
  )
}
