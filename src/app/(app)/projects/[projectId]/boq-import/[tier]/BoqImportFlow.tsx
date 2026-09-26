'use client'

import { useActionState, useRef, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { previewBoqImport, commitBoqImport } from './actions'
import { boqImportInitialState, type FloorProposalDecision, type BoqPreview } from './import-shared'
import { coverageFromParsedLines, coveragePreview } from '@/lib/progressPerSystem/importCoverage'

/**
 * Brief 098 §3.1 — ONE component for all three tiers. Everything that
 * differs between them (which columns the template carries, whether there
 * are floor columns at all) arrives as props from the tier config; the
 * behaviour here is identical.
 *
 * Built from the five shared parts only (Brief 098 §4): 4.4 import block
 * for the step strip, 4.2 data tables for changed/missing/refused rows and
 * for the proposals, 4.3 tags, 4.5 empty state for the first-ever state,
 * 4.1 form row for the upload control. No sixth part, no new token.
 */
export function BoqImportFlow({
  projectId,
  tierSlug,
  tierWord,
  soLabel,
  templateHeaders,
  floorColumnHeaders,
  isFirstImport,
  setupHref,
  canCreateSetup,
  picLabel,
}: {
  projectId: string
  tierSlug: string
  tierWord: string
  soLabel: string
  templateHeaders: string[]
  floorColumnHeaders: string[]
  isFirstImport: boolean
  setupHref: string
  /** Brief 099 §2 — creating floors and systems stays PIC-only, even for an
   *  importer who may legitimately write this tier. */
  canCreateSetup: boolean
  picLabel: string
}) {
  const { t } = useLanguage()
  const [previewState, previewAction, previewing] = useActionState(previewBoqImport, boqImportInitialState)
  const [commitState, commitAction, committing] = useActionState(commitBoqImport, boqImportInitialState)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // "Cancel — nothing is written" dismisses the preview without writing.
  // Tracked against the preview's own identity so a freshly uploaded file
  // re-opens the preview rather than staying dismissed.
  const [dismissedFor, setDismissedFor] = useState<BoqPreview | null>(null)

  const result = commitState.result
  const preview = previewState.preview && previewState.preview !== dismissedFor ? previewState.preview : null
  const step: 1 | 2 | 3 = result ? 3 : preview ? 2 : 1

  async function downloadTemplate() {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet([[...templateHeaders, ...floorColumnHeaders]])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'BOQ')
    XLSX.writeFile(wb, `${tierSlug}-boq-template.xlsx`)
  }

  return (
    <>
      {/* §7.1 / §21.2 — the three-cell step strip, current cell filled ink. */}
      <div className="wf-import-block" aria-label={t('boqImportKicker')}>
        <div className={`wf-import-block__cell${step === 1 ? ' wf-import-block__cell--current' : ''}`}>
          <div className="wf-import-block__cell-label">{t('boqImportStep1')}</div>
        </div>
        <div className={`wf-import-block__cell${step === 2 ? ' wf-import-block__cell--current' : ''}`}>
          <div className="wf-import-block__cell-label">{t('boqImportStep2')}</div>
        </div>
        <div className={`wf-import-block__cell${step === 3 ? ' wf-import-block__cell--current' : ''}`}>
          <div className="wf-import-block__cell-label">{t('boqImportStep3')}</div>
        </div>
      </div>

      {/* Phones: §21.2 "390px: not available — the section shows the
          desk-work sentence." */}
      <p className="wf-setup-desk-work-note">{t('setupDeskWorkNote')}</p>

      <div className="boq-import__desk">
        {result ? (
          <CommittedResult result={result} setupHref={setupHref} t={t} />
        ) : (
          <>
            {!preview && (
              <UploadCard
                projectId={projectId}
                tierSlug={tierSlug}
                tierWord={tierWord}
                soLabel={soLabel}
                floorColumnCount={floorColumnHeaders.length}
                isFirstImport={isFirstImport}
                previewAction={previewAction}
                previewing={previewing}
                fileInputRef={fileInputRef}
                onDownloadTemplate={downloadTemplate}
                t={t}
              />
            )}

            {previewState.notTemplate && (
              <div className="wf-refused-card" role="alert">
                <p className="wf-empty-state-card__headline">
                  {previewState.notTemplate.fileName} {t('boqImportNotTemplateSuffix')}
                </p>
                <p style={{ margin: '0 0 var(--space-4)' }}>
                  {t('boqImportNotTemplateBodyPrefix')} “{previewState.notTemplate.expectedHeaders.join(', ')}”
                  {t('boqImportNotTemplateBodyMiddle')} “{previewState.notTemplate.foundHeaders.join(', ') || '—'}”
                  {t('boqImportNotTemplateBodySuffix')}
                </p>
                <button type="button" className="btn btn--outline" onClick={downloadTemplate}>
                  {t('boqImportDownloadTemplate')}
                </button>
              </div>
            )}

            {previewState.error && (
              <div className="wf-load-failed-card" role="alert">
                <p style={{ margin: 0, fontWeight: 700 }}>{t('boqImportPreviewFailedHeadline')}</p>
                <p style={{ margin: 'var(--space-2) 0 var(--space-4)' }}>{previewState.error}</p>
                {/* §21.2's own two actions. The chosen file survives a failed
                    preview (nothing clears the input), so "Try again" really
                    re-submits it rather than silently doing nothing. */}
                <button
                  type="button"
                  className="wf-load-failed-card__retry"
                  onClick={() => fileInputRef.current?.form?.requestSubmit()}
                >
                  {t('boqImportTryAgain')}
                </button>{' '}
                <button
                  type="button"
                  className="wf-load-failed-card__retry"
                  onClick={() => {
                    if (fileInputRef.current) fileInputRef.current.value = ''
                    fileInputRef.current?.focus()
                  }}
                >
                  {t('boqImportChooseAnotherFile')}
                </button>
              </div>
            )}

            {commitState.error && (
              <div className="wf-load-failed-card" role="alert">
                <p style={{ margin: 0 }}>{commitState.error}</p>
              </div>
            )}

            {preview && (
              <PreviewCard
                preview={preview}
                projectId={projectId}
                tierSlug={tierSlug}
                soLabel={soLabel}
                commitAction={commitAction}
                committing={committing}
                onCancel={() => setDismissedFor(preview)}
                canCreateSetup={canCreateSetup}
                picLabel={picLabel}
                t={t}
              />
            )}
          </>
        )}
      </div>
    </>
  )
}

type T = (key: Parameters<ReturnType<typeof useLanguage>['t']>[0]) => string

function UploadCard({
  projectId,
  tierSlug,
  tierWord,
  soLabel,
  floorColumnCount,
  isFirstImport,
  previewAction,
  previewing,
  fileInputRef,
  onDownloadTemplate,
  t,
}: {
  projectId: string
  tierSlug: string
  tierWord: string
  soLabel: string
  floorColumnCount: number
  isFirstImport: boolean
  previewAction: (formData: FormData) => void
  previewing: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onDownloadTemplate: () => void
  t: T
}) {
  return (
    <div className={isFirstImport ? 'wf-empty-state-card' : 'wf-form-row-card'}>
      {isFirstImport && (
        <>
          <p className="wf-empty-state-card__headline">
            {t('boqImportFirstHeadlinePrefix')} {tierWord} {t('boqImportFirstHeadlineMiddle')} {soLabel}
          </p>
          <p className="wf-empty-state-card__body">
            {floorColumnCount > 0
              ? `${t('boqImportFirstBodyPrefix')} ${floorColumnCount} ${t('boqImportFirstBodySuffix')}`
              : t('boqImportFirstBodyNoFloors')}
          </p>
        </>
      )}

      <form action={previewAction} className="wf-form-row">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="tier" value={tierSlug} />
        <label className="wf-form-row__field">
          <span className="wf-form-row__label">{t('boqImportChooseFile')}</span>
          <input
            ref={fileInputRef}
            className="wf-form-row__input"
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
          />
        </label>
        <button type="button" className="btn btn--outline" onClick={onDownloadTemplate}>
          {t('boqImportDownloadTemplate')}
        </button>
        <button type="submit" className="wf-form-row__submit" disabled={previewing}>
          {previewing ? t('boqImportUploading') : t('boqImportStep2')}
        </button>
      </form>

      <p className="boq-import__note">{t('boqImportTemplateOnlyNote')}</p>
    </div>
  )
}

function PreviewCard({
  preview,
  projectId,
  tierSlug,
  soLabel,
  commitAction,
  committing,
  onCancel,
  canCreateSetup,
  picLabel,
  t,
}: {
  preview: BoqPreview
  projectId: string
  tierSlug: string
  soLabel: string
  commitAction: (formData: FormData) => void
  committing: boolean
  onCancel: () => void
  canCreateSetup: boolean
  picLabel: string
  t: T
}) {
  const [floorDecisions, setFloorDecisions] = useState<FloorProposalDecision[]>(
    preview.proposedFloors.map((f) => ({
      label: f.label,
      towerLabel: f.towerLabel,
      drawingCode: f.drawingCode,
      sortOrder: f.sortOrder,
      choice: (canCreateSetup ? 'create' : 'skip') as FloorProposalDecision['choice'],
      mapToFloorId: null,
    })),
  )
  const [systemDecisions, setSystemDecisions] = useState(
    preview.proposedSystems.map((s) => ({ name: s.name, cadCode: s.cadCode, include: canCreateSetup })),
  )

  // §7 — the coverage table's rows. Derived from the SAME parsed lines the
  // commit will send, so what is shown and what is written cannot diverge.
  const coveragePreviewRows = coveragePreview(
    coverageFromParsedLines(preview.lines),
    new Map(Object.entries(preview.currentCoverage)),
  )

  const changedCount = preview.changedLines.length
  const newCount = preview.newLines.length
  const refusedCount = preview.rowErrors.length
  const committableCount = preview.lines.length
  const nothingToCommit = committableCount === 0 || (newCount === 0 && changedCount === 0)

  const payload = JSON.stringify({
    lines: preview.lines,
    floors: floorDecisions,
    systems: systemDecisions.filter((s) => s.include).map((s) => ({ name: s.name, cadCode: s.cadCode })),
    rowsLeftOut: refusedCount,
    appLinesKept: preview.missingLines.length,
  })

  // §21.2 "No differences" — a real, distinct state, not a preview with
  // zeroes in it.
  if (nothingToCommit && refusedCount === 0) {
    return (
      <div className="wf-empty-state-card">
        <p className="wf-empty-state-card__headline">{t('boqImportNoDiffHeadline')}</p>
        <p className="wf-empty-state-card__body">
          {committableCount} {t('boqImportNoDiffBodyPrefix')} {soLabel} {t('boqImportNoDiffBodySuffix')}
        </p>
        <div className="wf-empty-state-card__actions">
          <button type="button" className="btn btn--outline" onClick={onCancel}>
            {t('boqImportChooseAnotherFile')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="boq-import__preview">
      {/* §7.5 — the headline states both halves when rows were refused. */}
      {refusedCount > 0 && (
        <p className="boq-import__figures-headline">
          {committableCount} {t('boqImportRowErrorsHeadlinePrefix')} {refusedCount}{' '}
          {t('boqImportRowErrorsHeadlineSuffix')}
        </p>
      )}

      {/* §7.4 — the four figures. */}
      <div className="boq-import__figures">
        <Figure n={newCount} label={t('boqImportFigureNew')} />
        <Figure n={changedCount} label={t('boqImportFigureChanged')} />
        <Figure n={preview.unchangedCount} label={t('boqImportFigureUnchanged')} />
        <Figure n={preview.missingLines.length} label={t('boqImportFigureMissing')} />
      </div>
      <p className="boq-import__note">{t('boqImportPreviewBody')}</p>
      {changedCount > 0 && preview.unchangedCount > 0 && (
        <p className="boq-import__note">
          {t('boqImportMostlyUnchangedPrefix')} {changedCount} {t('boqImportMostlyUnchangedMiddle')}{' '}
          {preview.unchangedCount} {t('boqImportMostlyUnchangedSuffix')}
        </p>
      )}

      {/* §7.6 — proposed floors, amber hatch until committed. */}
      {preview.proposedFloors.length > 0 && (
        <section className="wf-setup-section">
          <h2 className="wf-setup-section__title">
            {t('boqImportProposedFloorsPrefix')} {preview.proposedFloors.length}{' '}
            {t('boqImportProposedFloorsSuffix')}
          </h2>
          <div className="wf-data-table boq-import__proposal">
            <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '1fr 1fr 90px 1.4fr' }}>
              <span className="wf-data-table__head-cell">{t('boqImportProposedColFloor')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportProposedColDrawingCode')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportProposedColOrder')}</span>
              <span aria-hidden="true" />
            </div>
            {floorDecisions.map((d, i) => (
              <div
                key={`${d.towerLabel ?? ''}-${d.label}`}
                className="wf-data-table__row wf-data-table__row--body"
                style={{ gridTemplateColumns: '1fr 1fr 90px 1.4fr' }}
              >
                <span>{d.towerLabel ? `${d.towerLabel} — ${d.label}` : d.label}</span>
                <input
                  className="wf-form-row__input"
                  value={d.drawingCode}
                  aria-label={t('boqImportProposedColDrawingCode')}
                  onChange={(e) =>
                    setFloorDecisions((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, drawingCode: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className="wf-form-row__input"
                  type="number"
                  value={d.sortOrder}
                  aria-label={t('boqImportProposedColOrder')}
                  onChange={(e) =>
                    setFloorDecisions((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, sortOrder: Number(e.target.value) } : x)),
                    )
                  }
                />
                <span className="boq-import__choices">
                  {/* Brief 099 §2 — "Create" is simply not offered to an
                      importer who is not the PIC, rather than shown and
                      then refused. The sentence below names the missing
                      floor and the person who can add it. */}
                  {(canCreateSetup ? (['create', 'map', 'skip'] as const) : (['map', 'skip'] as const)).map(
                    (choice) => (
                      <label key={choice} className="boq-import__choice">
                        <input
                          type="radio"
                          name={`floor-${i}`}
                          checked={d.choice === choice}
                          onChange={() =>
                            setFloorDecisions((prev) => prev.map((x, j) => (j === i ? { ...x, choice } : x)))
                          }
                        />
                        {choice === 'create'
                          ? t('boqImportProposalCreate')
                          : choice === 'map'
                            ? t('boqImportProposalMap')
                            : t('boqImportProposalSkip')}
                      </label>
                    ),
                  )}
                  {d.choice === 'map' && (
                    <select
                      className="wf-form-row__input"
                      value={d.mapToFloorId ?? ''}
                      aria-label={t('boqImportProposalMap')}
                      onChange={(e) =>
                        setFloorDecisions((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, mapToFloorId: e.target.value || null } : x)),
                        )
                      }
                    >
                      <option value="">—</option>
                      {preview.existingFloors.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  )}
                  {!canCreateSetup && (
                    <span className="boq-import__cannot-create">
                      {t('boqImportProposalCannotCreatePrefix')} “{d.label}”,{' '}
                      {t('boqImportProposalCannotCreateFloorSuffix')} {picLabel}
                      {t('boqImportProposalCannotCreateEnd')}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* §7 / §6.5 — what the file proposes for floor coverage, and what
          survives it. The "kept" column is the one that matters: a
          re-import is routinely a partial file, and this is where a person
          sees that it will not narrow a system's scope. */}
      {coveragePreviewRows.length > 0 && (
        <section className="boq-import__coverage">
          <h3 className="boq-import__coverage-heading">{t('boqImportCoverageHeading')}</h3>
          <p className="boq-import__coverage-intro">{t('boqImportCoverageIntro')}</p>
          <div className="wf-data-table">
            <div
              className="wf-data-table__row wf-data-table__row--head"
              style={{ gridTemplateColumns: '1fr 1.2fr 1.2fr 1.4fr' }}
            >
              <span className="wf-data-table__head-cell">{t('boqImportCoverageColSystem')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportCoverageColNow')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportCoverageColFile')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportCoverageColCommit')}</span>
            </div>
            {coveragePreviewRows.map((row) => (
              <div
                key={row.systemName}
                className="wf-data-table__row wf-data-table__row--body"
                style={{ gridTemplateColumns: '1fr 1.2fr 1.2fr 1.4fr' }}
              >
                <span>
                  {row.systemName}{' '}
                  {row.isNewSystem && (
                    <span className="wf-status-tag">{t('boqImportCoverageNewSystem')}</span>
                  )}
                </span>
                <span>{row.now.length > 0 ? row.now.join(', ') : t('boqImportCoverageNone')}</span>
                <span>
                  {row.inFile.length > 0 ? row.inFile.join(', ') : t('boqImportCoverageNone')}
                </span>
                <span>
                  {row.onCommit.length > 0 ? row.onCommit.join(', ') : t('boqImportCoverageNone')}
                  {row.keptNotInFile.length > 0 && (
                    <span className="boq-import__coverage-kept">
                      {' · '}
                      {row.keptNotInFile.join(', ')} {t('boqImportCoverageKept')}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* §7.6 — proposed systems. */}
      {preview.proposedSystems.length > 0 && (
        <section className="wf-setup-section">
          <h2 className="wf-setup-section__title">
            {t('boqImportProposedSystemsPrefix')} {preview.proposedSystems.length}{' '}
            {t('boqImportProposedSystemsSuffix')}
          </h2>
          <div className="wf-data-table boq-import__proposal">
            <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '1fr 1fr 120px' }}>
              <span className="wf-data-table__head-cell">{t('boqImportProposedColSystem')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportProposedColCadCode')}</span>
              <span aria-hidden="true" />
            </div>
            {systemDecisions.map((s, i) => (
              <div key={s.name} className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '1fr 1fr 120px' }}>
                <span>{s.name}</span>
                <select
                  className="wf-form-row__input"
                  value={s.cadCode ?? ''}
                  aria-label={t('boqImportProposedColCadCode')}
                  hidden={!canCreateSetup}
                  onChange={(e) =>
                    setSystemDecisions((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, cadCode: e.target.value || null } : x)),
                    )
                  }
                >
                  <option value="">{t('boqImportProposedCadCodeNone')}</option>
                  {preview.cadSystems.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.labelEn}
                    </option>
                  ))}
                </select>
                {canCreateSetup ? (
                  <label className="boq-import__choice">
                    <input
                      type="checkbox"
                      checked={s.include}
                      onChange={(e) =>
                        setSystemDecisions((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, include: e.target.checked } : x)),
                        )
                      }
                    />
                    {s.include ? t('boqImportProposalCreate') : t('boqImportProposalSkip')}
                  </label>
                ) : (
                  <span className="boq-import__cannot-create">
                    {t('boqImportProposalCannotCreatePrefix')} “{s.name}”,{' '}
                    {t('boqImportProposalCannotCreateSystemSuffix')} {picLabel}
                    {t('boqImportProposalCannotCreateEnd')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* §7.4 — changed lines, Was / Now side by side. */}
      {changedCount > 0 && (
        <section className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('boqImportChangedTitle')}</h2>
          <div className="wf-data-table">
            <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '120px 1fr 120px 1fr 1fr' }}>
              <span className="wf-data-table__head-cell">{t('boqImportColItemNumber')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportColDescription')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportColField')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportColWas')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportColNow')}</span>
            </div>
            {preview.changedLines.flatMap((c) =>
              c.changes.map((ch, k) => (
                <div
                  key={`${c.line.itemNumber}-${ch.field}`}
                  className="wf-data-table__row wf-data-table__row--body"
                  style={{ gridTemplateColumns: '120px 1fr 120px 1fr 1fr' }}
                >
                  <span>{k === 0 ? c.line.itemNumber : ''}</span>
                  <span className="wf-data-table__cell--description">{k === 0 ? c.line.description : ''}</span>
                  <span>{ch.field}</span>
                  <span>{ch.was}</span>
                  <span className="wf-data-table__cell--quantity">{ch.now}</span>
                </div>
              )),
            )}
          </div>
        </section>
      )}

      {/* §7.4 — in the app, not in the file. Listed, never deleted. */}
      {preview.missingLines.length > 0 && (
        <section className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('boqImportMissingTitle')}</h2>
          <p className="boq-import__note">{t('boqImportMissingNote')}</p>
          <div className="wf-data-table">
            <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '120px 1fr 120px' }}>
              <span className="wf-data-table__head-cell">{t('boqImportColItemNumber')}</span>
              <span className="wf-data-table__head-cell">{t('boqImportColDescription')}</span>
              <span className="wf-data-table__head-cell">{t('tenderBoqColQuantity')}</span>
            </div>
            {preview.missingLines.map((m) => (
              <div key={m.id} className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '120px 1fr 120px' }}>
                <span>{m.itemNumber ?? '—'}</span>
                <span className="wf-data-table__cell--description">{m.description}</span>
                <span className="wf-data-table__cell--quantity">{m.quantity}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* §7.5 — refused rows. Red is confined to the rule, the count and
          the reason text; never a filled row background. */}
      {refusedCount > 0 && (
        <section className="wf-setup-section">
          <h2 className="wf-setup-section__title">
            <span className="wf-status-tag wf-status-tag--row-rejected">{refusedCount}</span>
          </h2>
          <div className="wf-data-table">
            {preview.rowErrors.map((e) => (
              <div key={e.rowNumber} className="wf-data-table__row wf-data-table__row--body boq-import__refused-row" style={{ gridTemplateColumns: '1fr' }}>
                <span>{e.message}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* §7.5 — two real actions, neither a hidden safe default. */}
      <form action={commitAction} className="wf-form-row">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="tier" value={tierSlug} />
        <input type="hidden" name="payload" value={payload} />
        <button type="submit" className="wf-form-row__submit" disabled={committing}>
          {committing
            ? t('boqImportCommitting')
            : refusedCount > 0
              ? `${t('boqImportCommitPassingPrefix')} ${committableCount} ${t('boqImportCommitPassingSuffix')}`
              : `${t('boqImportCommitPrefix')} ${newCount + changedCount} ${t('boqImportCommitSuffix')}`}
        </button>
        <button type="button" className="btn btn--outline" onClick={onCancel} disabled={committing}>
          {refusedCount > 0 ? t('boqImportCancelWholeFile') : t('boqImportCancel')}
        </button>
      </form>
    </div>
  )
}

function Figure({ n, label }: { n: number; label: string }) {
  return (
    <div className="boq-import__figure">
      <span className="boq-import__figure-n">{n}</span>
      <span className="boq-import__figure-label">{label}</span>
    </div>
  )
}

function CommittedResult({
  result,
  setupHref,
  t,
}: {
  result: NonNullable<ReturnType<typeof useActionState<import('./import-shared').BoqImportState, FormData>>[0]['result']>
  setupHref: string
  t: T
}) {
  return (
    <div className="empty-state empty-state--result" role="status">
      <p className="boq-import__result-n">{result.linesWritten}</p>
      <p className="boq-import__result-label">{t('boqImportResultLinesWritten')}</p>
      <p className="boq-import__result-detail">
        {result.floorsCreated} {t('boqImportResultFloorsCreated')} · {result.floorsMapped}{' '}
        {t('boqImportResultFloorsMapped')} · {result.systemsAdded} {t('boqImportResultSystemsAdded')} ·{' '}
        {result.rowsLeftOut} {t('boqImportResultRowsLeftOut')} · {result.appLinesKept}{' '}
        {t('boqImportResultAppLinesKept')}
      </p>
      <p className="boq-import__result-detail">
        {t('boqImportResultByPrefix')} {result.byName} {t('boqImportResultAtPrefix')}{' '}
        {new Date(result.at).toLocaleString()}
      </p>
      <p>
        <Link href={setupHref} className="btn btn--primary">
          {t('boqImportBackToSetup')}
        </Link>
      </p>
    </div>
  )
}
