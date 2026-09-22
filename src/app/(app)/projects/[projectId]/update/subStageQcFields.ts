import { computeSubStageDisplayState, resolveLatestInspection, type SubStageDisplayState } from '@/lib/subStageDisplayState'

export interface RawInspectionRow {
  status: string
  /** inspected_at, falling back to created_at — the same date convention
   *  every reader of qc_inspections uses (see subStageDisplayState.ts's
   *  own LatestInspection.date comment). */
  date: string
}

export interface SubStageQcFields {
  /** The v6 §7.1 shared rule's answer — imported, never re-derived. */
  qcDisplayState: SubStageDisplayState
  /** The literal most recent row of ANY status (including 'pending'),
   *  a genuinely different question from qcDisplayState above: "what
   *  happened most recently" versus "is this currently QC-passed". A
   *  'pending' row is real, written information (migration 008 /
   *  qc-actions.ts) but is not a pass/fail verdict, so it never affects
   *  qcDisplayState — same as before this brief. */
  lastInspectionStatus: string | null
}

/**
 * Brief 081 — the desktop update screen's own adapter from a sub-stage's
 * raw qc_inspections rows (any status) to the two fields FloorBreakdown.tsx
 * renders. Mirrors the floor matrix's own caller (page.tsx, Brief 078)
 * for the pass/fail half — same shared functions, same "latest wins by
 * date" contract — and adds the "any status" reading only this screen
 * needs. Replaces the old passedSubStageIds Set, which only ever recorded
 * whether a pass had EVER happened (a fail after an old pass stayed shown
 * as passed forever — the exact bug this brief fixes).
 */
export function computeSubStageQcFields(
  status: 'not_started' | 'in_progress' | 'done',
  inspections: RawInspectionRow[],
): SubStageQcFields {
  const latestPassFail = resolveLatestInspection(
    inspections
      .filter((r): r is { status: 'pass' | 'fail'; date: string } => r.status === 'pass' || r.status === 'fail')
      .map((r) => ({ result: r.status, date: r.date })),
  )
  const qcDisplayState = computeSubStageDisplayState({ status, latestInspection: latestPassFail })

  const lastInspectionStatus =
    inspections.length === 0
      ? null
      : inspections.reduce((latest, current) =>
          new Date(current.date).getTime() >= new Date(latest.date).getTime() ? current : latest,
        ).status

  return { qcDisplayState, lastInspectionStatus }
}
