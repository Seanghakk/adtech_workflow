/**
 * Brief 103 — the Update progress page's own derivations (v7.4 §22).
 *
 * Pure. Everything the summary register states, and everything that
 * decides which floors are open, is computed here so §22.9's states can
 * be tested rather than clicked through.
 *
 * Cell state itself is NOT recomputed: it comes from computeCellState in
 * floor-matrix.ts, which is the matrix's own helper over the shared
 * display-state function (§11.1). §22.2 says the bar is "the shared
 * display-state function over every floor × sub-stage cell", and the
 * matrix and this page disagreeing about a cell is exactly the failure
 * that helper exists to prevent.
 */
import type { MatrixCellState } from '@/app/(app)/projects/[projectId]/floor-matrix'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

/**
 * Matrix order (§11.2's legend order, minus 'not_applicable' which the
 * bar omits unless above zero). §22.2: "the seven matrix fills in matrix
 * order, 1px rule between segments, zero-count segments omitted".
 */
export const BAR_ORDER: MatrixCellState[] = [
  'not_started',
  'in_progress',
  'awaiting_qc',
  'qc_passed',
  'qc_failed',
  'stalled',
  'not_applicable',
]

export const BAR_COUNT_LABEL_KEYS: Partial<Record<MatrixCellState, DictionaryKey>> = {
  not_started: 'crossListFloorProgressNotStarted',
  in_progress: 'crossListFloorProgressInProgress',
  awaiting_qc: 'crossListFloorProgressAwaitingQc',
  qc_passed: 'crossListFloorProgressQcPassed',
  qc_failed: 'crossListFloorProgressQcFailed',
  stalled: 'crossListFloorProgressStalled',
  not_applicable: 'floorMatrixLegendNotApplicable',
}

export type CellCounts = Record<MatrixCellState, number>

export function emptyCounts(): CellCounts {
  return {
    not_applicable: 0,
    not_started: 0,
    in_progress: 0,
    awaiting_qc: 0,
    qc_passed: 0,
    qc_failed: 0,
    stalled: 0,
  }
}

export function countCellStates(states: MatrixCellState[]): CellCounts {
  const counts = emptyCounts()
  for (const s of states) counts[s] += 1
  return counts
}

/**
 * §22.2: zero-count segments are omitted, and "Not applicable" appears
 * "only when above zero" — which the general rule already covers, but
 * the document says it twice so it is worth saying once here.
 */
export function barSegments(counts: CellCounts): { state: MatrixCellState; count: number }[] {
  return BAR_ORDER.filter((s) => counts[s] > 0).map((s) => ({ state: s, count: counts[s] }))
}

/**
 * §22.3's definition, used by the filter AND by the floor band: "open =
 * any cell in progress, awaiting QC, failed or stalled". Note what is
 * NOT open: not_started (nothing has begun) and qc_passed (nothing left
 * to do). One definition, both callers.
 */
export const OPEN_STATES: MatrixCellState[] = ['in_progress', 'awaiting_qc', 'qc_failed', 'stalled']

export function isOpenState(state: MatrixCellState): boolean {
  return OPEN_STATES.includes(state)
}

export interface FloorCell {
  subStageId: string | null
  stage: string
  subStage: string
  state: MatrixCellState
  /** The date the age clock runs from — §11.4: for a failed cell the
   *  failed inspection's date, otherwise the last status change. */
  clockDate: string | null
  holderName: string | null
}

export interface FloorSummary {
  floorId: string
  label: string
  towerLabel: string | null
  cells: FloorCell[]
}

/**
 * §22.4: "The 5px left rule is the band of the oldest open cell,
 * transparent when nothing is open." Returns null for transparent.
 */
export function floorBand(floor: FloorSummary, ageOf: (iso: string | null) => number): MatrixCellState | null {
  const open = floor.cells.filter((c) => isOpenState(c.state))
  if (open.length === 0) return null
  return oldestCell(open, ageOf)?.state ?? null
}

function oldestCell(cells: FloorCell[], ageOf: (iso: string | null) => number): FloorCell | null {
  let best: FloorCell | null = null
  let bestAge = -1
  for (const c of cells) {
    const age = ageOf(c.clockDate)
    if (age > bestAge) {
      bestAge = age
      best = c
    }
  }
  return best
}

/** §22.3's filter: a floor "with open work" has at least one open cell. */
export function floorHasOpenWork(floor: FloorSummary): boolean {
  return floor.cells.some((c) => isOpenState(c.state))
}

// ---------------------------------------------------------------------------
// §22.2 Needs attention
// ---------------------------------------------------------------------------

export interface NeedsAttention {
  /** Null when nothing is open anywhere — then the all-clear line shows. */
  oldestUnmoved: {
    floorId: string
    floorLabel: string
    subStage: string
    holderName: string | null
    ageDays: number
    state: MatrixCellState
  } | null
  qcFailed: { count: number; firstFloorId: string | null; firstFloorLabel: string | null; firstSubStage: string | null }
  awaitingQc: { count: number; floorIds: string[]; floorLabels: string[] }
}

export function deriveNeedsAttention(
  floors: FloorSummary[],
  ageOf: (iso: string | null) => number,
): NeedsAttention {
  const openWithFloor = floors.flatMap((f) =>
    f.cells.filter((c) => isOpenState(c.state)).map((c) => ({ floor: f, cell: c })),
  )

  let oldest: { floor: FloorSummary; cell: FloorCell } | null = null
  let oldestAge = -1
  for (const entry of openWithFloor) {
    const age = ageOf(entry.cell.clockDate)
    if (age > oldestAge) {
      oldestAge = age
      oldest = entry
    }
  }

  const failed = floors.flatMap((f) =>
    f.cells.filter((c) => c.state === 'qc_failed').map((c) => ({ floor: f, cell: c })),
  )
  const awaiting = floors.flatMap((f) =>
    f.cells.filter((c) => c.state === 'awaiting_qc').map((c) => ({ floor: f, cell: c })),
  )
  const awaitingFloors = [...new Set(awaiting.map((a) => a.floor.floorId))]

  return {
    oldestUnmoved: oldest
      ? {
          floorId: oldest.floor.floorId,
          floorLabel: oldest.floor.label,
          subStage: oldest.cell.subStage,
          holderName: oldest.cell.holderName,
          ageDays: oldestAge,
          state: oldest.cell.state,
        }
      : null,
    qcFailed: {
      count: failed.length,
      firstFloorId: failed[0]?.floor.floorId ?? null,
      firstFloorLabel: failed[0]?.floor.label ?? null,
      firstSubStage: failed[0]?.cell.subStage ?? null,
    },
    awaitingQc: {
      count: awaiting.length,
      floorIds: awaitingFloors,
      floorLabels: awaitingFloors.map(
        (id) => floors.find((f) => f.floorId === id)?.label ?? '',
      ),
    },
  }
}

/** §22.2: all three at zero gives one sentence instead of an empty block. */
export function needsAttentionIsClear(n: NeedsAttention): boolean {
  return n.oldestUnmoved === null && n.qcFailed.count === 0 && n.awaitingQc.count === 0
}

// ---------------------------------------------------------------------------
// §22.5 which floors start open
// ---------------------------------------------------------------------------

/**
 * §22.5: "a project with four floors or fewer opens them all. Above
 * four, all are closed except the floor named in the URL."
 *
 * Deliberately NOT a stored preference — the URL carries it, so a
 * refresh keeps the view and a shared link opens what the sender saw.
 */
export const OPEN_ALL_THRESHOLD = 4

export function defaultOpenFloorIds(floorIds: string[], floorFromUrl: string | null): string[] {
  if (floorIds.length <= OPEN_ALL_THRESHOLD) return [...floorIds]
  if (floorFromUrl && floorIds.includes(floorFromUrl)) return [floorFromUrl]
  return []
}

// ---------------------------------------------------------------------------
// §22.2 Complete block — open item 21
// ---------------------------------------------------------------------------

export interface CompleteBasis {
  subStageCells: number
  /** §22.2 (D096) — named in the subline once above one. */
  systemCount: number
  drawings: number
  buckets: number
}

/**
 * The figure shown is the app's EXISTING calculation
 * (projects.percent_calculated), and §22.2 is explicit that the subline
 * "states its basis in words". Its example — "22 of 150 sub-stages QC
 * passed" — is not what this app computes, which open item 21 exists to
 * settle.
 *
 * What workflow.compute_project_rollup_percent actually does, read from
 * production and confirmed against a stored value:
 *   · one bucket per floor, plus one for project-level shop drawings
 *   · inside a bucket: done = 100, in progress = 50, anything else = 0
 *   · the figure is the mean of the bucket means
 * So it counts DRAWINGS as well as sub-stages, gives in-progress half
 * credit, and ignores QC entirely — a done cell scores 100 whether QC
 * passed, failed or never happened.
 *
 * This returns the parts; the wording lives in the dictionary so it can
 * be translated and replaced.
 */
export function completeBasis(
  floors: FloorSummary[],
  projectDrawings: number,
  floorDrawings: number,
  /** Brief 106b / §22.2 (D096) — how many systems the cells span. The
   *  figure's MEANING is unchanged (work recorded, in progress counts
   *  half, QC not counted); only its denominator moves, from one bucket
   *  per floor to one per COVERED (system, floor) pair. The subline has
   *  to say so, or the number appears to jump for no reason. */
  systemCount = 1,
  /** The number of covered (system, floor) pairs, counted by the caller
   *  from the coverage rows themselves. Passed in rather than derived
   *  here: this module sees cells, not coverage, and a cell cannot tell
   *  you about a covered pair that has yet to record anything. */
  coveredPairCount?: number,
): CompleteBasis {
  const subStageCells = floors.reduce((n, f) => n + f.cells.length, 0)
  return {
    subStageCells,
    systemCount,
    drawings: projectDrawings + floorDrawings,
    // One bucket per covered (system, floor) pair, plus the project-level
    // drawing bucket when it has any rows at all — an empty bucket
    // contributes nothing. Floors outside a system's coverage are not
    // counted against it, which is the point of coverage being real data.
    buckets: (coveredPairCount ?? floors.length) + (projectDrawings > 0 ? 1 : 0),
  }
}

// ---------------------------------------------------------------------------
// §22.8 the 390px floor picker
// ---------------------------------------------------------------------------

export type FloorOptionKind = 'stalled' | 'open' | 'awaiting' | 'all_passed' | 'not_started'

export interface FloorOption {
  kind: FloorOptionKind
  holderName: string | null
  ageDays: number
}

/**
 * §22.8: the native select's options state each floor's condition IN
 * WORDS, because a colour band means nothing in a system dropdown.
 *
 * §22.8 writes one example, for the stalled case only ("L7 — Dara Kim,
 * 19d, stalled"); Seanghakk supplied the other four in chat on 25 Sep
 * 2026 and they are listed in the Result doc. This returns the parts so
 * the words themselves stay in the dictionary.
 */
export function floorOption(floor: FloorSummary, ageOf: (iso: string | null) => number): FloorOption {
  const open = floor.cells.filter((c) => isOpenState(c.state))
  const allPassed =
    floor.cells.length > 0 && floor.cells.every((c) => c.state === 'qc_passed' || c.state === 'not_applicable')
  if (open.length === 0) {
    return { kind: allPassed ? 'all_passed' : 'not_started', holderName: null, ageDays: 0 }
  }

  let oldest = open[0]
  for (const c of open) if (ageOf(c.clockDate) > ageOf(oldest.clockDate)) oldest = c
  const ageDays = ageOf(oldest.clockDate)

  if (oldest.state === 'stalled') return { kind: 'stalled', holderName: oldest.holderName, ageDays }
  // Awaiting QC is about the inspection queue, not about a person still
  // working, so it names the state rather than a holder and an age.
  if (open.every((c) => c.state === 'awaiting_qc')) {
    return { kind: 'awaiting', holderName: null, ageDays }
  }
  return { kind: 'open', holderName: oldest.holderName, ageDays }
}
