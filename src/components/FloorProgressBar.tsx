import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { barSegments, BAR_COUNT_LABEL_KEYS, type CellCounts } from '@/lib/updatePage/summary'

/**
 * Brief 103 — the §10 Floor progress bar, EXTRACTED so it can be reused.
 *
 * Brief 106b reordered it. Segments now run by DONE-NESS, as mockup 10b
 * draws them, with not started last as the unfilled tail. See BAR_ORDER in
 * src/lib/updatePage/summary.ts for why the drawing wins over §10's
 * "matrix order" sentence. Both callers change together, which is right:
 * it is one component, and a bar that reads as unfilled reads that way on
 * the Complete block too.
 *
 * v7.4 §22.10 says of the Complete block: "reuse that component and the
 * display-state function; do not draw a second one." There was no
 * component — the bar was inline JSX inside /floor-progress's own page,
 * so "reuse" could only have meant copy-and-paste, which is drawing a
 * second one with extra steps. It is a component now, and both the
 * cross-project list and the update page's summary register render THIS.
 *
 * The fills are the matrix's own cell classes (.floor-matrix__cell--*),
 * not a private palette, so §22.2's "the seven matrix fills in matrix
 * order" is true by construction: if Brief 101 changes a fill, this
 * follows. Segment order is matrix order, zero-count segments are
 * omitted, and "Not applicable" therefore appears only above zero.
 */
export function FloorProgressBar({
  counts,
  t,
  showCounts = true,
}: {
  counts: CellCounts
  t: (key: DictionaryKey) => string
  /** The cross-project list wants the one-line count summary; the
   *  summary register draws its own legend rows instead (§22.2). */
  showCounts?: boolean
}) {
  const segments = barSegments(counts)
  const total = segments.reduce((n, s) => n + s.count, 0)

  return (
    <>
      <div className="cross-list__bar" aria-hidden="true">
        {segments.map((s) => (
          <span
            key={s.state}
            className={[
              'floor-matrix__cell',
              `floor-matrix__cell--${s.state}`,
              'cross-list__bar-segment',
              // Not started is the UNFILLED TAIL, not a segment: mockup 10b
              // draws it `flex:1; background:#fff` with no border of its
              // own. Keeping the matrix cell's hairline here is what made a
              // mostly-not-started bar read as an empty track — the rule is
              // near-invisible against the track's own border, which is the
              // same rgba(32,30,29,.25).
              s.state === 'not_started' ? 'cross-list__bar-segment--tail' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            // flex-grow only for the tail, so it takes whatever remains
            // rather than a share proportional to its count.
            style={s.state === 'not_started' ? { flex: 1 } : { flex: s.count }}
          />
        ))}
      </div>
      {showCounts && (
        <div className="cross-list__bar-counts">
          {segments.map((s) => `${s.count} ${t(BAR_COUNT_LABEL_KEYS[s.state]!)}`).join(' · ')}
          {total === 0 && '—'}
        </div>
      )}
    </>
  )
}

/**
 * §22.2's legend, which is the bar's own counts as ROWS rather than one
 * line: "swatch 18×12, label 12px secondary, count Almarai 800 13px
 * right". Only the update page uses this shape.
 */
export function FloorProgressLegend({
  counts,
  t,
}: {
  counts: CellCounts
  t: (key: DictionaryKey) => string
}) {
  return (
    <ul className="update-summary__legend">
      {barSegments(counts).map((s) => (
        <li key={s.state} className="update-summary__legend-row">
          <span
            className={`floor-matrix__cell floor-matrix__cell--${s.state} update-summary__legend-swatch`}
            aria-hidden="true"
          />
          <span className="update-summary__legend-label">{t(BAR_COUNT_LABEL_KEYS[s.state]!)}</span>
          <span className="update-summary__legend-count">{s.count}</span>
        </li>
      ))}
    </ul>
  )
}
