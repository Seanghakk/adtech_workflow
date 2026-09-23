'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { deleteFloor, updateFloor } from '../floors/actions'
import { floorZoneInitialState } from '../floors/floors-shared'

export interface FloorTableRowData {
  id: string
  label: string
  drawingCode: string | null
  sortOrder: number
  towerId: string | null
  towerLabel: string | null
  hasProgress: boolean
}

const GRID_COLUMNS = '1fr 1fr 1fr 90px 1fr 140px'

const deleteInitialState = { error: null }

/** Brief 097 §6.2 item 2 — one row of the Building structure 4.2 data
 *  table. Columns, exact (v7.2 §21.1): Tower · Floor · Drawing code ·
 *  Order · Used by, then row actions "Edit · Deactivate". Reuses floors/
 *  actions.ts's own updateFloor/deleteFloor — this page absorbs /floors
 *  completely, it does not re-implement its write paths. */
export function FloorTableRow({
  projectId,
  floor,
  towers,
  canEdit,
}: {
  projectId: string
  floor: FloorTableRowData
  towers: { id: string; label: string }[]
  canEdit: boolean
}) {
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
      <div className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '1fr' }}>
        <form action={formAction} className="wf-form-row">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="floorId" value={floor.id} />
          <label className="wf-form-row__field">
            <span className="wf-form-row__label">{t('setupStructureColFloor')}</span>
            <input className="wf-form-row__input" name="label" defaultValue={floor.label} required />
          </label>
          <label className="wf-form-row__field">
            <span className="wf-form-row__label">{t('setupStructureColDrawingCode')}</span>
            <input className="wf-form-row__input" name="drawingCode" defaultValue={floor.drawingCode ?? ''} />
          </label>
          <label className="wf-form-row__field wf-form-row__field--numeric">
            <span className="wf-form-row__label">{t('setupStructureColOrder')}</span>
            <input className="wf-form-row__input" name="sortOrder" type="number" defaultValue={floor.sortOrder} required />
          </label>
          {towers.length > 0 && (
            <label className="wf-form-row__field">
              <span className="wf-form-row__label">{t('setupStructureColTower')}</span>
              <select className="wf-form-row__input" name="towerId" defaultValue={floor.towerId ?? ''}>
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
            {t('setupIdentitySave')}
          </button>
          <button type="button" className="wf-form-row__submit" style={{ background: 'transparent', color: 'var(--ink)' }} onClick={() => setEditing(false)} disabled={pending}>
            {t('floorConfigCancel')}
          </button>
          {state.error && <span className="update-card__error">{state.error}</span>}
        </form>
      </div>
    )
  }

  return (
    <div className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: GRID_COLUMNS }}>
      <span>{floor.towerLabel ?? '—'}</span>
      <span>{floor.label}</span>
      <span>
        {floor.drawingCode ?? (
          <span className="wf-admin-row__confirm-error" role="alert">
            {t('setupStructureNoDrawingCode')}
          </span>
        )}
      </span>
      <span>{floor.sortOrder}</span>
      <span>{floor.hasProgress ? t('setupStructureUsedByProgress') : t('setupStructureUsedByNothing')}</span>
      {canEdit ? (
        <div className="wf-data-table__row-actions">
          <button type="button" onClick={() => setEditing(true)}>
            {t('setupStructureEdit')}
          </button>
          {' · '}
          <DeleteFloorControl projectId={projectId} floorId={floor.id} />
        </div>
      ) : (
        <span />
      )}
    </div>
  )
}

function DeleteFloorControl({ projectId, floorId }: { projectId: string; floorId: string }) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(deleteFloor, deleteInitialState)

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}>
        {t('setupStructureDeactivate')}
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
