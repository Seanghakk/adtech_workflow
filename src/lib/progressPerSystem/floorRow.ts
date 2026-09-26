/**
 * Brief 106b — a floor row once cells belong to systems (v7.4 §22.4, D096).
 *
 * Brief 106 §4.4 is the warning this module exists to obey: "The age ladder
 * is per cell. A floor row's holder and age now summarise several systems
 * with different holders and different ages. Follow the design's answer; do
 * not average, and never show a team where a person belongs."
 *
 * §22.4's answer, and the reasoning it carries:
 *   · the row names the holder of the OLDEST OPEN CELL ACROSS SYSTEMS, and
 *     names that cell's system — "Dara Kim · 19d on Access control first fix";
 *   · every other system with something open follows as AGE ONLY, oldest
 *     first — "Also open: CCTV 6d · PA/VA 2d";
 *   · the other holders are deliberately NOT named here. They are one click
 *     away in each system's own header (§22.6a), and a closed row that names
 *     four people answers a question nobody asked while burying the one that
 *     drives the band;
 *   · "n of m done" counts across every system covering the floor.
 *
 * Averaging ages, or showing "3 teams", would both break §1.1 — one owner,
 * one clock — which is why neither appears.
 */
import type { MatrixCellState } from '@/app/(app)/projects/[projectId]/floor-matrix'
import { isOpenState } from '@/lib/updatePage/summary'

export interface SystemCell {
  systemId: string
  systemName: string
  stage: string
  subStage: string
  state: MatrixCellState
  /** §11.4 — the failed inspection's date for a failed cell, else the last
   *  status change. Never substituted when missing. */
  clockDate: string | null
  holderName: string | null
}

export interface OpenSystemAge {
  systemId: string
  systemName: string
  ageDays: number
}

export interface FloorRowSummary {
  /** The oldest open cell anywhere on the floor. It drives the 5px band, the
   *  named holder and the age. Null when nothing is open. */
  oldest: {
    systemId: string
    systemName: string
    subStage: string
    holderName: string | null
    ageDays: number
    state: MatrixCellState
  } | null
  /** §22.4 — "Also open", age only, oldest first, excluding the system the
   *  row already names. */
  alsoOpen: OpenSystemAge[]
  doneCount: number
  totalCount: number
  /** True when every cell that exists has passed QC — §22.4's "All n QC
   *  passed · nothing open". Not the same as "nothing open": a floor with
   *  nothing started has nothing open either. */
  allQcPassed: boolean
  nothingStarted: boolean
}

export function summariseFloorRow(
  cells: SystemCell[],
  ageOf: (iso: string | null) => number,
): FloorRowSummary {
  const open = cells.filter((c) => isOpenState(c.state))

  // The oldest open cell across EVERY system on the floor. Ties resolve to
  // the first in project-setup order, which is the order the caller passes.
  let oldestCell: SystemCell | null = null
  let oldestAge = -1
  for (const c of open) {
    const age = ageOf(c.clockDate)
    if (age > oldestAge) {
      oldestAge = age
      oldestCell = c
    }
  }

  // Every OTHER system with something open, reduced to its own oldest age.
  const ageBySystem = new Map<string, OpenSystemAge>()
  for (const c of open) {
    if (oldestCell && c.systemId === oldestCell.systemId) continue
    const age = ageOf(c.clockDate)
    const existing = ageBySystem.get(c.systemId)
    if (!existing || age > existing.ageDays) {
      ageBySystem.set(c.systemId, { systemId: c.systemId, systemName: c.systemName, ageDays: age })
    }
  }

  // §22.4's "n of m done" counts the work MARKED DONE, which in display
  // terms is any of the three states that imply it: awaiting QC (done, not
  // yet inspected), QC passed, and QC failed — a failed cell was still
  // marked done, and dropping it would make the count fall when an
  // inspection fails, which reads as work being un-done.
  const DONE_STATES: MatrixCellState[] = ['awaiting_qc', 'qc_passed', 'qc_failed']
  const doneCount = cells.filter((c) => DONE_STATES.includes(c.state)).length
  const allQcPassed =
    cells.length > 0 && cells.every((c) => c.state === 'qc_passed' || c.state === 'not_applicable')

  return {
    oldest: oldestCell
      ? {
          systemId: oldestCell.systemId,
          systemName: oldestCell.systemName,
          subStage: oldestCell.subStage,
          holderName: oldestCell.holderName,
          ageDays: oldestAge,
          state: oldestCell.state,
        }
      : null,
    alsoOpen: [...ageBySystem.values()].sort((a, b) => b.ageDays - a.ageDays),
    doneCount,
    // "n of m done" counts across every system covering the floor — §22.4's
    // own "3 of 15 done" on a three-system floor.
    totalCount: cells.length,
    allQcPassed,
    nothingStarted: cells.length > 0 && cells.every((c) => c.state === 'not_started'),
  }
}

/**
 * §22.6a — "After the last block, 12.5px secondary: 'Not on L8: Car park
 * management — covers B3, B2 and B1.' — one line, never rows."
 *
 * Saying which systems are NOT on a floor is how "not applicable" becomes
 * legible on this screen: the matrix shows it as an absent cell, and here it
 * is one sentence rather than a block of dashes.
 */
export interface NotOnFloor {
  systemName: string
  coversLabels: string[]
}

export function systemsNotOnFloor(
  allSystems: { id: string; name: string }[],
  systemsOnThisFloor: Set<string>,
  coverageLabelsBySystem: Map<string, string[]>,
): NotOnFloor[] {
  return allSystems
    .filter((s) => !systemsOnThisFloor.has(s.id))
    .map((s) => ({ systemName: s.name, coversLabels: coverageLabelsBySystem.get(s.id) ?? [] }))
    // A system that covers nothing at all is not "not on this floor" in any
    // useful sense — it is unconfigured, and §6.5 says that on the setup
    // screen where it can be fixed. Saying it here too would be noise on
    // every floor of the project.
    .filter((s) => s.coversLabels.length > 0)
}
