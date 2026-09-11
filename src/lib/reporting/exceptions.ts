/**
 * Screen 6b — "where the work is stuck" (Fable Brief 002 §2 / README
 * Theme 6). Pure grouping/aggregation functions, deliberately separate
 * from the page's data-fetching (same split as the rest of this app: a
 * Server Component fetches, plain functions compute) so the exception
 * rules live in one place a future 4a/1d build can reuse rather than
 * re-deriving.
 *
 * Grouped and joined by hand in TypeScript rather than in SQL — same
 * reasoning as getUserProfilesByIds: this environment cannot verify
 * anything against the live PostgREST/Postgres instance (no psql/
 * DATABASE_URL), so two plain selects joined here behave identically to,
 * and are easier to get right without a live database than, a
 * hand-written aggregate query that can't be tried against prod first.
 */
import { getAgeLabelBand } from '@/lib/age'

export interface ExceptionProject {
  id: string
  name: string
  stream: string
  soNumber: string | null
  percentComplete: number
  picId: string | null
  /** Days since last_meaningful_movement_at (or opened_at if never moved)
   *  — computed by the caller via daysSinceICT, the one shared ICT-aware
   *  helper (src/lib/format/datetime.ts), never re-derived here. */
  stallDays: number
  hasReasonOnFile: boolean
}

export interface ExceptionGroups {
  /** Fable Brief 002 §2.1 — REQUIRED, NOT OPTIONAL: "no PIC assigned" is
   *  itself an exception worth surfacing, since with no manager bypass
   *  (migration 006) such a project is un-updatable by anyone. Not one of
   *  the README's original four groups (drawn before pic_id existed) —
   *  added here as a judgment call, stated plainly in Result 003, and
   *  placed first: it is the one exception that blocks every other fix
   *  (nobody can even post the missing reason until a PIC exists). */
  noPicAssigned: ExceptionProject[]
  /** README: "the largest group today: 229 of 284, 81%." In this app,
   *  reason_code is NOT NULL at the database level (migration 001), so
   *  "no reason given" cannot mean an update with a blank reason — it
   *  means a project with NO progress_updates row at all yet, i.e.
   *  nothing has ever been reported on it. */
  noReasonGiven: ExceptionProject[]
  /** "No meaningful movement, sorted by stall duration." Membership
   *  reuses getAgeLabelBand's own "red" boundary (days >= 11) — the
   *  README's band table already calls that boundary "gone quiet"; this
   *  is that same definition, not a new threshold invented for 6b. */
  stalled: ExceptionProject[]
  /** "Nearly done and not moving — where jobs quietly die." */
  ninetyNineBand: ExceptionProject[]
}

function byStallDaysDescending(a: ExceptionProject, b: ExceptionProject): number {
  return b.stallDays - a.stallDays
}

export function buildExceptionGroups(projects: ExceptionProject[]): ExceptionGroups {
  return {
    noPicAssigned: projects.filter((p) => !p.picId).sort(byStallDaysDescending),
    noReasonGiven: projects.filter((p) => !p.hasReasonOnFile).sort(byStallDaysDescending),
    stalled: projects
      .filter((p) => getAgeLabelBand(p.stallDays) === 'red')
      .sort(byStallDaysDescending),
    ninetyNineBand: projects
      .filter((p) => p.percentComplete >= 90 && p.percentComplete <= 99)
      .sort(byStallDaysDescending),
  }
}

/** README, "PIC concurrency": "the constraint is physical presence, not
 *  list length... measure distinct projects per day, never total item
 *  count." Detection only (Brief §4.5) — no constraint enforces this. */
export const DAILY_PROJECT_LIMIT = 3

export interface OpenItemForBreachCheck {
  projectId: string
  picId: string | null
  /** ISO date string (workflow.project_items.scheduled_date), or null —
   *  a null-scheduled item cannot be checked for same-day concurrency and
   *  is excluded, not counted as a breach or a non-breach. */
  scheduledDate: string | null
}

export interface PicBreach {
  picId: string
  scheduledDate: string
  distinctProjectCount: number
  openItemCount: number
}

export function buildPicBreaches(items: OpenItemForBreachCheck[]): PicBreach[] {
  const groups = new Map<
    string,
    { picId: string; scheduledDate: string; projectIds: Set<string>; itemCount: number }
  >()

  for (const item of items) {
    if (!item.picId || !item.scheduledDate) continue
    const key = `${item.picId}|${item.scheduledDate}`
    const existing = groups.get(key)
    if (existing) {
      existing.projectIds.add(item.projectId)
      existing.itemCount += 1
    } else {
      groups.set(key, {
        picId: item.picId,
        scheduledDate: item.scheduledDate,
        projectIds: new Set([item.projectId]),
        itemCount: 1,
      })
    }
  }

  return [...groups.values()]
    .filter((g) => g.projectIds.size > DAILY_PROJECT_LIMIT)
    .map((g) => ({
      picId: g.picId,
      scheduledDate: g.scheduledDate,
      distinctProjectCount: g.projectIds.size,
      openItemCount: g.itemCount,
    }))
    .sort((a, b) => b.distinctProjectCount - a.distinctProjectCount)
}
