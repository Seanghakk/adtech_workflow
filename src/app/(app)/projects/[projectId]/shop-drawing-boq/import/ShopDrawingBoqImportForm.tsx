'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { importShopDrawingBoqLines } from './actions'
import { shopDrawingBoqImportInitialState, SHOP_DRAWING_BOQ_FIXED_HEADERS } from './import-shared'

export function ShopDrawingBoqImportForm({
  projectId,
  floorColumnHeaders,
}: {
  projectId: string
  /** Server-computed (see ../floor-columns.ts) so the template always
   *  matches the project's CURRENT floor/tower configuration — this
   *  component never queries towers/floors itself. */
  floorColumnHeaders: string[]
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(importShopDrawingBoqLines, shopDrawingBoqImportInitialState)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clears the chosen file after a CONFIRMED success only — same reasoning
  // as Contract BOQ import's own identical effect.
  useEffect(() => {
    if (state.importedCount !== null && fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [state])

  /** Same client-side XLSX.utils.aoa_to_sheet / writeFile technique as
   *  Contract BOQ import's own downloadTemplate — dynamic import so the
   *  ~1MB xlsx bundle only loads when someone actually clicks this.
   *  Columns 7+ come from floorColumnHeaders (empty array when the
   *  project has no floors/towers configured yet — the template then
   *  exports with just the six fixed columns, per Seanghakk's decision:
   *  export is permissive, not blocked, on a project with no floor
   *  breakdown configured). */
  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([[...SHOP_DRAWING_BOQ_FIXED_HEADERS, ...floorColumnHeaders]])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Shop Drawing BOQ')
    XLSX.writeFile(wb, 'shop-drawing-boq-template.xlsx')
  }

  return (
    <div className="shop-drawing-boq-import">
      <button type="button" className="btn btn--outline" onClick={downloadTemplate}>
        {t('shopDrawingBoqImportDownloadTemplate')}
      </button>

      <form action={formAction} className="shop-drawing-boq-import__form">
        <input type="hidden" name="projectId" value={projectId} />
        <label className="field">
          <span className="field__label">{t('shopDrawingBoqImportFileLabel')}</span>
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
          {pending ? t('shopDrawingBoqImportSubmitting') : t('shopDrawingBoqImportSubmit')}
        </button>
      </form>

      {state.importedCount !== null && (
        <p className="shop-drawing-boq-import__success">
          {t('shopDrawingBoqImportSuccessPrefix')} {state.importedCount} {t('shopDrawingBoqImportSuccessSuffix')}
        </p>
      )}

      {state.error && <p className="shop-drawing-boq__error">{state.error}</p>}

      {state.rowErrors.length > 0 && (
        <div className="shop-drawing-boq-import__row-errors">
          <p className="shop-drawing-boq__error">{t('shopDrawingBoqImportRejected')}</p>
          <ul>
            {state.rowErrors.map((msg, i) => (
              <li key={i} className="shop-drawing-boq__error">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
