import Link from 'next/link'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { MATRIX_COLUMNS, type MatrixCellState, type MatrixRow } from './floor-matrix'

/** Same sub-stage label keys FloorBreakdown.tsx's SUB_STAGE_KEYS already
 *  uses — kept as its own local copy rather than a cross-route-folder
 *  import (this app's own established convention: page-local helpers stay
 *  page-local, confirmed by grepping every existing import under
 *  projects/[projectId]/ before writing this file). */
const SUB_STAGE_KEYS: Record<string, DictionaryKey> = {
  first_fix: 'subStageFirstFix',
  second_fix: 'subStageSecondFix',
  third_fix: 'subStageThirdFix',
  pre_commissioning: 'subStagePreCommissioning',
  commissioning: 'subStageCommissioning',
}

const LEGEND_KEYS: Record<MatrixCellState, DictionaryKey> = {
  not_applicable: 'floorMatrixLegendNotApplicable',
  not_started: 'floorMatrixLegendNotStarted',
  in_progress: 'floorMatrixLegendInProgress',
  awaiting_qc: 'floorMatrixLegendAwaitingQc',
  qc_passed: 'floorMatrixLegendQcPassed',
  qc_failed: 'floorMatrixLegendQcFailed',
  stalled: 'floorMatrixLegendStalled',
}

/** Brief 078 / v6 §7.4 — the seven-item legend, in the handoff's exact
 *  order (previously six items, 'not_applicable' first; v6 puts it last
 *  and adds 'qc_failed' between 'qc_passed' and 'stalled'). */
const LEGEND_ORDER: MatrixCellState[] = ['not_started', 'in_progress', 'awaiting_qc', 'qc_passed', 'qc_failed', 'stalled', 'not_applicable']

/**
 * Brief 056 — the floor x sub-stage colour matrix itself. Colour block
 * only inside every cell (§5: "No text, no counts, no percentages") — the
 * state is carried entirely by the cell's own class, nothing rendered as
 * content. Every non-'not_applicable' cell is a link (§6) to that
 * SPECIFIC sub-stage on /update, landing on the anchor FloorBreakdown.tsx
 * gives that row (Migration 024-era SubStageRowView, extended this round
 * with `id={"substage-" + subStage.id}` plus an auto-expand-on-hash
 * effect, since that panel is collapsed by default and a bare #hash link
 * would otherwise land on nothing visible).
 */
export function FloorMatrix({
  projectId,
  rows,
  t,
}: {
  projectId: string
  rows: MatrixRow[]
  t: (key: DictionaryKey) => string
}) {
  if (rows.length === 0) {
    return <p className="empty-state">{t('floorMatrixEmptyNoFloors')}</p>
  }

  return (
    <div className="floor-matrix">
      <div className="floor-matrix__legend" aria-label={t('floorMatrixLegendTitle')}>
        {LEGEND_ORDER.map((state) => (
          <span
            key={state}
            /* v6 §7.4 — at 390px the legend is a two-column grid and
               "Complete, awaiting QC" is the one label that spans both
               columns (it does not fit half of 390px without breaking
               mid-phrase; every other label pairs). */
            className={state === 'awaiting_qc' ? 'floor-matrix__legend-item floor-matrix__legend-item--span-2' : 'floor-matrix__legend-item'}
          >
            <span className={`floor-matrix__cell floor-matrix__cell--${state} floor-matrix__legend-swatch`} aria-hidden="true" />
            {t(LEGEND_KEYS[state])}
          </span>
        ))}
      </div>

      <div className="floor-matrix__scroll">
        <table className="floor-matrix__table">
          <thead>
            <tr>
              <th className="floor-matrix__corner">{t('floorMatrixFloorColumnHeader')}</th>
              {MATRIX_COLUMNS.map((col) => (
                <th key={`${col.stage}-${col.subStage}`} className="floor-matrix__col-head">
                  {t(SUB_STAGE_KEYS[col.subStage] ?? 'subStageFirstFix')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.floorId}>
                <th scope="row" className="floor-matrix__row-head">
                  {row.label}
                </th>
                {row.cells.map((cell, i) => {
                  const key = `${row.floorId}-${i}`
                  if (cell.state === 'not_applicable' || !cell.subStageId) {
                    return <td key={key} className="floor-matrix__cell-wrap" aria-hidden="true" />
                  }
                  return (
                    <td key={key} className="floor-matrix__cell-wrap">
                      <Link
                        href={`/projects/${projectId}/update#substage-${cell.subStageId}`}
                        className={`floor-matrix__cell floor-matrix__cell--${cell.state}`}
                        aria-label={t(LEGEND_KEYS[cell.state])}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
