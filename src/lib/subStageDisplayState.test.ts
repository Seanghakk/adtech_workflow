import { describe, it, expect } from 'vitest'
import { computeSubStageDisplayState, resolveLatestInspection } from './subStageDisplayState'

describe('computeSubStageDisplayState — v6 §7.1 table', () => {
  it('not_started -> its own status', () => {
    expect(computeSubStageDisplayState({ status: 'not_started', latestInspection: null })).toBe('not_started')
  })

  it('in_progress -> its own status', () => {
    expect(computeSubStageDisplayState({ status: 'in_progress', latestInspection: null })).toBe('in_progress')
  })

  it('done, no inspection -> awaiting_qc ("Complete, awaiting QC")', () => {
    expect(computeSubStageDisplayState({ status: 'done', latestInspection: null })).toBe('awaiting_qc')
  })

  it('done, latest inspection passed -> qc_passed', () => {
    expect(
      computeSubStageDisplayState({
        status: 'done',
        latestInspection: { result: 'pass', date: '2026-09-01T00:00:00Z' },
      }),
    ).toBe('qc_passed')
  })

  it('done, latest inspection failed -> qc_failed', () => {
    expect(
      computeSubStageDisplayState({
        status: 'done',
        latestInspection: { result: 'fail', date: '2026-09-01T00:00:00Z' },
      }),
    ).toBe('qc_failed')
  })

  it('a status still in_progress ignores any inspection (an inspection cannot exist before done, but the rule is status-first regardless)', () => {
    expect(
      computeSubStageDisplayState({
        status: 'in_progress',
        latestInspection: { result: 'pass', date: '2026-09-01T00:00:00Z' },
      }),
    ).toBe('in_progress')
  })
})

describe('resolveLatestInspection — "latest wins", both directions', () => {
  it('a new pass after a fail clears it (fail then pass -> pass wins)', () => {
    const latest = resolveLatestInspection([
      { result: 'fail', date: '2026-09-01T00:00:00Z' },
      { result: 'pass', date: '2026-09-05T00:00:00Z' },
    ])
    expect(latest).toEqual({ result: 'pass', date: '2026-09-05T00:00:00Z' })
  })

  it('a new fail after an old pass reopens it (pass then fail -> fail wins)', () => {
    const latest = resolveLatestInspection([
      { result: 'pass', date: '2026-09-01T00:00:00Z' },
      { result: 'fail', date: '2026-09-05T00:00:00Z' },
    ])
    expect(latest).toEqual({ result: 'fail', date: '2026-09-05T00:00:00Z' })
  })

  it('order in the input array does not matter — only the date does', () => {
    const latest = resolveLatestInspection([
      { result: 'fail', date: '2026-09-10T00:00:00Z' },
      { result: 'pass', date: '2026-09-01T00:00:00Z' },
    ])
    expect(latest).toEqual({ result: 'fail', date: '2026-09-10T00:00:00Z' })
  })

  it('a sub-stage with no inspections at all resolves to null', () => {
    expect(resolveLatestInspection([])).toBeNull()
  })
})

describe('computeSubStageDisplayState + resolveLatestInspection, composed (as a real caller would use them)', () => {
  it('done, latest of [fail, pass] -> qc_passed', () => {
    const latestInspection = resolveLatestInspection([
      { result: 'fail', date: '2026-09-01T00:00:00Z' },
      { result: 'pass', date: '2026-09-05T00:00:00Z' },
    ])
    expect(computeSubStageDisplayState({ status: 'done', latestInspection })).toBe('qc_passed')
  })

  it('done, latest of [pass, fail] -> qc_failed', () => {
    const latestInspection = resolveLatestInspection([
      { result: 'pass', date: '2026-09-01T00:00:00Z' },
      { result: 'fail', date: '2026-09-05T00:00:00Z' },
    ])
    expect(computeSubStageDisplayState({ status: 'done', latestInspection })).toBe('qc_failed')
  })
})
