'use client'

import { useActionState, useState, useTransition } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import {
  deleteContractBoqLine,
  deleteContractBoqLineLocation,
  updateContractBoqLine,
  upsertContractBoqLineLocation,
} from './actions'
import { contractBoqInitialState } from './contract-boq-shared'

export interface ContractBoqLocationRow {
  locationLabel: string
  quantity: number
}

export interface ContractBoqLineData {
  id: string
  sectionLabel: string | null
  description: string
  brand: string | null
  unit: string
  quantity: number
  requestedQuantity: number
  locations: ContractBoqLocationRow[]
}

const deleteInitialState = { error: null }

/**
 * Brief 046 §2 — one Contract BOQ line: read row / inline edit (mirrors
 * lookups/LookupRow.tsx's own toggle-to-edit-form-in-a-colSpan-cell
 * shape), plus an expandable location-breakdown panel as a sibling row
 * (mirrors update/FloorBreakdown.tsx's FloorCard for the per-location
 * add/edit/delete pattern). !isPic disables every control but still shows
 * the data — same "render the gate, don't hide the screen" convention
 * FloorBreakdown itself uses.
 */
export function ContractBoqLineRow({
  projectId,
  line,
  isPic,
}: {
  projectId: string
  line: ContractBoqLineData
  isPic: boolean
}) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [state, formAction, pending] = useActionState(updateContractBoqLine, contractBoqInitialState)
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  if (state.savedAt && state.savedAt !== handledSavedAt) {
    setHandledSavedAt(state.savedAt)
    setEditing(false)
  }

  const rows = [
    editing ? (
      <tr key="edit">
        <td colSpan={7}>
          <form action={formAction} className="contract-boq__edit-form">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="lineId" value={line.id} />

            <label className="field contract-boq__edit-field">
              <span className="field__label">{t('contractBoqColSection')}</span>
              <input className="field__input" name="sectionLabel" defaultValue={line.sectionLabel ?? ''} />
            </label>
            <label className="field contract-boq__edit-field">
              <span className="field__label">{t('contractBoqColDescription')}</span>
              <input className="field__input" name="description" defaultValue={line.description} required />
            </label>
            <label className="field contract-boq__edit-field">
              <span className="field__label">{t('contractBoqColBrand')}</span>
              <input className="field__input" name="brand" defaultValue={line.brand ?? ''} />
            </label>
            <label className="field contract-boq__edit-field">
              <span className="field__label">{t('contractBoqColUnit')}</span>
              <input className="field__input" name="unit" defaultValue={line.unit} required />
            </label>
            <label className="field contract-boq__edit-field">
              <span className="field__label">{t('contractBoqColQuantity')}</span>
              <input
                className="field__input"
                name="quantity"
                type="number"
                step="any"
                min="0"
                defaultValue={line.quantity}
                required
              />
            </label>

            <div className="contract-boq__edit-actions">
              <button type="submit" className="btn btn--primary" disabled={pending}>
                {pending ? t('contractBoqSaving') : t('contractBoqSave')}
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEditing(false)} disabled={pending}>
                {t('contractBoqCancel')}
              </button>
            </div>

            {state.error && <span className="contract-boq__error">{state.error}</span>}
          </form>
        </td>
      </tr>
    ) : (
      <tr key="read">
        <td>{line.sectionLabel ?? '—'}</td>
        <td>{line.description}</td>
        <td>{line.brand ?? '—'}</td>
        <td>{line.unit}</td>
        <td>{line.quantity}</td>
        <td>{line.requestedQuantity}</td>
        <td>
          <div className="contract-boq__row-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded
                ? t('contractBoqLocationsCollapse')
                : `${t('contractBoqLocationsExpand')} (${line.locations.length})`}
            </button>
            {isPic && (
              <>
                <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>
                  {t('contractBoqEdit')}
                </button>
                <DeleteLineControl projectId={projectId} lineId={line.id} />
              </>
            )}
          </div>
        </td>
      </tr>
    ),
    expanded && (
      <tr key="locations">
        <td colSpan={7}>
          <LocationBreakdown projectId={projectId} lineId={line.id} locations={line.locations} isPic={isPic} />
        </td>
      </tr>
    ),
  ]

  return <>{rows}</>
}

function DeleteLineControl({ projectId, lineId }: { projectId: string; lineId: string }) {
  const { t } = useLanguage()
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(deleteContractBoqLine, deleteInitialState)

  if (!confirming) {
    return (
      <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>
        {t('contractBoqDelete')}
      </button>
    )
  }

  return (
    <form action={formAction} className="wf-admin-row__confirm">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lineId" value={lineId} />
      <p className="wf-admin-row__confirm-text">{t('contractBoqDeleteConfirm')}</p>
      <div className="wf-admin-row__confirm-actions">
        <button type="submit" className="wf-admin-row__confirm-yes" disabled={pending}>
          {pending ? t('contractBoqDeleteConfirmPending') : t('contractBoqDeleteConfirmAction')}
        </button>
        <button type="button" onClick={() => setConfirming(false)} disabled={pending}>
          {t('contractBoqCancel')}
        </button>
      </div>
      {state.error && <span className="wf-admin-row__confirm-error">{state.error}</span>}
    </form>
  )
}

function LocationBreakdown({
  projectId,
  lineId,
  locations,
  isPic,
}: {
  projectId: string
  lineId: string
  locations: ContractBoqLocationRow[]
  isPic: boolean
}) {
  const { t } = useLanguage()

  return (
    <div className="contract-boq__locations">
      <h4 className="contract-boq__locations-title">{t('contractBoqLocationsTitle')}</h4>
      {locations.length === 0 ? (
        <p className="empty-state">{t('contractBoqLocationsEmpty')}</p>
      ) : (
        <div className="contract-boq__location-list">
          {locations.map((loc) => (
            <LocationRow
              key={loc.locationLabel}
              projectId={projectId}
              lineId={lineId}
              location={loc}
              isPic={isPic}
            />
          ))}
        </div>
      )}
      {isPic && <AddLocationForm projectId={projectId} lineId={lineId} />}
    </div>
  )
}

function LocationRow({
  projectId,
  lineId,
  location,
  isPic,
}: {
  projectId: string
  lineId: string
  location: ContractBoqLocationRow
  isPic: boolean
}) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()
  const [quantity, setQuantity] = useState(String(location.quantity))
  const [deleteState, deleteAction] = useActionState(deleteContractBoqLineLocation, deleteInitialState)

  return (
    <div className="contract-boq__location-row">
      <span className="contract-boq__location-label">{location.locationLabel}</span>
      <input
        className="field__input contract-boq__location-quantity"
        type="number"
        step="any"
        min="0"
        value={quantity}
        disabled={!isPic || isPending}
        onChange={(e) => setQuantity(e.target.value)}
        onBlur={() => {
          if (!isPic || quantity === String(location.quantity)) return
          const formData = new FormData()
          formData.set('projectId', projectId)
          formData.set('lineId', lineId)
          formData.set('locationLabel', location.locationLabel)
          formData.set('quantity', quantity)
          startTransition(() => {
            upsertContractBoqLineLocation(contractBoqInitialState, formData)
          })
        }}
      />
      {isPic && (
        <form action={deleteAction}>
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="locationLabel" value={location.locationLabel} />
          <button type="submit" className="btn btn--ghost">
            {t('contractBoqLocationDelete')}
          </button>
        </form>
      )}
      {deleteState.error && <span className="contract-boq__error">{deleteState.error}</span>}
    </div>
  )
}

function AddLocationForm({ projectId, lineId }: { projectId: string; lineId: string }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(upsertContractBoqLineLocation, contractBoqInitialState)

  return (
    <form action={formAction} className="contract-boq__add-location">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lineId" value={lineId} />
      <label className="field contract-boq__edit-field">
        <span className="field__label">{t('contractBoqLocationLabel')}</span>
        <input className="field__input" name="locationLabel" required />
      </label>
      <label className="field contract-boq__edit-field">
        <span className="field__label">{t('contractBoqLocationQuantity')}</span>
        <input className="field__input" name="quantity" type="number" step="any" min="0" required />
      </label>
      <button type="submit" className="btn btn--outline" disabled={pending}>
        {t('contractBoqLocationAdd')}
      </button>
      {state.error && <span className="contract-boq__error">{state.error}</span>}
    </form>
  )
}
