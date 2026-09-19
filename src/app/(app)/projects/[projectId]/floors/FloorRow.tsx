'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { deleteFloor, updateFloor } from './actions'
import { floorZoneInitialState } from './floors-shared'
import type { TowerData } from './TowerRow'

export interface FloorData {
  id: string
  label: string
  sortOrder: number
  towerId: string | null
}

const deleteInitialState = { error: null }

/** Mirrors TowerRow.tsx's own toggle-to-inline-form shape, plus a tower
 *  reassignment select. */
export function FloorRow({ projectId, floor, towers }: { projectId: string; floor: FloorData; towers: TowerData[] }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(updateFloor, floorZoneInitialState)
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  if (state.savedAt && state.savedAt !== handledSavedAt) {
    setHandledSavedAt(state.savedAt)
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="floor-config__floor-row floor-config__floor-row--editing">
        <form action={formAction} className="floor-config__edit-form">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="floorId" value={floor.id} />
          <label className="field floor-config__edit-field">
            <span className="field__label">{t('floorConfigLabel')}</span>
            <input className="field__input" name="label" defaultValue={floor.label} required />
          </label>
          <label className="field floor-config__edit-field floor-config__edit-field--narrow">
            <span className="field__label">{t('floorConfigOrder')}</span>
            <input className="field__input" name="sortOrder" type="number" defaultValue={floor.sortOrder} required />
          </label>
          {towers.length > 0 && (
            <label className="field floor-config__edit-field">
              <span className="field__label">{t('floorConfigTower')}</span>
              <select className="field__input" name="towerId" defaultValue={floor.towerId ?? ''}>
                <option value="">{t('floorConfigNoTower')}</option>
                {towers.map((tower) => (
                  <option key={tower.id} value={tower.id}>
                    {tower.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="floor-config__edit-actions">
            <button type="submit" className="btn btn--primary" disabled={pending}>
              {pending ? t('floorConfigSaving') : t('floorConfigSave')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)} disabled={pending}>
              {t('floorConfigCancel')}
            </button>
          </div>
          {state.error && <span className="floor-config__error">{state.error}</span>}
        </form>
      </li>
    )
  }

  return (
    <li className="floor-config__floor-row">
      <span className="floor-config__floor-label">{floor.label}</span>
      <span className="floor-config__floor-order">{t('floorConfigOrder')}: {floor.sortOrder}</span>
      <div className="floor-config__row-actions">
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
          {t('floorConfigEdit')}
        </button>
        <DeleteFloorControl projectId={projectId} floorId={floor.id} />
      </div>
    </li>
  )
}

function DeleteFloorControl({ projectId, floorId }: { projectId: string; floorId: string }) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(deleteFloor, deleteInitialState)

  if (!confirming) {
    return (
      <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>
        {t('floorConfigDeleteFloor')}
      </button>
    )
  }

  return (
    <form action={formAction} className="wf-admin-row__confirm">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="floorId" value={floorId} />
      <p className="wf-admin-row__confirm-text">{t('floorConfigDeleteFloorConfirm')}</p>
      <div className="wf-admin-row__confirm-actions">
        <button type="submit" className="wf-admin-row__confirm-yes" disabled={pending}>
          {pending ? t('floorConfigDeleting') : t('floorConfigDeleteConfirmAction')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
          {t('floorConfigCancel')}
        </button>
      </div>
      {state.error && <span className="wf-admin-row__confirm-error">{state.error}</span>}
    </form>
  )
}
