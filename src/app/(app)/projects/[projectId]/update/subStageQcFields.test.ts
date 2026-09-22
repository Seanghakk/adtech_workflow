import { describe, it, expect } from 'vitest'
import { computeSubStageQcFields } from './subStageQcFields'

describe('computeSubStageQcFields — Brief 081 (desktop update screen adapter)', () => {
  it('done, pass-then-fail -> qc_failed (the exact case the old "ever passed" bug got wrong)', () => {
    const { qcDisplayState, lastInspectionStatus } = computeSubStageQcFields('done', [
      { status: 'pass', date: '2026-09-01T00:00:00Z' },
      { status: 'fail', date: '2026-09-05T00:00:00Z' },
    ])
    expect(qcDisplayState).toBe('qc_failed')
    expect(lastInspectionStatus).toBe('fail')
  })

  it('done, fail-then-pass -> qc_passed', () => {
    const { qcDisplayState, lastInspectionStatus } = computeSubStageQcFields('done', [
      { status: 'fail', date: '2026-09-01T00:00:00Z' },
      { status: 'pass', date: '2026-09-05T00:00:00Z' },
    ])
    expect(qcDisplayState).toBe('qc_passed')
    expect(lastInspectionStatus).toBe('pass')
  })

  it('done, no inspections at all -> qcDisplayState awaiting_qc, lastInspectionStatus null', () => {
    const { qcDisplayState, lastInspectionStatus } = computeSubStageQcFields('done', [])
    expect(qcDisplayState).toBe('awaiting_qc')
    expect(lastInspectionStatus).toBeNull()
  })

  it("done, only a 'pending' row -> qcDisplayState still awaiting_qc (pending is not a pass/fail verdict), but lastInspectionStatus reports it", () => {
    const { qcDisplayState, lastInspectionStatus } = computeSubStageQcFields('done', [
      { status: 'pending', date: '2026-09-01T00:00:00Z' },
    ])
    expect(qcDisplayState).toBe('awaiting_qc')
    expect(lastInspectionStatus).toBe('pending')
  })

  it("done, pass then a later 'pending' re-inspection -> lastInspectionStatus reads 'pending' (the literal latest row), but qcDisplayState stays qc_passed (pending carries no verdict, per the shared rule's own contract)", () => {
    const { qcDisplayState, lastInspectionStatus } = computeSubStageQcFields('done', [
      { status: 'pass', date: '2026-09-01T00:00:00Z' },
      { status: 'pending', date: '2026-09-05T00:00:00Z' },
    ])
    expect(qcDisplayState).toBe('qc_passed')
    expect(lastInspectionStatus).toBe('pending')
  })

  it('not_started or in_progress -> qcDisplayState is the raw status regardless of any inspection rows present', () => {
    expect(
      computeSubStageQcFields('in_progress', [{ status: 'pass', date: '2026-09-01T00:00:00Z' }]).qcDisplayState,
    ).toBe('in_progress')
    expect(computeSubStageQcFields('not_started', []).qcDisplayState).toBe('not_started')
  })
})
