/**
 * Brief 056 — floor x sub-stage colour matrix, pure data shaping. No
 * database migration (brief §1: reads existing data only) — this module
 * only rearranges what update/page.tsx and shop-drawing-boq/floor-
 * columns.ts already read the same way elsewhere in this app.
 *
 * COLUMN COUNT — a judgment call, flagged here rather than silently
 * decided (brief §0's own standing rule): §2 lists columns as "first fix,
 * second fix, third fix, pre-commissioning, commissioning, and the QC
 * inspection gates," and §5 says "roughly 12 floors x 6 stages... around
 * 72 cells" (12 x 6 = 72 exactly, which could read as a 6th "material QC"
 * column). But §6's entire drill-through spec is written purely in terms
 * of an individual floor_sub_stages row ("land on that SPECIFIC
 * sub-stage... the destination already exists — Brief 024 built the
 * floor sub-stage UI") with no landing target described for a
 * project-level material inspection, which has no per-floor anchor
 * anywhere in the existing UI. Read literally, "the existing sub-stages...
 * and the QC inspection gates" is taken as ONE list describing where each
 * of the 5 real sub-stage columns' cell colour comes from (floor_sub_
 * stages.status AND qc_inspections), not a distinct 6th column — "roughly
 * .../around ..." is taken as the hedge it's written as, not exact
 * arithmetic. DECIDED: 5 columns, the same 5 canonical sub_stage values
 * floor_sub_stages has always had (migration 008) and FloorBreakdown.tsx
 * already renders. If a Material QC column turns out to be wanted after
 * all, it needs its own drill-through target designed first — not
 * bolted on here as a guess.
 */

import { computeSubStageDisplayState, type LatestInspection } from '@/lib/subStageDisplayState'

export type MatrixCellState = 'not_applicable' | 'not_started' | 'in_progress' | 'awaiting_qc' | 'qc_passed' | 'qc_failed' | 'stalled'

export interface MatrixColumn {
  stage: 'installation' | 'tnc'
  subStage: string
}

/** The 5 canonical (stage, sub_stage) pairs migration 008 seeds onto
 *  every floor — same set FloorBreakdown.tsx's SUB_STAGE_KEYS covers, in
 *  the same canonical order, per brief §2 ("derive the columns from what
 *  the schema already defines, in the existing canonical order"). */
export const MATRIX_COLUMNS: MatrixColumn[] = [
  { stage: 'installation', subStage: 'first_fix' },
  { stage: 'installation', subStage: 'second_fix' },
  { stage: 'installation', subStage: 'third_fix' },
  { stage: 'tnc', subStage: 'pre_commissioning' },
  { stage: 'tnc', subStage: 'commissioning' },
]

export interface TowerInput {
  id: string
  label: string
  sortOrder: number
}

export interface FloorInput {
  id: string
  label: string
  sortOrder: number
  towerId: string | null
}

export interface SubStageInput {
  id: string
  floorId: string
  stage: string
  subStage: string
  status: string
  updatedAt: string
}

export interface MatrixCell {
  state: MatrixCellState
  /** null only for 'not_applicable' — nothing to link to. */
  subStageId: string | null
}

export interface MatrixRow {
  floorId: string
  /** "<Tower> - <Floor>" or the bare floor label for a no-tower floor —
   *  same combined-label convention as shop-drawing-boq/floor-columns.ts's
   *  buildFloorColumns (not imported directly: that file lives under a
   *  sibling route folder, and this app's own convention, confirmed by
   *  grepping every existing cross-route import under projects/
   *  [projectId]/, is that page-local helpers stay page-local — so this
   *  mirrors that ordering/label logic rather than reaching across
   *  folders for an 8-line function). */
  label: string
  cells: MatrixCell[]
}

/** Same "no-tower floors first, then each tower in sort_order, its own
 *  floors in sort_order" rule as buildFloorColumns — brief §2's "existing
 *  floor display order" (Brief 047). */
export function orderFloors(towers: TowerInput[], floors: FloorInput[]): (FloorInput & { label: string })[] {
  const sortedTowers = [...towers].sort((a, b) => a.sortOrder - b.sortOrder)
  const noTowerFloors = floors.filter((f) => f.towerId === null).sort((a, b) => a.sortOrder - b.sortOrder)

  const ordered: (FloorInput & { label: string })[] = noTowerFloors.map((f) => ({ ...f, label: f.label }))

  for (const tower of sortedTowers) {
    const towerFloors = floors.filter((f) => f.towerId === tower.id).sort((a, b) => a.sortOrder - b.sortOrder)
    for (const floor of towerFloors) {
      ordered.push({ ...floor, label: `${tower.label} - ${floor.label}` })
    }
  }

  return ordered
}

/**
 * Brief §3/§4, revised by Brief 078 / v6 §7 — RED WINS, except for one
 * judgment call (flagged, not silently decided): a row already 'done'
 * with the LATEST inspection PASSED is a terminal, fully resolved cell —
 * nothing is pending on it — so staleness does not turn it red. "RED =
 * delay only" (§3's own Rev 2 palette constraint) reads as "something is
 * pending and hasn't moved," which does not describe a passed, closed-out
 * sub-stage. Every OTHER state — not started, in progress,
 * done-awaiting-QC, and (v6 §7.3, new) done-QC-FAILED — still has
 * something pending, so staleness overrides those exactly as §4 says:
 * "regardless of how far along the stage is." QC failed is not an
 * exception: a fail nobody has picked up is rework nobody picked up,
 * which is the worst thing on a floor.
 *
 * The actual QC/pass/fail state itself now comes from the ONE shared
 * rule in src/lib/subStageDisplayState.ts (v6 §7.1), not derived here a
 * second time — this function's own remaining job is layering the
 * matrix's staleness override on top of that shared result.
 *
 * v6 §7.3 — THE CLOCK CHANGE: for a cell the shared rule resolves to
 * qc_failed, staleness counts from the FAILED INSPECTION'S OWN DATE
 * (latestInspection.date), not the sub-stage's status date. A failed
 * cell's status never changes (the installer's "done" stands; only a new
 * inspection can clear it), so counting from the status date would
 * freeze the clock on exactly the cells that most need it. Every other
 * state still counts from the status's own updated_at, as before.
 */
export function computeCellState(args: { row: SubStageInput | undefined; latestInspection: LatestInspection | null; daysSince: (isoDate: string) => number; isStale: (days: number) => boolean }): MatrixCellState {
  const { row, latestInspection, daysSince, isStale } = args
  if (!row) return 'not_applicable'

  const displayState = computeSubStageDisplayState({
    status: row.status as 'not_started' | 'in_progress' | 'done',
    latestInspection,
  })

  if (displayState === 'qc_passed') return 'qc_passed'

  const clockDate = displayState === 'qc_failed' && latestInspection ? latestInspection.date : row.updatedAt
  return isStale(daysSince(clockDate)) ? 'stalled' : displayState
}

export function buildMatrixRows(args: {
  towers: TowerInput[]
  floors: FloorInput[]
  subStages: SubStageInput[]
  /** Each sub-stage's own LATEST inspection (v6 §7.1 — "latest wins"), or
   *  null when it has none. Callers resolve this via
   *  resolveLatestInspection (src/lib/subStageDisplayState.ts) — this
   *  function no longer resolves "any pass ever" itself, since that rule
   *  was the exact bug Brief 078 fixes (a fail after an old pass used to
   *  stay green forever). */
  latestInspectionBySubStageId: Map<string, LatestInspection | null>
  daysSince: (isoDate: string) => number
  isStale: (days: number) => boolean
}): MatrixRow[] {
  const { towers, floors, subStages, latestInspectionBySubStageId, daysSince, isStale } = args
  const orderedFloors = orderFloors(towers, floors)

  return orderedFloors.map((floor) => {
    const cells: MatrixCell[] = MATRIX_COLUMNS.map((col) => {
      const row = subStages.find((s) => s.floorId === floor.id && s.stage === col.stage && s.subStage === col.subStage)
      const state = computeCellState({
        row,
        latestInspection: row ? (latestInspectionBySubStageId.get(row.id) ?? null) : null,
        daysSince,
        isStale,
      })
      return { state, subStageId: row?.id ?? null }
    })
    return { floorId: floor.id, label: floor.label, cells }
  })
}

// ---------------------------------------------------------------------------
// Brief 106b — the system × floor × sub-stage matrix (v7.4 §11.5, D096)
// ---------------------------------------------------------------------------

export interface MatrixSystem {
  id: string
  name: string
  /** Floor ids this system covers. A floor outside it has no cells — which
   *  is what §11.2's "not applicable" now MEANS. */
  coveredFloorIds: Set<string>
}

export interface MatrixSystemGroup {
  systemId: string
  systemName: string
  /** Five cells, in MATRIX_COLUMNS order. All 'not_applicable' where this
   *  system does not cover the row's floor. */
  cells: MatrixCell[]
}

export interface SystemMatrixRow {
  floorId: string
  label: string
  groups: MatrixSystemGroup[]
}

/**
 * §11.5 — one grid, floors stay rows, each system a group of five columns.
 *
 * Why not the alternatives, from the design itself: stacking a grid per
 * system puts one floor in four places a screen apart; a system selector
 * above one grid hides three quarters of the project and turns one pattern
 * into four page views. Side by side keeps each floor on one line.
 *
 * THE POINT OF D096 IS VISIBLE HERE. Before it, every system was measured
 * against every floor, so "not applicable" could not be produced at all
 * (Brief 101 found the app could not render §11.2's seventh legend state).
 * A floor outside a system's coverage now genuinely has no cell, and that
 * absence is what the dashed fill draws.
 */
export function buildSystemMatrixRows(args: {
  towers: TowerInput[]
  floors: FloorInput[]
  systems: MatrixSystem[]
  /** Every cell that exists, already carrying its system. */
  cells: (SubStageInput & { systemId: string })[]
  latestInspectionBySubStageId: Map<string, LatestInspection | null>
  daysSince: (isoDate: string) => number
  isStale: (days: number) => boolean
}): SystemMatrixRow[] {
  const { towers, floors, systems, cells, latestInspectionBySubStageId, daysSince, isStale } = args
  const orderedFloors = orderFloors(towers, floors)

  return orderedFloors.map((floor) => ({
    floorId: floor.id,
    label: floor.label,
    groups: systems.map((system) => {
      // Not covered: five not_applicable cells. Deliberately NOT an empty
      // group — the row must stay one line across every system, or floors
      // stop aligning and the grid loses the only thing it is for.
      if (!system.coveredFloorIds.has(floor.id)) {
        return {
          systemId: system.id,
          systemName: system.name,
          cells: MATRIX_COLUMNS.map(() => ({ state: 'not_applicable' as MatrixCellState, subStageId: null })),
        }
      }

      return {
        systemId: system.id,
        systemName: system.name,
        cells: MATRIX_COLUMNS.map((col) => {
          const row = cells.find(
            (c) =>
              c.systemId === system.id &&
              c.floorId === floor.id &&
              c.stage === col.stage &&
              c.subStage === col.subStage,
          )
          const state = computeCellState({
            row,
            latestInspection: row ? (latestInspectionBySubStageId.get(row.id) ?? null) : null,
            daysSince,
            isStale,
          })
          return { state, subStageId: row?.id ?? null }
        }),
      }
    }),
  }))
}

/**
 * §11.5's per-system header caption: "30 floors", "B3–B1 · 3 floors".
 *
 * A DIFFERENT SHAPE FROM §6.5's "Floors covered" on purpose. Setup is
 * answering "is this system where I think it is" and can afford to name
 * five floors; a column header has room for one short phrase and is read
 * while scanning a grid.
 */
export function systemCoverageCaption(
  orderedFloorIds: string[],
  orderedFloorLabels: string[],
  coveredFloorIds: Set<string>,
): { count: number; range: string | null } {
  const coveredIdx = orderedFloorIds
    .map((id, i) => (coveredFloorIds.has(id) ? i : -1))
    .filter((i) => i >= 0)

  if (coveredIdx.length === 0) return { count: 0, range: null }
  if (coveredIdx.length === orderedFloorIds.length) return { count: coveredIdx.length, range: null }

  const contiguous = coveredIdx.every((v, i) => i === 0 || v === coveredIdx[i - 1] + 1)
  return {
    count: coveredIdx.length,
    range: contiguous
      ? `${orderedFloorLabels[coveredIdx[0]]}–${orderedFloorLabels[coveredIdx[coveredIdx.length - 1]]}`
      : null,
  }
}
