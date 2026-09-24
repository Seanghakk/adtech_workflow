import { describe, it, expect } from 'vitest'
import { deriveLifecycle, originLine, type LifecycleInput, type SubmissionRecord } from './lifecycle'

const NOW = new Date('2026-09-24T00:00:00Z')

const base: LifecycleInput = {
  status: 'in_progress',
  preSubmissionStage: 'drafting',
  draftingStartedAt: '2026-09-01T00:00:00Z',
  legacyDoneNoHistory: false,
  submissions: [],
  checks: [],
  now: NOW,
}

const sub = (over: Partial<SubmissionRecord> & { revision: number; submittedAt: string }): SubmissionRecord => ({
  id: `s${over.revision}`,
  reviewerParty: 'consultant',
  reviewerOrg: 'Meinhardt',
  returnedAt: null,
  code: null,
  comments: null,
  ...over,
})

describe('stage and possession (v7.2 §9.2, §9.3)', () => {
  it('a drawing only just created is not started, with no chip', () => {
    const l = deriveLifecycle({ ...base, status: 'not_started', preSubmissionStage: null, draftingStartedAt: null })
    expect(l.stage).toBe('not_started')
    expect(l.possession).toBe('none')
    expect(l.currentRevision).toBe(0)
  })

  it('drafting and internal check are both held by ADTECH', () => {
    expect(deriveLifecycle(base).stage).toBe('drafting')
    expect(deriveLifecycle(base).possession).toBe('adtech')
    const ic = deriveLifecycle({ ...base, preSubmissionStage: 'internal_check' })
    expect(ic.stage).toBe('internal_check')
    expect(ic.possession).toBe('adtech')
  })

  it('a checked revision is ready to submit, and still with ADTECH', () => {
    const l = deriveLifecycle({
      ...base,
      preSubmissionStage: 'internal_check',
      checks: [{ revision: 0, checkedBy: 'u1', checkedAt: '2026-09-05T00:00:00Z' }],
    })
    expect(l.stage).toBe('checked')
    expect(l.currentRevisionChecked).toBe(true)
    expect(l.possession).toBe('adtech')
  })

  it('an open submission is with the reviewer', () => {
    const l = deriveLifecycle({ ...base, submissions: [sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z' })] })
    expect(l.stage).toBe('submitted')
    expect(l.possession).toBe('reviewer')
    expect(l.openSubmission?.id).toBe('s0')
    expect(l.currentRevision).toBe(0)
  })

  it('an A or B return is approved', () => {
    for (const code of ['A', 'B'] as const) {
      const l = deriveLifecycle({
        ...base,
        status: 'done',
        submissions: [sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code })],
      })
      expect(l.stage).toBe('approved')
      expect(l.possession).toBe('approved')
    }
  })

  it('shows the APPROVED revision, not a next one that will never exist', () => {
    const l = deriveLifecycle({
      ...base,
      status: 'done',
      submissions: [
        sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code: 'C' }),
        sub({ revision: 1, submittedAt: '2026-09-18T00:00:00Z', returnedAt: '2026-09-22T00:00:00Z', code: 'A' }),
      ],
    })
    expect(l.stage).toBe('approved')
    expect(l.currentRevision).toBe(1)
  })

  it('a C return opens the next revision, back with ADTECH', () => {
    const l = deriveLifecycle({
      ...base,
      submissions: [sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code: 'C' })],
    })
    expect(l.currentRevision).toBe(1)
    expect(l.stage).toBe('drafting')
    expect(l.possession).toBe('adtech')
    expect(l.currentRevisionChecked).toBe(false)
  })

  it('done without ever going through the lifecycle reads as marked by hand', () => {
    expect(deriveLifecycle({ ...base, status: 'done' }).possession).toBe('marked_done_by_hand')
    expect(deriveLifecycle({ ...base, legacyDoneNoHistory: true }).possession).toBe('marked_done_by_hand')
  })
})

describe('the two clocks (§9.4)', () => {
  it('counts an open submission to today, and our side up to the send', () => {
    // Held 1 Sep → 6 Sep (5d with us), sent 6 Sep, still out at 24 Sep (18d).
    const l = deriveLifecycle({ ...base, submissions: [sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z' })] })
    expect(l.clocks.withAdtechDays).toBe(5)
    expect(l.clocks.withReviewerDays).toBe(18)
    expect(l.clocks.showProportionBar).toBe(true)
  })

  it('sums both sides across every revision', () => {
    // Rev 0: ours 1→6 (5d), theirs 6→16 (10d), C return.
    // Rev 1: ours 16→20 (4d), theirs 20→24 open (4d).
    const l = deriveLifecycle({
      ...base,
      submissions: [
        sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code: 'C' }),
        sub({ revision: 1, submittedAt: '2026-09-20T00:00:00Z' }),
      ],
    })
    expect(l.clocks.withAdtechDays).toBe(9)
    expect(l.clocks.withReviewerDays).toBe(14)
  })

  it('keeps our clock running while we hold it after a C return', () => {
    // Ours 1→6 (5d), theirs 6→16, returned C, ours again 16→24 (8d).
    const l = deriveLifecycle({
      ...base,
      submissions: [
        sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code: 'C' }),
      ],
    })
    expect(l.clocks.withAdtechDays).toBe(13)
    expect(l.clocks.withReviewerDays).toBe(10)
  })

  it('stops our clock once the drawing is approved', () => {
    const l = deriveLifecycle({
      ...base,
      status: 'done',
      submissions: [
        sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code: 'A' }),
      ],
    })
    // 1→6 only. It does not keep accruing after approval.
    expect(l.clocks.withAdtechDays).toBe(5)
    expect(l.clocks.withReviewerDays).toBe(10)
  })

  it('runs our clock from the start when nothing has been sent', () => {
    const l = deriveLifecycle(base)
    expect(l.clocks.withAdtechDays).toBe(23)
    expect(l.clocks.withReviewerDays).toBeNull()
  })

  describe('"start not recorded" is permanent (§9.4)', () => {
    const noStart = { ...base, draftingStartedAt: null }

    it('never substitutes a proxy for a missing start', () => {
      const l = deriveLifecycle({
        ...noStart,
        submissions: [
          sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code: 'A' }),
        ],
      })
      // Not the first submission date, not created_at, not 0 — null.
      expect(l.clocks.withAdtechDays).toBeNull()
    })

    it('omits the proportion bar, because a proportion needs both halves', () => {
      expect(deriveLifecycle(noStart).clocks.showProportionBar).toBe(false)
    })

    it('still reports the reviewer side, which is independently known', () => {
      const l = deriveLifecycle({
        ...noStart,
        submissions: [
          sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-16T00:00:00Z', code: 'A' }),
        ],
      })
      expect(l.clocks.withReviewerDays).toBe(10)
    })
  })
})

describe('the origin line (§9.3)', () => {
  it('starts Rev 0 at the recorded drafting start', () => {
    const l = deriveLifecycle(base)
    expect(originLine(base, l)).toEqual({ revision: 0, startedAt: '2026-09-01T00:00:00Z', afterCReturn: false })
  })

  it('starts a later revision at the C return that caused it', () => {
    const input = {
      ...base,
      submissions: [
        sub({ revision: 0, submittedAt: '2026-09-06T00:00:00Z', returnedAt: '2026-09-18T00:00:00Z', code: 'C' as const }),
      ],
    }
    const l = deriveLifecycle(input)
    expect(originLine(input, l)).toEqual({
      revision: 1,
      startedAt: '2026-09-18T00:00:00Z',
      afterCReturn: true,
    })
  })
})
