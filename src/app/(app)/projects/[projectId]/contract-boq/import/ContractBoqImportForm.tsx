'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { importContractBoqLines } from './actions'
import { contractBoqImportInitialState } from './import-shared'

/** Brief 048 — matches this app's exact template column order
 *  (Description, Brand, Unit, Total Quantity — deliberately no Section,
 *  no Model/Part Number, no floor/zone columns for Contract BOQ). Same
 *  client-side XLSX.utils.aoa_to_sheet / writeFile technique the CMMS's
 *  own exportOrdersXlsx.ts already uses for its board export — dynamic
 *  import so the ~1MB xlsx bundle only loads when someone actually
 *  clicks this, not on every page load. */
async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([['Description', 'Brand', 'Unit', 'Total Quantity']])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Contract BOQ')
  XLSX.writeFile(wb, 'contract-boq-template.xlsx')
}

export function ContractBoqImportForm({ projectId }: { projectId: string }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(importContractBoqLines, contractBoqImportInitialState)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clears the chosen file after a CONFIRMED success only — the effect's
  // own condition means an error re-render never wipes the user's file
  // selection, since they'd need to fix and resubmit the same pick.
  useEffect(() => {
    if (state.importedCount !== null && fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [state])

  return (
    <div className="contract-boq-import">
      <button type="button" className="btn btn--outline" onClick={downloadTemplate}>
        {t('contractBoqImportDownloadTemplate')}
      </button>

      <form action={formAction} className="contract-boq-import__form">
        <input type="hidden" name="projectId" value={projectId} />
        <label className="field">
          <span className="field__label">{t('contractBoqImportFileLabel')}</span>
          <input
            ref={fileInputRef}
            className="field__input"
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
          />
        </label>
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending ? t('contractBoqImportSubmitting') : t('contractBoqImportSubmit')}
        </button>
      </form>

      {state.importedCount !== null && (
        <p className="contract-boq-import__success">
          {t('contractBoqImportSuccessPrefix')} {state.importedCount} {t('contractBoqImportSuccessSuffix')}
        </p>
      )}

      {state.error && <p className="contract-boq__error">{state.error}</p>}

      {state.rowErrors.length > 0 && (
        <div className="contract-boq-import__row-errors">
          <p className="contract-boq__error">{t('contractBoqImportRejected')}</p>
          <ul>
            {state.rowErrors.map((msg, i) => (
              <li key={i} className="contract-boq__error">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
