/**
 * Brief 080 / Handoff Addendum v6.1 §2, REVISED BY BRIEF 082 §2 —
 * Installation and Testing & commissioning both summarise "floor counts
 * at <stage>" plus an age key of "the oldest floor that has not changed
 * stage."
 *
 * For a given ordered list of sub-stage keys (installation: first_fix,
 * second_fix, third_fix; T&C: pre_commissioning, commissioning), each
 * floor is bucketed by the FIRST (lowest-ordered) sub-stage on it that
 * is NOT yet 'done' — i.e. where the floor is currently stuck.
 *
 * BRIEF 082 CORRECTION: Brief 080's original version let a floor whose
 * relevant sub-stages were ALL 'done' fall into NO bucket at all — live
 * evidence (22 Sep 2026) showed this produced a count that didn't add up
 * to the project's real floor total (5 counted out of 6; the 6th, fully
 * finished, was silently dropped). Seanghakk decided: finished floors
 * ARE counted, via a new 'complete' bucket, so bucket counts for a
 * project always sum to its total floor count (see
 * floorStageBuckets.test.ts's own sums-to-total assertion — the actual
 * regression test for that bug).
 *
 * 'complete' follows the sub-stage STATUS ONLY (every relevant sub-stage
 * is 'done' — the work itself is finished). It does NOT depend on QC
 * results in any way — a 'complete' floor's sub-stages may be awaiting
 * QC, QC-passed, or QC-failed; QC inspection state has its own separate
 * cross-project list (QC inspections) and is never folded into this
 * status-only bucket.
 *
 * A floor with zero sub-stage rows on this track at all (shouldn't
 * happen — migration 008 seeds all 5 onto every floor — but handled
 * defensively) still falls into no bucket, since there is genuinely no
 * status to report for it either way.
 *
 * "Not started" is its own bucket, not folded into "first fix": a floor
 * where NONE of the track's sub-stages have moved off not_started reads
 * differently from one where the FIRST sub-stage is merely in_progress.
 *
 * Age key ("oldest floor that has not changed stage"): the oldest
 * updated_at among every floor's own bucketed (stuck) sub-stage row —
 * the sub-stage row IS "the stage the floor hasn't changed from."
 * UNCHANGED by Brief 082: a 'complete' floor has nothing stuck, so
 * callers must exclude 'complete' bucket entries from the oldest-stuck
 * calculation (see installation/page.tsx and testing-commissioning/
 * page.tsx, which both skip bucket === 'complete' when computing age).
 */
import type { FloorSubStageRow } from './floorTrackData'

export interface FloorStageBucket {
  floorId: string
  bucket: 'not_started' | 'complete' | (string & {})
  /** The stuck sub-stage's own updated_at (for a stuck bucket), or the
   *  LAST-finishing sub-stage's own updated_at (for 'complete' — the
   *  moment the floor actually finished this track). Callers computing
   *  the "oldest stuck" age key must skip 'complete' entries entirely
   *  (a complete floor has nothing stuck to contribute) rather than
   *  relying on this value being excluded automatically. */
  stuckSince: string
}

export function bucketFloorsByStage(
  subStages: FloorSubStageRow[],
  floorIds: string[],
  orderedSubStages: string[],
): FloorStageBucket[] {
  const buckets: FloorStageBucket[] = []
  for (const floorId of floorIds) {
    const rowsForFloor = subStages.filter((s) => s.floorId === floorId && orderedSubStages.includes(s.subStage))
    if (rowsForFloor.length === 0) continue

    const allNotStarted = rowsForFloor.every((r) => r.status === 'not_started')
    if (allNotStarted) {
      const oldest = rowsForFloor.reduce((a, b) => (a.updatedAt < b.updatedAt ? a : b))
      buckets.push({ floorId, bucket: 'not_started', stuckSince: oldest.updatedAt })
      continue
    }

    const stuckSubStage = orderedSubStages.find((key) => {
      const row = rowsForFloor.find((r) => r.subStage === key)
      return row && row.status !== 'done'
    })
    if (!stuckSubStage) {
      // Brief 082 §2 — every relevant sub-stage is done: the floor has
      // finished this track entirely. Bucketed as 'complete' (status
      // only, no QC involved) rather than dropped, so counts sum to the
      // project's real floor total. stuckSince here is the LATEST of the
      // finishing sub-stages' own updated_at (when the floor actually
      // became complete) — not used for the age key (callers must skip
      // 'complete' when computing oldest-stuck), but a real, meaningful
      // timestamp rather than an arbitrary one.
      const latest = rowsForFloor.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
      buckets.push({ floorId, bucket: 'complete', stuckSince: latest.updatedAt })
      continue
    }

    const row = rowsForFloor.find((r) => r.subStage === stuckSubStage)!
    buckets.push({ floorId, bucket: stuckSubStage, stuckSince: row.updatedAt })
  }
  return buckets
}
