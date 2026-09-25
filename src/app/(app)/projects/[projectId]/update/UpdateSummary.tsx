'use client'

/**
 * Brief 103 — v7.4 §22.2, the summary register.
 *
 * One white container, four blocks. Everything it states is derived in
 * src/lib/updatePage/summary.ts so the states §22.9 names can be tested
 * rather than clicked through.
 *
 * The Complete block shows the app's EXISTING figure
 * (projects.percent_calculated) — §22.2 is explicit that the figure is
 * not to be recomputed to match the drawing. What changed is the
 * subline beside it, which now states that figure's real basis: open
 * item 21 found that workflow.compute_project_rollup_percent counts
 * drawings as well as sub-stages, gives in-progress half credit, and
 * ignores QC entirely. §22.2's own example subline ("22 of 150
 * sub-stages QC passed") would have been false beside it.
 */
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { FloorProgressBar, FloorProgressLegend } from '@/components/FloorProgressBar'
import type { CellCounts, NeedsAttention, FloorSummary, FloorOption } from '@/lib/updatePage/summary'
import { needsAttentionIsClear } from '@/lib/updatePage/summary'
import { SUB_STAGE_KEYS } from '@/lib/floorScan/rows'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import type { MatrixCellState } from '../floor-matrix'

export interface SummaryFloor extends FloorSummary {
  band: MatrixCellState | null
  isOpen: boolean
  /** §22.8 — the floor's condition in words, for the phone picker.
   *  Derived in the lib so it is testable; the words are dictionary
   *  keys, four of which Seanghakk supplied in chat (see the Result). */
  option: FloorOption
}

export function UpdateSummary({
  soLabel,
  soIsPending,
  projectName,
  picName,
  stream,
  percent,
  counts,
  basis,
  needs,
  floors,
  qcListHref,
  onGoToFloor,
  hasFloors,
}: {
  soLabel: string
  soIsPending: boolean
  projectName: string
  picName: string | null
  stream: string
  percent: number | null
  counts: CellCounts
  basis: { subStageCells: number; drawings: number }
  needs: NeedsAttention
  floors: SummaryFloor[]
  qcListHref: string
  onGoToFloor: (floorId: string) => void
  hasFloors: boolean
}) {
  const { t } = useLanguage()

  // §22.2: "6 columns when every label fits in four characters,
  // otherwise 3 — never truncated." Measured on the labels themselves
  // rather than guessed from the floor count.
  const columns = floors.every((f) => f.label.length <= 4) ? 6 : 3

  // With towers, one grid per tower under the tower's own name (§22.2).
  const towers = [...new Set(floors.map((f) => f.towerLabel))]
  const grouped = towers.map((tower) => ({
    tower,
    floors: floors.filter((f) => f.towerLabel === tower),
  }))

  return (
    <aside className="update-summary">
      {/* ---- Identity ---- */}
      <div className="update-summary__block update-summary__identity">
        <div className="update-summary__identity-top">
          {soIsPending ? (
            <span className="so-number so-number--pending">{soLabel}</span>
          ) : (
            <span className="update-summary__so">{soLabel}</span>
          )}
          <span className="update-summary__stream">{stream.toUpperCase()}</span>
        </div>
        <div className="update-summary__project">{projectName}</div>
        <div className="update-summary__pic">
          <span className="update-summary__pic-label">{t('updatePicLabel')}</span>{' '}
          <span className="update-summary__pic-name">{picName ?? t('dashboardUnassigned')}</span>
        </div>
      </div>

      {/* ---- Complete ---- */}
      <div className="update-summary__block">
        <div className="update-summary__kicker">{t('updateSummaryCompleteKicker')}</div>
        {hasFloors ? (
          <>
            <div className="update-summary__figure-row">
              <span
                className={`update-summary__figure${percent === 100 && allQcPassed(counts) ? ' update-summary__figure--complete' : ''}`}
              >
                {percent ?? '—'}
                {percent !== null && '%'}
              </span>
              {/* open item 21 — the figure's real basis, in words. */}
              <span className="update-summary__basis">
                {basis.subStageCells} {t('updateSummaryBasisMiddle')} {basis.drawings}{' '}
                {t('updateSummaryBasisSuffix')}
              </span>
            </div>
            <FloorProgressBar counts={counts} t={t} showCounts={false} />
            <FloorProgressLegend counts={counts} t={t} />
          </>
        ) : (
          <div className="update-summary__figure-row">
            <span className="update-summary__figure">—</span>
            <span className="update-summary__basis">{t('updateSummaryNothingToCalculate')}</span>
          </div>
        )}
      </div>

      {/* ---- Needs attention ---- */}
      <div className="update-summary__block">
        <div className="update-summary__kicker">{t('updateSummaryNeedsKicker')}</div>
        {needsAttentionIsClear(needs) ? (
          <p className="update-summary__clear">{t('updateSummaryAllClear')}</p>
        ) : (
          <ul className="update-summary__needs">
            {needs.oldestUnmoved && (
              <li
                className={`update-summary__need update-summary__need--${needs.oldestUnmoved.state}`}
              >
                <span className="update-summary__need-label">{t('updateSummaryOldestLabel')}</span>
                <button
                  type="button"
                  className="update-summary__need-line"
                  onClick={() => onGoToFloor(needs.oldestUnmoved!.floorId)}
                >
                  {needs.oldestUnmoved.holderName && (
                    <span className="update-summary__holder">{needs.oldestUnmoved.holderName}</span>
                  )}
                  <span
                    className={`update-summary__age${needs.oldestUnmoved.ageDays >= 16 ? ' update-summary__age--stalled' : ''}`}
                  >
                    {needs.oldestUnmoved.ageDays}d
                  </span>
                  <span className="update-summary__need-where">
                    {needs.oldestUnmoved.floorLabel} ·{' '}
                    {t(SUB_STAGE_KEYS[needs.oldestUnmoved.subStage] ?? 'subStageFirstFix')}
                  </span>
                </button>
              </li>
            )}

            {needs.qcFailed.count > 0 && (
              <li className="update-summary__need update-summary__need--qc_failed">
                <span className="update-summary__need-label">{t('updateSummaryFailedLabel')}</span>
                <button
                  type="button"
                  className="update-summary__need-line"
                  onClick={() => onGoToFloor(needs.qcFailed.firstFloorId!)}
                >
                  <span className="update-summary__age">{needs.qcFailed.count}</span>
                  <span className="update-summary__need-where">
                    {needs.qcFailed.firstFloorLabel} ·{' '}
                    {t(SUB_STAGE_KEYS[needs.qcFailed.firstSubStage ?? ''] ?? 'subStageFirstFix')}
                    {needs.qcFailed.count > 1 && ` +${needs.qcFailed.count - 1}`}
                  </span>
                </button>
              </li>
            )}

            {needs.awaitingQc.count > 0 && (
              <li className="update-summary__need update-summary__need--awaiting_qc">
                <span className="update-summary__need-label">{t('updateSummaryAwaitingLabel')}</span>
                <span className="update-summary__need-line">
                  <span className="update-summary__age">{needs.awaitingQc.count}</span>
                  <span className="update-summary__need-where">
                    {needs.awaitingQc.floorLabels.slice(0, 3).join(', ')}
                    {needs.awaitingQc.floorLabels.length > 3 &&
                      ` +${needs.awaitingQc.floorLabels.length - 3}`}
                  </span>
                  <Link href={qcListHref} className="update-summary__need-link">
                    {t('updateSummaryAwaitingLink')}
                  </Link>
                </span>
              </li>
            )}
          </ul>
        )}
      </div>

      {/* ---- Go to floor ---- */}
      {hasFloors && (
        <div className="update-summary__block">
          <div className="update-summary__kicker">{t('updateSummaryGoToFloorKicker')}</div>
          <p className="update-summary__note">{t('updateSummaryGoToFloorNote')}</p>
          {/* §22.8 — at 390px the grid becomes a native select at 56px,
              each option stating its state in words. Both are rendered
              and CSS shows one: a media query cannot swap one element
              for another, and duplicating the list in JS by window width
              would guess wrong on first paint. */}
          <select
            className="update-summary__select"
            value=""
            onChange={(e) => e.target.value && onGoToFloor(e.target.value)}
            aria-label={t('updateSummaryGoToFloorKicker')}
          >
            <option value="">{t('updateSummaryGoToFloorKicker')}</option>
            {floors.map((f) => (
              <option key={f.floorId} value={f.floorId}>
                {f.label} — {optionText(f.option, t)}
              </option>
            ))}
          </select>

          {grouped.map(({ tower, floors: towerFloors }) => (
            <div key={tower ?? '—'}>
              {/* §22.2 with towers: the tower's own name as entered,
                  nothing added. */}
              {tower && <div className="update-summary__tower-label">{tower}</div>}
              <div
                className="update-summary__grid"
                style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
              >
                {towerFloors.map((f) => (
                  <button
                    key={f.floorId}
                    type="button"
                    onClick={() => onGoToFloor(f.floorId)}
                    className={[
                      'update-summary__jump',
                      f.band ? `update-summary__jump--${f.band}` : '',
                      f.isOpen ? 'update-summary__jump--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  )
}

/**
 * §22.9's "Every cell QC passed" row turns the figure blue, and it
 * assumes that state reads 100%. It does not always. Measured on a
 * probe project whose every cell was QC passed, the figure was 71%:
 * percent_calculated counts shop drawings too (open item 21), and two
 * were outstanding. So the two conditions come apart in both
 * directions — 100% with no inspection ever done, and every cell passed
 * at 71% — and blue is required to mean BOTH. Blue on 71% would say
 * "finished" about a project with drawings outstanding; blue on an
 * unchecked 100% would say "accepted" about work nobody inspected.
 * That is the confusion the basis subline exists to prevent, so the
 * colour does not reintroduce it.
 */
function allQcPassed(counts: CellCounts): boolean {
  return (
    counts.qc_passed > 0 &&
    counts.not_started === 0 &&
    counts.in_progress === 0 &&
    counts.awaiting_qc === 0 &&
    counts.qc_failed === 0 &&
    counts.stalled === 0
  )
}

/** §22.8's four supplied variants plus the drawn one. */
function optionText(o: FloorOption, t: (k: DictionaryKey) => string): string {
  const who = o.holderName ? `${o.holderName}, ` : ''
  switch (o.kind) {
    case 'stalled':
      return `${who}${o.ageDays}d, ${t('updateSelectStalledSuffix')}`
    case 'open':
      return `${who}${o.ageDays}d`
    case 'awaiting':
      return t('updateSelectAwaitingSuffix')
    case 'all_passed':
      return t('updateSelectAllPassedSuffix')
    case 'not_started':
      return t('updateSelectNotStartedSuffix')
  }
}
