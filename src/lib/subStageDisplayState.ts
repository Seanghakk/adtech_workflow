/**
 * Brief 078 / v6 §7.1 — the ONE shared rule for a sub-stage's display
 * state. Called by the floor x sub-stage matrix (floor-matrix.ts) and, in
 * a later brief, the phone floor page — so the two screens cannot derive
 * this independently and disagree. That was exactly the bug v6 §7 closes:
 * the matrix used to show a QC-failed sub-stage as "Complete, awaiting QC"
 * because it only ever checked "has this sub-stage EVER had a passed
 * inspection," never which inspection was latest.
 *
 * Stored statuses stay exactly three (not_started / in_progress / done).
 * The three QC states below are COMPUTED ONLY and are never written back
 * to the status column.
 */

export type SubStageDisplayState = 'not_started' | 'in_progress' | 'awaiting_qc' | 'qc_passed' | 'qc_failed'

export interface LatestInspection {
  result: 'pass' | 'fail'
  /** workflow.qc_inspections.inspected_at, falling back to created_at when
   *  an inspection has no explicit inspected_at (that column is nullable —
   *  migration 008). This is the date v6 §7.3 requires the matrix's
   *  staleness clock to read for a QC-failed cell, instead of the
   *  sub-stage's own status date. */
  date: string
}

/**
 *   status not done                  -> its own status
 *   done, no inspection              -> awaiting_qc ("Complete, awaiting QC")
 *   done, latest inspection passed   -> qc_passed
 *   done, latest inspection failed   -> qc_failed
 *
 * "Latest" wins: pass the caller-resolved LATEST inspection (by date, not
 * "any pass ever") — see resolveLatestInspection below. A new pass after a
 * fail clears the fail, and a new fail after an old pass reopens it; this
 * function only applies the rule, resolving "latest" is the caller's job.
 */
export function computeSubStageDisplayState(args: {
  status: 'not_started' | 'in_progress' | 'done'
  latestInspection: LatestInspection | null
}): SubStageDisplayState {
  const { status, latestInspection } = args
  if (status !== 'done') return status
  if (!latestInspection) return 'awaiting_qc'
  return latestInspection.result === 'pass' ? 'qc_passed' : 'qc_failed'
}

/**
 * Resolves the LATEST of a sub-stage's own inspection rows by date — the
 * building block that turns a raw workflow.qc_inspections read (pass/fail
 * rows only; 'pending' rows carry no result and are not inspections for
 * this rule's purposes) into the single value computeSubStageDisplayState
 * needs. On an exact date tie, the row occurring LAST in the input array
 * wins — callers should pass rows in a meaningful stable order if a true
 * tie is possible; inspected_at/created_at timestamp precision makes a
 * genuine tie unlikely in practice.
 */
export function resolveLatestInspection(inspections: Array<{ result: 'pass' | 'fail'; date: string }>): LatestInspection | null {
  if (inspections.length === 0) return null
  return inspections.reduce((latest, current) => (new Date(current.date).getTime() >= new Date(latest.date).getTime() ? current : latest))
}
