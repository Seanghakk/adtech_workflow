/**
 * Screen 4a — "one board, three scopes" (Fable Brief 009 / Amendment A).
 * Pure grouping/aggregation, deliberately separate from the page's data
 * fetching — same split as reporting/exceptions.ts and reporting/load.ts.
 *
 * Brief 009 §1's deliberate deviation, restated because it is the single
 * most important fact about this module: this board is built over
 * `workflow.projects`, NOT `workflow.requests`. The Rev 2 handoff's own
 * 4a is a board over requests, grouped by which team currently holds one
 * — that screen does not exist here. Screens 1a/1c (the only write path
 * into workflow.requests) are unbuilt, so a faithful request board would
 * be permanently empty. This is projects' own scope/lane/age structure
 * instead, not a hybrid of the two and not a stub of the request board.
 */
import { getCardWeight, type AgeBand } from '@/lib/age'

export interface BoardProject {
  id: string
  name: string
  stream: string
  soNumber: string | null
  percentComplete: number
  picId: string | null
  /** Days since last_meaningful_movement_at (or opened_at if never moved)
   *  — computed by the caller via daysSinceICT, same as every other
   *  screen that shows an age ladder. Never re-derived here. */
  stallDays: number
  /** Brief 056 §7 — gates the board card's "Matrix" link: a project with
   *  zero floor rows has nothing for the matrix to show. */
  hasFloors: boolean
}

export type Scope = 'mine' | 'my-team' | 'everything'
export type GroupBy = 'stream' | 'pic' | 'age-band'

export interface ScopeMember {
  userId: string
  teamId: string
  role: 'member' | 'manager' | 'admin'
}

/** Brief 009 §3.2 — "put the mapping in ONE place so changing it later is
 *  a one-line edit." This is that place: a manager or admin lands on
 *  Everything; everyone else lands on Mine. (Admin included alongside
 *  manager, not named explicitly in the brief's own wording — every other
 *  role check in this codebase, e.g. canAssignClientOwners, treats admin
 *  as at least as privileged as manager, and defaulting the most
 *  privileged role to the narrowest scope would be an odd landing; stated
 *  here as the one small extension made to the brief's literal text.) */
export function defaultScopeForRole(role: ScopeMember['role']): Scope {
  return role === 'manager' || role === 'admin' ? 'everything' : 'mine'
}

/** Brief 009 §3.1. A project with no PIC belongs to neither "Mine" nor
 *  "My team" — there is no PIC for either comparison to match — so an
 *  unassigned project surfaces only under Everything, which is also
 *  where Brief 009 §5's requirement that it stay visible (never hidden)
 *  is actually satisfied: every scope OTHER than Everything is itself a
 *  claim of ownership that an unassigned project cannot make. */
export function filterByScope(
  projects: BoardProject[],
  scope: Scope,
  member: ScopeMember,
  teamIdByUserId: Map<string, string>,
): BoardProject[] {
  if (scope === 'mine') {
    return projects.filter((p) => p.picId === member.userId)
  }
  if (scope === 'my-team') {
    return projects.filter((p) => p.picId != null && teamIdByUserId.get(p.picId) === member.teamId)
  }
  return projects
}

function byStallDaysDescending(a: BoardProject, b: BoardProject): number {
  // Brief 009 §3.4 — age descending everywhere, always the default,
  // never date-created order. The only sort this module has.
  return b.stallDays - a.stallDays
}

export interface BoardLane {
  /** Stream code, PIC id ('unassigned' for no-PIC), or AgeBand value —
   *  never a display label, so a future label rename can't change lane
   *  membership (Brief 009 Amendment A §4 — the exact trap that broke
   *  6b's "stalled" grouping once already, caught by tsc, not reading). */
  id: string
  projects: BoardProject[]
}

/** Brief 009 §3.3 / §3.5 — "no lane name, stream name, status word or
 *  grouping option is hardcoded... an empty lookup table must render
 *  gracefully as empty rather than falling back to a hardcoded default."
 *  Stream and PIC lanes are built from whichever values are actually
 *  present in the current scope — a stream/person with zero projects in
 *  this scope simply has no lane, rather than a hardcoded list of every
 *  possible stream rendering an empty box. Age-band lanes are the one
 *  exception, and deliberately so: those four bands are this app's own
 *  fixed internal classification (not a lookup table), and 6b's board
 *  already established the precedent of always showing all of its fixed
 *  groups, empty ones included — kept consistent here. */
export function buildLanes(
  projects: BoardProject[],
  groupBy: GroupBy,
  picSortKey: (picId: string) => string,
): BoardLane[] {
  if (groupBy === 'stream') {
    const byStream = new Map<string, BoardProject[]>()
    for (const p of projects) {
      const list = byStream.get(p.stream) ?? []
      list.push(p)
      byStream.set(p.stream, list)
    }
    return [...byStream.keys()]
      .sort()
      .map((stream) => ({ id: stream, projects: byStream.get(stream)!.sort(byStallDaysDescending) }))
  }

  if (groupBy === 'pic') {
    const unassigned: BoardProject[] = []
    const byPic = new Map<string, BoardProject[]>()
    for (const p of projects) {
      if (!p.picId) {
        unassigned.push(p)
        continue
      }
      const list = byPic.get(p.picId) ?? []
      list.push(p)
      byPic.set(p.picId, list)
    }
    const picLanes = [...byPic.entries()]
      .map(([picId, list]) => ({ id: picId, projects: list.sort(byStallDaysDescending) }))
      .sort((a, b) => picSortKey(a.id).localeCompare(picSortKey(b.id)))
    // "No PIC assigned" first, same precedent as 6b's own board: it is
    // the one lane that blocks every other fix (Brief 009 §5 / migration
    // 006 — nobody can update a project with no PIC at all).
    return unassigned.length > 0
      ? [{ id: 'unassigned', projects: unassigned.sort(byStallDaysDescending) }, ...picLanes]
      : picLanes
  }

  // age-band — fixed four lanes, always rendered, grouped by band
  // IDENTITY (getCardWeight()'s return value), never a label or colour
  // name. Most-severe-first, matching 6b's own established lane order.
  const BAND_ORDER: readonly AgeBand[] = ['stalled', 'late', 'waiting', 'moving']
  const byBand = new Map<AgeBand, BoardProject[]>()
  for (const p of projects) {
    const band = getCardWeight(p.stallDays)
    const list = byBand.get(band) ?? []
    list.push(p)
    byBand.set(band, list)
  }
  return BAND_ORDER.map((band) => ({
    id: band,
    projects: (byBand.get(band) ?? []).sort(byStallDaysDescending),
  }))
}

/** Brief 009 §3.3 — "lane headers carry the count AND the oldest item in
 *  the lane... do not drop it." null for a lane with no projects (the
 *  age-band lanes can be empty; stream/pic lanes never are, by
 *  construction above, but this stays total either way). */
export function oldestStallDays(lane: BoardLane): number | null {
  if (lane.projects.length === 0) return null
  return Math.max(...lane.projects.map((p) => p.stallDays))
}
