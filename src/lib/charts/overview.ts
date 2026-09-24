/**
 * Brief 100 Part D — the Execution overview's charts (v7.2 §13, §21.6).
 *
 * Pure: every series and every "is there anything to draw" decision is
 * computed here from rows passed in, so the states §21.6 names — no
 * points, one point, nothing started — can be tested directly rather than
 * only looked at.
 *
 * §13's binding rule, restated because it is the whole shape of the line:
 * ACTUAL ONLY. No project carries a planned baseline today, so there is no
 * target line and no red gap band. `--wf-hatch-red` stays in the token set
 * for when a baseline exists; nothing here draws it.
 */
import { computeSubStageDisplayState, resolveLatestInspection } from '@/lib/subStageDisplayState'

// ---------------------------------------------------------------------------
// The line — progress over time, actual only
// ---------------------------------------------------------------------------

export interface ProgressPoint {
  /** ISO timestamp the reading was recorded at. */
  at: string
  /** 0–100. */
  percent: number
}

export type LineState =
  /** §21.6 "Line, no points". */
  | { kind: 'no-points'; hasFloors: boolean }
  /** §21.6 "Line, one point" — axes and a single terminal mark, no line. */
  | { kind: 'one-point'; point: ProgressPoint }
  /** Two or more readings: the line is drawable. */
  | { kind: 'line'; points: ProgressPoint[] }

/**
 * A reading per day is enough for this chart, and the history table can
 * carry many in one day (every floor rollup writes one). Collapsing to the
 * LAST reading per day keeps the line honest — the figure that stood at
 * the end of that day — rather than drawing a saw-tooth of intermediate
 * rollups that never meant anything on their own.
 */
export function collapseToDailyPoints(rows: ProgressPoint[]): ProgressPoint[] {
  const byDay = new Map<string, ProgressPoint>()
  for (const r of [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())) {
    byDay.set(r.at.slice(0, 10), r)
  }
  return [...byDay.values()]
}

export function deriveLineState(rows: ProgressPoint[], hasFloors: boolean): LineState {
  const points = collapseToDailyPoints(rows)
  if (points.length === 0) return { kind: 'no-points', hasFloors }
  if (points.length === 1) return { kind: 'one-point', point: points[0] }
  return { kind: 'line', points }
}

export interface LinePlot {
  /** Polyline points in viewBox units, ready for an SVG `points` attribute. */
  path: string
  /** The last point, for §13's 4px terminal dot. */
  terminal: { x: number; y: number }
  /** Four horizontal gridlines (§13), as y values in viewBox units. */
  gridlines: number[]
}

export interface PlotBox {
  width: number
  height: number
  padLeft: number
  padBottom: number
  padTop: number
  padRight: number
}

/**
 * Maps points into the plot area. The y axis is pinned to 0–100 rather
 * than scaled to the data's own range: a project that moved 31% → 33%
 * should look like it barely moved, not like it crossed the chart.
 */
export function plotLine(points: ProgressPoint[], box: PlotBox): LinePlot {
  const innerW = box.width - box.padLeft - box.padRight
  const innerH = box.height - box.padTop - box.padBottom
  const lastIndex = Math.max(1, points.length - 1)

  const xy = points.map((p, i) => ({
    x: box.padLeft + (i / lastIndex) * innerW,
    y: box.padTop + (1 - Math.min(100, Math.max(0, p.percent)) / 100) * innerH,
  }))

  // Four gridlines, evenly through the plot area (25/50/75/100 of height).
  const gridlines = [0.2, 0.4, 0.6, 0.8].map((f) => box.padTop + f * innerH)

  return {
    path: xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    terminal: xy[xy.length - 1],
    gridlines,
  }
}

// ---------------------------------------------------------------------------
// The donut — status split of sub-stages that have STARTED
// ---------------------------------------------------------------------------

/** §13's four segments, and no more. */
export type DonutSegmentKey = 'done' | 'in_progress' | 'waiting' | 'delayed'

export interface SubStageInput {
  status: 'not_started' | 'in_progress' | 'done'
  inspections: Array<{ result: 'pass' | 'fail'; date: string }>
}

export interface DonutSegment {
  key: DonutSegmentKey
  count: number
  /** Fraction of the started total, 0–1. */
  fraction: number
}

/**
 * Maps the shared display-state rule's five values onto §13's four
 * segments. `not_started` is deliberately not a segment: the donut is the
 * split of work that HAS started, which is why §21.6's empty state for it
 * is "No sub-stages started on this project yet" rather than a donut of
 * one grey ring.
 *
 *   in_progress  -> in progress
 *   awaiting_qc  -> waiting   (done, nobody has inspected it)
 *   qc_passed    -> done
 *   qc_failed    -> delayed   (it came back; the work is not behind it yet)
 *
 * The qc_failed -> delayed mapping is the one judgement here: §13 reserves
 * red for delay, and a sub-stage that failed inspection is the one started
 * state that has actually lost time. Flagged in the Result doc.
 */
export function buildDonut(subStages: SubStageInput[]): DonutSegment[] {
  const counts: Record<DonutSegmentKey, number> = {
    done: 0,
    in_progress: 0,
    waiting: 0,
    delayed: 0,
  }

  for (const s of subStages) {
    const state = computeSubStageDisplayState({
      status: s.status,
      latestInspection: resolveLatestInspection(s.inspections),
    })
    if (state === 'not_started') continue
    if (state === 'in_progress') counts.in_progress += 1
    else if (state === 'awaiting_qc') counts.waiting += 1
    else if (state === 'qc_passed') counts.done += 1
    else if (state === 'qc_failed') counts.delayed += 1
  }

  const total = counts.done + counts.in_progress + counts.waiting + counts.delayed
  if (total === 0) return []

  return (['done', 'in_progress', 'waiting', 'delayed'] as const)
    .map((key) => ({ key, count: counts[key], fraction: counts[key] / total }))
    .filter((s) => s.count > 0)
}

export interface DonutArc {
  key: DonutSegmentKey
  /** stroke-dasharray for a circle of the given radius. */
  dashArray: string
  dashOffset: number
}

/**
 * §13: 140px box, r=57, stroke 26, rotated −90° so the first segment
 * starts at twelve o'clock. Segments are drawn as dash segments on one
 * circle, which keeps radius 0 corners irrelevant and needs no arc maths.
 */
export function donutArcs(segments: DonutSegment[], radius: number): DonutArc[] {
  const circumference = 2 * Math.PI * radius
  let consumed = 0
  return segments.map((s) => {
    const length = s.fraction * circumference
    const arc: DonutArc = {
      key: s.key,
      dashArray: `${length.toFixed(2)} ${(circumference - length).toFixed(2)}`,
      // `|| 0` normalises the -0 that negating zero produces: harmless in
      // SVG, but it should not leak into a serialised value or a test.
      dashOffset: -consumed || 0,
    }
    consumed += length
    return arc
  })
}

// ---------------------------------------------------------------------------
// The concurrency bars — §13's required pattern
// ---------------------------------------------------------------------------

export interface ConcurrencyBar {
  /** Dictionary key for the stage's own label. */
  stage: string
  reached: number
  total: number
  /** 0–1, for the bar's own width. */
  fraction: number
}

/**
 * §13: "independent horizontal bars all starting at the same left edge,
 * each with its own 'n / 30 fl' figure". Five bars of visibly different
 * lengths communicate concurrent-and-staggered with no explanatory copy —
 * so each bar is its own count out of the same floor total, NOT a
 * cumulative funnel.
 */
export function buildConcurrencyBars(
  stages: Array<{ stage: string; reached: number }>,
  totalFloors: number,
): ConcurrencyBar[] {
  return stages.map((s) => ({
    stage: s.stage,
    reached: s.reached,
    total: totalFloors,
    fraction: totalFloors === 0 ? 0 : Math.min(1, s.reached / totalFloors),
  }))
}
