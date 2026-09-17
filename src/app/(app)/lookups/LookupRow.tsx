'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { lookupInitialState, type LookupFormState } from './lookup-shared'

export interface LookupRowData {
  code: string
  labelEn: string
  labelKm: string | null
  sortOrder: number
  isActive: boolean
}

/** Mirrors localizedLabel()'s own placeholder detection (src/lib/i18n/
 *  localized-label.ts) — a row whose label_km is null or still carries
 *  the seed placeholder convention is "needs attention," not silently
 *  passing (Brief 017 §3.6). */
function needsAttention(labelKm: string | null): boolean {
  return !labelKm || labelKm.trim().startsWith('[provisional')
}

/**
 * One row of the reason_codes / scope_types admin tables (Brief 017 §3.3 —
 * same code/label_en/label_km/sort_order/is_active shape, so this
 * component is shared between both sections rather than duplicated).
 * `updateAction` is the matching Server Function (updateReasonCode or
 * updateScopeType), passed in from the Server Component page — code
 * itself is never an editable field on this form, anywhere (§3.4).
 */
export function LookupRow({
  row,
  updateAction,
}: {
  row: LookupRowData
  updateAction: (prevState: LookupFormState, formData: FormData) => Promise<LookupFormState>
}) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(updateAction, lookupInitialState)

  const [labelEn, setLabelEn] = useState(row.labelEn)
  const [labelKm, setLabelKm] = useState(row.labelKm ?? '')
  const [sortOrder, setSortOrder] = useState(String(row.sortOrder))
  const [isActive, setIsActive] = useState(row.isActive)
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  // Same "adjust state when a prop changes" pattern as PostRequestForm —
  // a successful save collapses back to the read view; revalidatePath
  // (this row's own Server Function) refreshes `row` with the saved
  // values on the next render.
  if (state.savedAt && state.savedAt !== handledSavedAt) {
    setHandledSavedAt(state.savedAt)
    setEditing(false)
  }

  if (!editing) {
    return (
      <tr className={row.isActive ? undefined : 'wf-admin-row--inactive'}>
        <td>{row.code}</td>
        <td>{row.labelEn}</td>
        <td>
          {row.labelKm ?? '—'}
          {needsAttention(row.labelKm) && (
            <span className="wf-admin-table__hint">{t('lookupsNeedsAttention')}</span>
          )}
        </td>
        <td>{row.sortOrder}</td>
        <td>{row.isActive ? t('usersStatusActive') : t('usersStatusInactive')}</td>
        <td>
          <button type="button" className="wf-admin-row__reactivate" onClick={() => setEditing(true)}>
            {t('lookupsEdit')}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={6}>
        <form action={formAction} className="wf-lookup-edit">
          <input type="hidden" name="code" value={row.code} />
          <input type="hidden" name="isActive" value={isActive ? 'true' : 'false'} />

          <label className="field wf-lookup-edit__field">
            <span className="field__label">{t('lookupsColLabelEn')}</span>
            <input
              className="field__input"
              name="labelEn"
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
            />
          </label>

          <label className="field wf-lookup-edit__field">
            <span className="field__label">{t('lookupsColLabelKm')}</span>
            <input
              className="field__input"
              name="labelKm"
              value={labelKm}
              onChange={(e) => setLabelKm(e.target.value)}
            />
          </label>

          <label className="field wf-lookup-edit__field wf-lookup-edit__field--narrow">
            <span className="field__label">{t('lookupsColSortOrder')}</span>
            <input
              className="field__input"
              name="sortOrder"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </label>

          <label className="wf-lookup-edit__active">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {t('lookupsActiveLabel')}
          </label>
          <span className="wf-admin-table__hint">{t('lookupsActivateBlockedHint')}</span>

          <div className="wf-lookup-edit__actions">
            <button type="submit" className="wf-admin-row__reactivate" disabled={pending}>
              {pending ? t('lookupsSaving') : t('lookupsSave')}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={pending}>
              {t('lookupsCancel')}
            </button>
          </div>

          {state.error && <span className="wf-admin-row__confirm-error">{state.error}</span>}
        </form>
      </td>
    </tr>
  )
}
