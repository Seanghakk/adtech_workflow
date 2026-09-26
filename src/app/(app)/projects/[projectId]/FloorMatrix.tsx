import Link from 'next/link'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { MATRIX_COLUMNS, type MatrixCellState } from './floor-matrix'
import type { SystemMatrixRow } from './floor-matrix'


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
/**
 * Brief 101 — the matrix's own column labels, taken from mockup 9a,
 * which abbreviates them: "First fix", "Second fix", "Third fix",
 * "Pre-comm", "Comm". NOT invented here — 9a draws these exact words.
 *
 * The full dictionary names ("First fix — cable containment") are still
 * what every other screen shows, and still what the legend and the
 * update screen use. They cannot be used HERE: with five equal columns
 * they wrap to three or four lines at 1024px and are unreadable at
 * 390px, and it was precisely their length that used to size the
 * columns. A column of colour swatches needs a short label; the long
 * name belongs where there is room for it.
 */
const MATRIX_COL_KEYS: Record<string, DictionaryKey> = {
  first_fix: 'floorMatrixColFirstFix',
  second_fix: 'floorMatrixColSecondFix',
  third_fix: 'floorMatrixColThirdFix',
  pre_commissioning: 'floorMatrixColPreCommissioning',
  commissioning: 'floorMatrixColCommissioning',
}

const LEGEND_ORDER: MatrixCellState[] = ['not_started', 'in_progress', 'awaiting_qc', 'qc_passed', 'qc_failed', 'stalled', 'not_applicable']

/**
 * Brief 056 — the floor x sub-stage colour matrix itself. Colour block
 * only inside every cell (§5: "No text, no counts, no percentages") — the
 * state is carried entirely by the cell's own class, nothing rendered as
 * content. Every non-'not_applicable' cell is a link (§6) to that
 * floor on /update. Brief 103 §22.10: the incoming links all use
 * ?floor= now, which opens that floor and scrolls its header to the top
 * of the work register. It used to be #substage-<id>, an anchor into a
 * flat list that no longer exists — §22.4 opens and closes floors, so a
 * bare hash would have landed on a collapsed row.
 *
 * Brief 101 — REBUILT ON THE SHARED DATA TABLE (v7.2/v7.3 §4.2).
 *
 * This was an HTML <table> with border-collapse and its own
 * .floor-matrix__table/__col-head/__row-head/__cell-wrap rules: a
 * near-copy of the shared part, which is the sprawl §4 exists to stop.
 * Three of the review's observations came straight out of that copy —
 * columns sized by header text, header padding that never applied, and
 * a 1px hairline where §4.2 wants a 2px rule under the header.
 *
 * It is now .wf-data-table, the part Brief 097 built to §4.2, with
 * grid-template-columns "96px repeat(5, 1fr)" exactly as mockup 9a
 * draws it: a fixed floor column and FIVE EQUAL sub-stage columns. The
 * header chrome, the row rules and the "no rule after the last row"
 * behaviour all now come from the shared part rather than from here.
 *
 * TABLE SEMANTICS ARE KEPT. §4.2 says "CSS grid, not table layout", and
 * 9a is divs — but a matrix read by a screen reader still needs row and
 * column headers, so the grid carries explicit ARIA roles (table / row /
 * columnheader / rowheader / cell). Dropping <th scope> for layout
 * without replacing it would have traded one defect for a worse one.
 */
const MATRIX_COL_ABBR: Record<string, DictionaryKey> = {
  first_fix: 'floorMatrixAbbrFirstFix',
  second_fix: 'floorMatrixAbbrSecondFix',
  third_fix: 'floorMatrixAbbrThirdFix',
  pre_commissioning: 'floorMatrixAbbrPreCommissioning',
  commissioning: 'floorMatrixAbbrCommissioning',
}

export function FloorMatrix({
  projectId,
  rows,
  t,
  systemCaptions,
  systemsWithoutCoverage,
}: {
  projectId: string
  rows: SystemMatrixRow[]
  t: (key: DictionaryKey) => string
  /** §11.5 — the per-system header caption, precomputed by the page so the
   *  grid does not re-derive coverage per render. */
  systemCaptions: Record<string, { count: number; range: string | null }>
  /** §11.5 — systems covering nothing. Named in a sentence beneath the
   *  grid rather than drawn as a column of dashed cells. */
  systemsWithoutCoverage: { id: string; name: string }[]
}) {
  if (rows.length === 0) {
    return <p className="empty-state">{t('floorMatrixEmptyNoFloors')}</p>
  }

  // Every row carries the same groups in the same order, so the header can
  // read them off the first.
  const systems = rows[0].groups

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
        {/* §11.5 — the abbreviations spelled out, built from the SAME
            labels every other screen uses. Hardcoding the sentence would
            let it drift the first time a sub-stage is renamed. */}
        <span className="floor-matrix__abbr-key">
          {MATRIX_COLUMNS.map(
            (col) =>
              `${t(MATRIX_COL_ABBR[col.subStage] ?? 'floorMatrixAbbrFirstFix')} ${t(
                MATRIX_COL_KEYS[col.subStage] ?? 'floorMatrixColFirstFix',
              )}`,
          ).join(' · ')}
        </span>
      </div>

      {/* The shared §4.2 data table. Every row repeats the same
          grid-template-columns, which is what makes the five sub-stage
          columns equal instead of sized by their own header text. */}
      <div className="wf-data-table floor-matrix__grid" role="table" aria-label={t('floorMatrixLegendTitle')}>
        {/* §11.5 — each system is a group of five columns under its own
            header, with its coverage stated beside it. Groups sit in
            Project setup order, the same order §22.6a uses. */}
        <div className="wf-data-table__row wf-data-table__row--head floor-matrix__system-head" role="row">
          <div className="wf-data-table__head-cell" role="columnheader">
            {t('floorMatrixFloorColumnHeader')}
          </div>
          {systems.map((sys) => (
            <div key={sys.systemId} className="floor-matrix__system-group" role="columnheader">
              <span className="floor-matrix__system-name">{sys.systemName}</span>
              <span className="floor-matrix__system-coverage">
                {systemCaptions[sys.systemId]?.range
                  ? `${systemCaptions[sys.systemId].range} · ${systemCaptions[sys.systemId].count} ${t('floorMatrixFloorsSuffix')}`
                  : `${systemCaptions[sys.systemId]?.count ?? 0} ${t('floorMatrixFloorsSuffix')}`}
              </span>
            </div>
          ))}
        </div>

        <div className="wf-data-table__row wf-data-table__row--head" role="row">
          <div className="wf-data-table__head-cell" role="columnheader" />
          {systems.map((sys) =>
            MATRIX_COLUMNS.map((col) => (
              <div
                key={`${sys.systemId}-${col.stage}-${col.subStage}`}
                className="wf-data-table__head-cell floor-matrix__col-abbr"
                role="columnheader"
              >
                {/* §11.5 — abbreviated in each group, spelled out once
                    under the legend. Five full labels per system would not
                    fit six systems at 1024px. */}
                {t(MATRIX_COL_ABBR[col.subStage] ?? 'floorMatrixAbbrFirstFix')}
              </div>
            )),
          )}
        </div>

        {rows.map((row) => (
          <div key={row.floorId} className="wf-data-table__row wf-data-table__row--body" role="row">
            <div className="floor-matrix__row-head" role="rowheader">
              {row.label}
            </div>
            {row.groups.map((group) =>
              group.cells.map((cell, i) => {
                const key = `${row.floorId}-${group.systemId}-${i}`
                // §11.2 — "not applicable" is now REAL: a floor outside this
                // system's coverage. It is drawn, not skipped, so the row
                // stays one line across every system and floors keep
                // aligning; an empty div would collapse the grid.
                if (cell.state === 'not_applicable' || !cell.subStageId) {
                  return (
                    <div key={key} role="cell">
                      <span
                        className="floor-matrix__cell floor-matrix__cell--not_applicable"
                        aria-label={`${row.label} · ${group.systemName} · ${t('floorMatrixLegendNotApplicable')}`}
                      />
                    </div>
                  )
                }
                return (
                  <div key={key} role="cell">
                    <Link
                      href={`/projects/${projectId}/update?floor=${row.floorId}`}
                      className={`floor-matrix__cell floor-matrix__cell--${cell.state}`}
                      aria-label={`${row.label} · ${group.systemName} · ${t(LEGEND_KEYS[cell.state])}`}
                    />
                  </div>
                )
              }),
            )}
          </div>
        ))}
      </div>

      {/* §11.5 — one sentence per system with no coverage, with the way to
          fix it. Never a column of dashed cells. */}
      {systemsWithoutCoverage.map((sys) => (
        <p key={sys.id} className="floor-matrix__no-coverage">
          <strong>{sys.name}</strong> {t('floorMatrixSystemNoCoveragePrefix')}{' '}
          <Link href={`/projects/${projectId}/setup`}>
            {t('floorMatrixSystemNoCoverageAction')}
          </Link>
        </p>
      ))}
    </div>
  )
}
