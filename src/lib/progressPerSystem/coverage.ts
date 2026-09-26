/**
 * Brief 106b — floor coverage per system (v7.4 §6.5).
 *
 * Pure. The "Floors covered" cell has three shapes and a person reads it at
 * a glance to answer "is this system where I think it is", so which shape
 * applies is derived here and tested, rather than assembled in JSX.
 *
 * §6.5, verbatim: Floors covered reads "All 30 floors", or "27 of 30 · GF to
 * L26" (a contiguous run as a range), or "3 of 30 · B3, B2, B1" (five floors
 * or fewer listed by name).
 */

/** A project floor, already in §6.2 building order. */
export interface CoverageFloor {
  id: string
  label: string
}

export type CoverageShape =
  | { kind: 'all'; total: number }
  | { kind: 'range'; covered: number; total: number; from: string; to: string }
  | { kind: 'named'; covered: number; total: number; labels: string[] }
  | { kind: 'count'; covered: number; total: number }
  | { kind: 'none' }

/**
 * §6.5's three forms, in the order the design states them, plus the case it
 * does not name.
 *
 * THE UNNAMED CASE. A system covering, say, 12 scattered floors of 30 is
 * none of the three: not all, not a contiguous run, and too many to list.
 * §6.5 gives no wording for it, so this returns a plain count rather than
 * inventing a fourth sentence — and the Result flags it. Truncating a list
 * with "…" would be the Brief 062 clipping failure returning, and naming
 * twelve floors in a table cell is unreadable.
 */
export function coverageShape(allFloors: CoverageFloor[], coveredIds: string[]): CoverageShape {
  const total = allFloors.length
  const covered = allFloors.filter((f) => coveredIds.includes(f.id))

  if (covered.length === 0) return { kind: 'none' }
  if (total > 0 && covered.length === total) return { kind: 'all', total }

  // Contiguity is judged in BUILDING ORDER, which is the order the caller
  // passes them in — not alphabetically, and not by id. "GF to L26" only
  // means anything if the floors between them are all covered.
  const firstIndex = allFloors.findIndex((f) => f.id === covered[0].id)
  const isContiguous = covered.every(
    (f, i) => allFloors[firstIndex + i] !== undefined && allFloors[firstIndex + i].id === f.id,
  )

  // NAMING WINS AT FIVE OR FEWER, EVEN WHEN CONTIGUOUS. §6.5's own example
  // is "3 of 30 · B3, B2, B1" — three adjacent floors, shown by name rather
  // than as "B3 to B1". Naming them is both shorter and more precise at this
  // size, so the range form is for runs too long to list, not for runs.
  if (covered.length <= 5) {
    return { kind: 'named', covered: covered.length, total, labels: covered.map((f) => f.label) }
  }

  if (isContiguous) {
    return {
      kind: 'range',
      covered: covered.length,
      total,
      from: covered[0].label,
      to: covered[covered.length - 1].label,
    }
  }

  return { kind: 'count', covered: covered.length, total }
}

/**
 * §6.5's amber warning before coverage is removed: "B1 has recorded work for
 * Car park management — 2 sub-stages."
 *
 * Counts only cells that have MOVED. A floor whose five cells are all still
 * "not started" has no recorded work, and warning about it would train people
 * to dismiss the warning that matters.
 */
export interface RemovalWarning {
  floorLabel: string
  systemName: string
  recordedSubStages: number
}

export function removalWarnings(
  removedFloorIds: string[],
  floors: CoverageFloor[],
  systemName: string,
  recordedByFloor: Map<string, number>,
): RemovalWarning[] {
  return removedFloorIds
    .map((id) => ({
      floorLabel: floors.find((f) => f.id === id)?.label ?? '',
      systemName,
      recordedSubStages: recordedByFloor.get(id) ?? 0,
    }))
    .filter((w) => w.recordedSubStages > 0)
}

/**
 * §6.5 — the result line after a floor is added:
 *
 *   "L27 added. It is now on CCTV and PA/VA, which cover every floor. Not
 *    added to Access control or Car park management — Edit floors on either
 *    to include it."
 *
 * Returned as parts so the screen can localise the joining words. The rule
 * itself is migration 045's trigger; this only reports what it did, which is
 * why both lists come from the caller reading the database back rather than
 * from predicting the trigger.
 */
export interface FloorAddedOutcome {
  floorLabel: string
  joined: string[]
  notJoined: string[]
}

export function describeFloorAdded(
  floorLabel: string,
  joinedSystemNames: string[],
  notJoinedSystemNames: string[],
): FloorAddedOutcome {
  return { floorLabel, joined: joinedSystemNames, notJoined: notJoinedSystemNames }
}

/**
 * §6.5's setup strip: "Partly · 1 system covers no floors".
 * Zero systems is NOT the same as systems that cover nothing — the first is
 * an empty project, the second is a project that will silently record no
 * progress, which is the one worth saying out loud.
 */
export function systemsWithNoCoverage(
  systems: { id: string; name: string }[],
  coveredSystemIds: Set<string>,
): { id: string; name: string }[] {
  return systems.filter((s) => !coveredSystemIds.has(s.id))
}
