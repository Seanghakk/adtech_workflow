/**
 * Brief 080 / Handoff Addendum v6.1 — the six cross-project Execution
 * lists (Shop drawing, Procurement, Installation, Testing & commissioning,
 * QC inspections, Floor progress). Pure sort/grouping logic, deliberately
 * separate from each route's own data fetching — same split as
 * reporting/board.ts and reporting/exceptions.ts.
 *
 * ONE SORT RULE (addendum §3.1) for all six: by the track's own age key,
 * descending, ties broken on project name for stable ordering across
 * refreshes. Never by date created. Implemented once here so no list can
 * quietly drift from the others.
 */
import type { Scope } from './board'

export type { Scope }

/** Minimal shape the scope filter needs — deliberately NOT the full
 *  BoardProject (percentComplete/stallDays/hasFloors etc. are irrelevant
 *  here and forcing every track's own row type to carry them would be
 *  the wrong kind of coupling). The FILTER RULE itself mirrors board.ts's
 *  own filterByScope exactly (3 lines, Brief 009 §3.1/§3.2) rather than
 *  importing it, to avoid bending six different row shapes into
 *  BoardProject's — but the RULE is not re-derived independently; it is
 *  copied verbatim from that function so the two cannot silently drift.
 *  If board.ts's own rule ever changes, this one needs updating too. */
export interface ScopableProject {
  id: string
  picId: string | null
}

/** A row common to every one of the six lists — the fields the shared
 *  sort needs. Each track's own page computes its own richer row type
 *  that extends this with track-specific summary fields, then sorts via
 *  sortByAgeDescending below. */
export interface AgeSortable {
  projectId: string
  projectName: string
  /** Days since the track's own age key event (§2, per track) — NOT
   *  necessarily the same clock as the board's own stallDays. */
  ageDays: number
}

/** Descending by ageDays, ties broken on projectName (locale-stable,
 *  case-sensitive-insensitive via localeCompare) — addendum §3.1's own
 *  words: "so order is stable across refreshes." */
export function sortByAgeDescending<T extends AgeSortable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays
    return a.projectName.localeCompare(b.projectName)
  })
}

/**
 * QC inspections is the one track with a two-group layout (addendum §4):
 * "Waiting for inspection" (anything waiting or failed, age-sorted) and
 * "Nothing waiting" (everything else, still listed, still clickable). The
 * split is a heading, not a filter.
 */
export interface QcListRow extends AgeSortable {
  waitingCount: number
  failedCount: number
}

export function splitQcInspectionRows<T extends QcListRow>(rows: T[]): { waiting: T[]; quiet: T[] } {
  const waiting = rows.filter((r) => r.waitingCount > 0 || r.failedCount > 0)
  const quiet = rows.filter((r) => r.waitingCount === 0 && r.failedCount === 0)
  return { waiting: sortByAgeDescending(waiting), quiet: sortByAgeDescending(quiet) }
}

/** Same rule as board.ts's filterByScope, copied not imported — see
 *  ScopableProject's own header for why. */
export function filterProjectsByScope<T extends ScopableProject>(
  projects: T[],
  scope: Scope,
  member: { userId: string; teamId: string },
  teamIdByUserId: Map<string, string>,
): T[] {
  if (scope === 'mine') {
    return projects.filter((p) => p.picId === member.userId)
  }
  if (scope === 'my-team') {
    return projects.filter((p) => p.picId != null && teamIdByUserId.get(p.picId) === member.teamId)
  }
  return projects
}
