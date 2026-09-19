'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { deleteTower, updateTower } from './actions'
import { floorZoneInitialState } from './floors-shared'

export interface TowerData {
  id: string
  label: string
  sortOrder: number
}

const deleteInitialState = { error: null }

/** Mirrors lookups/LookupRow.tsx's own toggle-to-inline-form shape. */
export function TowerRow({ projectId, tower }: { projectId: string; tower: TowerData }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(updateTower, floorZoneInitialState)
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  if (state.savedAt && state.savedAt !== handledSavedAt) {
    setHandledSavedAt(state.savedAt)
    setEditing(false)
  }

  if (editing) {
    return (
      <form action={formAction} className="floor-config__edit-form">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="towerId" value={tower.id} />
        <label className="field floor-config__edit-field">
          <span className="field__label">{t('floorConfigLabel')}</span>
          <input className="field__input" name="label" defaultValue={tower.label} required />
        </label>
        <label className="field floor-config__edit-field floor-config__edit-field--narrow">
          <span className="field__label">{t('floorConfigOrder')}</span>
          <input className="field__input" name="sortOrder" type="number" defaultValue={tower.sortOrder} required />
        </label>
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
    )
  }

  return (
    <div className="floor-config__tower-head">
      <h3 className="floor-config__tower-title">{tower.label}</h3>
      <div className="floor-config__row-actions">
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
          {t('floorConfigEdit')}
        </button>
        <DeleteTowerControl projectId={projectId} towerId={tower.id} />
      </div>
    </div>
  )
}

function DeleteTowerControl({ projectId, towerId }: { projectId: string; towerId: string }) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(deleteTower, deleteInitialState)

  if (!confirming) {
    return (
      <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>
        {t('floorConfigDeleteTower')}
      </button>
    )
  }

  return (
    <form action={formAction} className="wf-admin-row__confirm">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="towerId" value={towerId} />
      <p className="wf-admin-row__confirm-text">{t('floorConfigDeleteTowerConfirm')}</p>
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
