'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { runExport } from './actions'
import { exportRunInitialState } from './export-shared'

/**
 * Brief 100 Part A — the one control that actually sends anything.
 *
 * The CSV is built on the server (so the recorded snapshot is exactly the
 * file that left) and handed back as text; this turns it into a save. The
 * download is driven off `runId` rather than the file itself, so exporting
 * the same unchanged project twice still saves twice instead of looking
 * broken the second time.
 */
export function DownloadCsvButton({
  projectId,
  label,
}: {
  projectId: string
  /** §21.3 — "Download the CSV" normally, "Download anyway" where there
   *  are no drawings to send. */
  label: string
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(runExport, exportRunInitialState)
  const savedRunId = useRef<string | null>(null)

  useEffect(() => {
    if (!state.file || !state.runId || state.runId === savedRunId.current) return
    savedRunId.current = state.runId

    const blob = new Blob([state.file.content], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = state.file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [state])

  return (
    <>
      <form action={formAction} className="wf-form-row">
        <input type="hidden" name="projectId" value={projectId} />
        <button type="submit" className="wf-form-row__submit" disabled={pending}>
          {pending ? t('exportDownloading') : label}
        </button>
      </form>
      {/* §8.5 — one line of how-to, naming the routine to run. */}
      <p className="boq-import__note">{t('exportThenRun')}</p>
      {state.error && (
        <p className="wf-admin-row__confirm-error" role="alert">
          {state.error}
        </p>
      )}
    </>
  )
}
