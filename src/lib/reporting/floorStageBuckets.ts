/**
 * Brief 080 / Handoff Addendum v6.1 §2 — Installation and Testing &
 * commissioning both summarise "floor counts at <stage>" plus an age key
 * of "the oldest floor that has not changed stage." Neither is spelled
 * out further in the addendum, so the bucket rule is a JUDGMENT CALL,
 * flagged here rather than silently picked:
 *
 * For a given ordered list of sub-stage keys (installation: first_fix,
 * second_fix, third_fix; T&C: pre_commissioning, commissioning), each
 * floor is bucketed by the FIRST (lowest-ordered) sub-stage on it that
 * is NOT yet 'done' — i.e. where the floor is currently stuck. A floor
 * whose relevant sub-stages are ALL 'done' has finished this track
 * entirely and falls into no bucket (not shown in these counts) — the
 * addendum names only "not started / first / second / third fix" as
 * buckets, with no "complete" bucket, so a fully-done floor is read as
 * out of scope for this summary rather than force-fit into "third fix."
 * A floor with zero sub-stage rows on this track at all (shouldn't
 * happen — migration 008 seeds all 5 onto every floor — but handled
 * defensively) also falls into no bucket.
 *
 * "Not started" is its own bucket, not folded into "first fix": a floor
 * where NONE of the track's sub-stages have moved off not_started reads
 * differently from one where the FIRST sub-stage is merely in_progress.
 *
 * Age key ("oldest floor that has not changed stage"): the oldest
 * updated_at among every floor's own bucketed (stuck) sub-stage row —
 * the sub-stage row IS "the stage the floor hasn't changed from."
 */
import type { FloorSubStageRow } from './floorTrackData'

export interface FloorStageBucket {
  floorId: string
  bucket: 'not_started' | (string & {})
  /** The stuck sub-stage's own updated_at — the age-key source. */
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
    if (!stuckSubStage) continue // every relevant sub-stage is done — finished this track entirely

    const row = rowsForFloor.find((r) => r.subStage === stuckSubStage)!
    buckets.push({ floorId, bucket: stuckSubStage, stuckSince: row.updatedAt })
  }
  return buckets
}
