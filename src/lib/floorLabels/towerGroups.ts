/**
 * THE ONE RULE for tower-qualified floor labels in constrained space.
 *
 * Source: Claude Design, "Design answer — tower-qualified floor labels in
 * constrained space" (28 Sep 2026), answering the question raised with
 * PR #85. It extends the §22.2 pattern UpdateSummary.tsx:78–82 already
 * uses; it supersedes nothing.
 *
 * WHAT WENT WRONG THAT THIS FIXES. Floor labels were composed for display
 * as `${tower.label} - ${floor.label}`, which put the tower name inside
 * every label. In a 96px column that does not fit, and in a caption a
 * range came out as "Tower - GF–Tower - L2" — a range built from two
 * fully-qualified labels, which reads as four floors rather than two.
 *
 * THE RULE, as Design states it:
 *   1. Floors in view are grouped by tower_id, the tower named ONCE as a
 *      group heading, bare labels beneath. No prefix is ever rendered
 *      inside a floor label. No abbreviations, no short codes.
 *   2. Applies whether one tower or several are in view — a single-tower
 *      view simply gets one heading. ("Strip the prefix when all floors
 *      share one tower" is no longer a special case; it falls out.)
 *   3. The heading is omitted ONLY when every floor in view has
 *      tower_id = null. There is nothing to name, so labels render bare.
 *   4. Mixed null + towered floors: the tower-less group keeps its
 *      existing position (first, per the established sort order) and is
 *      headed "Other floors".
 *   5. The full composed label survives for tooltips, exports and prints
 *      — never as the on-screen label in a grouped list. That is what
 *      `fullLabel` on each floor is for.
 *
 * IMPLEMENTED ONCE, HERE, rather than per component — Design's own
 * instruction, and the reason the caption and the matrix cannot drift
 * apart about what a range means.
 *
 * NO SCHEMA CHANGE. Everything below reads project_towers and
 * project_floors.tower_id exactly as migration 021 left them.
 */

export interface TowerInputLike {
  id: string
  label: string
  sortOrder: number
}

export interface FloorInputLike {
  id: string
  label: string
  sortOrder: number
  towerId: string | null
}

export type GroupedFloor<F> = F & {
  /** "<Tower> - <Floor>", or the bare label for a tower-less floor.
   *  Rule 5 — tooltips, exports, prints and accessible names only. Never
   *  the visible label inside a grouped list. */
  fullLabel: string
}

export interface FloorTowerGroup<F extends FloorInputLike> {
  towerId: string | null
  /** The tower's own name, or "Other floors" for a tower-less group that
   *  shares the view with towered ones. Rule 3 — null ONLY when every
   *  floor in view is tower-less, because then there is nothing to name
   *  and a heading would be noise. */
  heading: string | null
  floors: GroupedFloor<F>[]
}

const bySortOrder = (a: FloorInputLike, b: FloorInputLike) => a.sortOrder - b.sortOrder

/**
 * Groups floors by tower in display order: tower-less floors first, then
 * each tower in sort_order with its own floors in sort_order.
 *
 * THIS IS ALSO THE ORDERING RULE. It is the same "no-tower floors first,
 * then each tower in sort_order" order the matrix, the update page's jump
 * grid and shop-drawing-boq/floor-columns.ts have always used (Brief 047
 * §2, "existing floor display order") — grouping did not change it, it
 * only made it visible. Flattening the result reproduces exactly the old
 * sequence, which is why every caller that wanted only the order is
 * unaffected.
 *
 * A tower with no floors produces no group. An empty heading row above
 * nothing states a fact nobody asked for and costs a grid row.
 *
 * @param otherFloorsHeading Rule 4's one new string, passed in rather
 *   than hardcoded so it stays in the dictionary with every other piece
 *   of UI copy and can be translated.
 */
export function groupFloorsByTower<F extends FloorInputLike>(
  towers: TowerInputLike[],
  floors: F[],
  otherFloorsHeading: string,
): FloorTowerGroup<F>[] {
  const towerless = floors.filter((f) => f.towerId === null).sort(bySortOrder)

  const towered = [...towers]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((tower) => ({ tower, floors: floors.filter((f) => f.towerId === tower.id).sort(bySortOrder) }))
    .filter((g) => g.floors.length > 0)

  const groups: FloorTowerGroup<F>[] = []

  if (towerless.length > 0) {
    groups.push({
      towerId: null,
      // Rule 3 vs rule 4 turns on this one condition, and nothing else.
      heading: towered.length === 0 ? null : otherFloorsHeading,
      floors: towerless.map((f) => ({ ...f, fullLabel: f.label }) as GroupedFloor<F>),
    })
  }

  for (const { tower, floors: towerFloors } of towered) {
    groups.push({
      towerId: tower.id,
      heading: tower.label,
      floors: towerFloors.map((f) => ({ ...f, fullLabel: `${tower.label} - ${f.label}` }) as GroupedFloor<F>),
    })
  }

  return groups
}

/** The groups' floors as one ordered list — for callers that need the
 *  sequence rather than the grouping. */
export function flattenFloorGroups<F extends FloorInputLike>(
  groups: FloorTowerGroup<F>[],
): GroupedFloor<F>[] {
  return groups.flatMap((g) => g.floors)
}

/**
 * Design's caption format: "<Tower>: <first>–<last>", groups joined with
 * " · " in the same order as the matrix.
 *
 *   One tower            Tower: GF–L2
 *   Two towers           Podium: B1–L1 · Tower: GF–L2
 *   Mixed with null      Other floors: B1 · Tower: GF–L2
 *   All tower-less       B1–L2                    (rule 3 — no prefix)
 *   Non-contiguous       Tower: GF–L2, L5
 *   One floor in a group Tower: L5                (no range dash)
 *
 * A RANGE NEVER CROSSES A TOWER BOUNDARY — Design's words, and the reason
 * this cannot be done on a flat label list. Floor order is not continuous
 * between towers: the floor after "Podium L1" is "Tower GF", which is not
 * one step up any building. Ranging across that seam is what produced
 * "Tower - GF–Tower - L2" and it would keep producing nonsense however
 * the labels were written.
 *
 * Contiguity is judged by position WITHIN the group, so a gap means a
 * genuinely skipped floor rather than the start of the next tower.
 *
 * Returns null when nothing is covered — the caller states the count
 * ("0 floors") rather than printing an empty range.
 */
export function formatCoverageRange<F extends FloorInputLike>(
  groups: FloorTowerGroup<F>[],
  coveredFloorIds: Set<string>,
): string | null {
  const parts: string[] = []

  for (const group of groups) {
    const covered = group.floors
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => coveredFloorIds.has(f.id))
    if (covered.length === 0) continue

    // Split into runs of consecutive positions within this group.
    const runs: (typeof covered)[] = []
    for (const entry of covered) {
      const run = runs[runs.length - 1]
      if (run && entry.i === run[run.length - 1].i + 1) run.push(entry)
      else runs.push([entry])
    }

    const ranges = runs
      .map((run) =>
        run.length === 1 ? run[0].f.label : `${run[0].f.label}–${run[run.length - 1].f.label}`,
      )
      .join(', ')

    parts.push(group.heading ? `${group.heading}: ${ranges}` : ranges)
  }

  return parts.length === 0 ? null : parts.join(' · ')
}
