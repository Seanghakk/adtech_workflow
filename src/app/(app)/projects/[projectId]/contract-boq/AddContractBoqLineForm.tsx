'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { createContractBoqLine } from './actions'
import { contractBoqInitialState } from './contract-boq-shared'

/** Brief 046 §2.1 — create a new Contract BOQ line. Mirrors update/
 *  FloorBreakdown.tsx's own AddFloorForm shape (useActionState, a single
 *  form, cleared by the browser's own form reset on a successful submit —
 *  no controlled inputs needed since nothing here is edited in place). */
export function AddContractBoqLineForm({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(createContractBoqLine, contractBoqInitialState)

  return (
    <form action={formAction} className="contract-boq__add-form">
      <input type="hidden" name="projectId" value={projectId} />

      <label className="field">
        <span className="field__label">
          {t('contractBoqColSection')} <span className="field__label-optional">{t('contractBoqOptional')}</span>
        </span>
        <input className="field__input" name="sectionLabel" />
      </label>

      <label className="field">
        <span className="field__label">{t('contractBoqColDescription')}</span>
        <input className="field__input" name="description" required />
      </label>

      <label className="field">
        <span className="field__label">
          {t('contractBoqColBrand')} <span className="field__label-optional">{t('contractBoqOptional')}</span>
        </span>
        <input className="field__input" name="brand" />
      </label>

      <label className="field">
        <span className="field__label">{t('contractBoqColUnit')}</span>
        <input className="field__input" name="unit" required />
      </label>

      <label className="field">
        <span className="field__label">{t('contractBoqColQuantity')}</span>
        <input className="field__input" name="quantity" type="number" step="any" min="0" required />
      </label>

      <button type="submit" className="btn btn--primary" disabled={pending}>
        {t('contractBoqAddSubmit')}
      </button>

      {state.error && <span className="contract-boq__error">{state.error}</span>}
    </form>
  )
}
