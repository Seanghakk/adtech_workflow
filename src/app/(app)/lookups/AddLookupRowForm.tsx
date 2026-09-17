'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { lookupInitialState, type LookupFormState } from './lookup-shared'

/**
 * Add-row form for reason_codes / scope_types (Brief 017 §3.3 — shared
 * shape, shared component, matching LookupRow's own reasoning). New rows
 * are created INACTIVE (createReasonCode/createScopeType's own default) —
 * no Active checkbox here at all; a fresh row goes through LookupRow's
 * edit form to add a real Khmer label and activate, per §3.6.
 */
export function AddLookupRowForm({
  createAction,
}: {
  createAction: (prevState: LookupFormState, formData: FormData) => Promise<LookupFormState>
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(createAction, lookupInitialState)
  const [code, setCode] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [labelKm, setLabelKm] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  // Same "adjust state when a prop changes" pattern as PostRequestForm
  // (React's own documented pattern, not a useEffect — see that file's
  // own comment): state.savedAt is a fresh token on every successful add
  // (never reused), so this reliably clears the form for the next row.
  if (state.savedAt && state.savedAt !== handledSavedAt) {
    setHandledSavedAt(state.savedAt)
    setCode('')
    setLabelEn('')
    setLabelKm('')
    setSortOrder('0')
  }

  const canAdd = code.trim() !== '' && labelEn.trim() !== '' && !pending

  return (
    <form action={formAction} className="wf-lookup-add">
      <span className="wf-lookup-add__title">{t('lookupsAddTitle')}</span>
      <div className="wf-lookup-add__fields">
        <label className="field wf-lookup-edit__field wf-lookup-edit__field--narrow">
          <span className="field__label">{t('lookupsCodeLabel')}</span>
          <input
            className="field__input"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <span className="field__label-optional">{t('lookupsCodeHint')}</span>
        </label>
        <label className="field wf-lookup-edit__field">
          <span className="field__label">{t('lookupsLabelEnLabel')}</span>
          <input
            className="field__input"
            name="labelEn"
            value={labelEn}
            onChange={(e) => setLabelEn(e.target.value)}
          />
        </label>
        <label className="field wf-lookup-edit__field">
          <span className="field__label">{t('lookupsLabelKmLabel')}</span>
          <input
            className="field__input"
            name="labelKm"
            value={labelKm}
            onChange={(e) => setLabelKm(e.target.value)}
          />
          <span className="field__label-optional">{t('lookupsLabelKmOptionalHint')}</span>
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
      </div>
      <button type="submit" className={canAdd ? 'btn btn--primary' : 'btn btn--primary btn--disabled'} disabled={pending}>
        {pending ? t('lookupsAddPending') : t('lookupsAddAction')}
      </button>
      {state.error && (
        <div className="update-card__error" role="alert">
          {state.error}
        </div>
      )}
    </form>
  )
}
