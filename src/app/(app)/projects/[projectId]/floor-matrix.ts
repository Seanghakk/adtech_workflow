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

export type MatrixCellState = 'not_applicable' | 'not_started' | 'in_progress' | 'awaiting_qc' | 'qc_passed' | 'stalled'

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
 * Brief §3/§4 — six states, RED WINS, except for one judgment call
 * (flagged, not silently decided): a row already 'done' with a PASSED
 * inspection is a terminal, fully resolved cell — nothing is pending on
 * it — so staleness does not turn it red. "RED = delay only" (§3's own
 * Rev 2 palette constraint) reads as "something is pending and hasn't
 * moved," which does not describe a passed, closed-out sub-stage. Every
 * OTHER state (not started, in progress, done-awaiting-QC) still has
 * something pending, so staleness overrides those exactly as §4 says:
 * "regardless of how far along the stage is."
 */
export function computeCellState(args: { row: SubStageInput | undefined; hasPassedInspection: boolean; daysSinceUpdate: number; isStale: (days: number) => boolean }): MatrixCellState {
  const { row, hasPassedInspection, daysSinceUpdate, isStale } = args
  if (!row) return 'not_applicable'

  if (row.status === 'done') {
    if (hasPassedInspection) return 'qc_passed'
    return isStale(daysSinceUpdate) ? 'stalled' : 'awaiting_qc'
  }
  if (row.status === 'in_progress') {
    return isStale(daysSinceUpdate) ? 'stalled' : 'in_progress'
  }
  return isStale(daysSinceUpdate) ? 'stalled' : 'not_started'
}

export function buildMatrixRows(args: {
  towers: TowerInput[]
  floors: FloorInput[]
  subStages: SubStageInput[]
  passedSubStageIds: Set<string>
  daysSinceUpdate: (updatedAt: string) => number
  isStale: (days: number) => boolean
}): MatrixRow[] {
  const { towers, floors, subStages, passedSubStageIds, daysSinceUpdate, isStale } = args
  const orderedFloors = orderFloors(towers, floors)

  return orderedFloors.map((floor) => {
    const cells: MatrixCell[] = MATRIX_COLUMNS.map((col) => {
      const row = subStages.find((s) => s.floorId === floor.id && s.stage === col.stage && s.subStage === col.subStage)
      const state = computeCellState({
        row,
        hasPassedInspection: row ? passedSubStageIds.has(row.id) : false,
        daysSinceUpdate: row ? daysSinceUpdate(row.updatedAt) : 0,
        isStale,
      })
      return { state, subStageId: row?.id ?? null }
    })
    return { floorId: floor.id, label: floor.label, cells }
  })
}
