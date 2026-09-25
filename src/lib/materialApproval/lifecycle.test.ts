import { describe, it, expect } from 'vitest'
import {
  derivePackage,
  productChanged,
  summarise,
  registerSort,
  type PackageInput,
  type RevisionRecord,
  type SubmissionRecord,
} from './lifecycle'

const NOW = new Date('2026-09-25T00:00:00+07:00')

function rev(n: number, over: Partial<RevisionRecord> = {}): RevisionRecord {
  return {
    id: `r${n}`,
    rev: n,
    manufacturer: 'Acme',
    product: 'Widget',
    model: 'W-1',
    startedAt: null,
    ...over,
  }
}

function sub(n: number, over: Partial<SubmissionRecord> = {}): SubmissionRecord {
  return {
    id: `s${n}`,
    revisionId: `r${n}`,
    rev: n,
    party: 'consultant',
    org: 'Meinhardt',
    sentOn: '2026-09-01',
    returnedOn: null,
    code: null,
    comments: null,
    ...over,
  }
}

function pkg(over: Partial<PackageInput> = {}): PackageInput {
  return { source: 'tracked', preparingStartedAt: null, revisions: [rev(0)], submissions: [], now: NOW, ...over }
}

describe('derivePackage — the three stages (§23.2: there is no internal check)', () => {
  it('is not started until a revision has a start', () => {
    const s = derivePackage(pkg())
    expect(s.stage).toBe('not_started')
    expect(s.possession).toBe('none')
  })

  it('is preparing once the revision has started', () => {
    const s = derivePackage(pkg({ revisions: [rev(0, { startedAt: '2026-09-01' })], preparingStartedAt: '2026-09-01' }))
    expect(s.stage).toBe('preparing')
    expect(s.possession).toBe('adtech')
  })

  it('is with the reviewer while a submission is open', () => {
    const s = derivePackage(pkg({
      revisions: [rev(0, { startedAt: '2026-09-01' })],
      preparingStartedAt: '2026-09-01',
      submissions: [sub(0)],
    }))
    expect(s.stage).toBe('submitted')
    expect(s.possession).toBe('reviewer')
  })

  it('is approved after an A return', () => {
    const s = derivePackage(pkg({
      revisions: [rev(0, { startedAt: '2026-09-01' })],
      preparingStartedAt: '2026-09-01',
      submissions: [sub(0, { returnedOn: '2026-09-10', code: 'A' })],
    }))
    expect(s.stage).toBe('approved')
    expect(s.possession).toBe('approved')
  })

  it('returns to preparing after a C, which opens the next revision', () => {
    const s = derivePackage(pkg({
      revisions: [rev(0, { startedAt: '2026-09-01' }), rev(1, { startedAt: '2026-09-10', product: 'Widget 2' })],
      preparingStartedAt: '2026-09-01',
      submissions: [sub(0, { returnedOn: '2026-09-10', code: 'C' })],
    }))
    expect(s.stage).toBe('preparing')
    expect(s.currentRev).toBe(1)
  })
})

describe('derivePackage — approved on paper (§5.3)', () => {
  const paper = pkg({
    source: 'paper',
    revisions: [rev(0, { startedAt: '2026-08-01' })],
    submissions: [sub(0, { sentOn: null, returnedOn: '2026-08-20', code: 'A' })],
  })

  it('reads as approved without ever being preparing or submitted', () => {
    const s = derivePackage(paper)
    expect(s.stage).toBe('approved')
    expect(s.possession).toBe('paper')
  })

  it('has NO clocks, permanently — never a computed duration', () => {
    const s = derivePackage(paper)
    expect(s.clocks.withAdtechDays).toBeNull()
    expect(s.clocks.withReviewerDays).toBeNull()
    expect(s.clocks.showProportionBar).toBe(false)
  })

  it('does not report a product change even when revisions differ', () => {
    const s = derivePackage({ ...paper, revisions: [rev(0), rev(1, { product: 'Other' })] })
    expect(s.productChanged).toBe(false)
  })
})

describe('the clocks are §9.4 unchanged, via §9s own helper', () => {
  it('counts days with the reviewer from sent to returned', () => {
    const s = derivePackage(pkg({
      preparingStartedAt: '2026-09-01',
      revisions: [rev(0, { startedAt: '2026-09-01' })],
      submissions: [sub(0, { sentOn: '2026-09-05', returnedOn: '2026-09-15', code: 'A' })],
    }))
    expect(s.clocks.withReviewerDays).toBe(10)
    // 1 Sep to 5 Sep is ours.
    expect(s.clocks.withAdtechDays).toBe(4)
  })

  it('says "start not recorded" rather than guessing, when there is no start', () => {
    const s = derivePackage(pkg({
      preparingStartedAt: null,
      revisions: [rev(0, { startedAt: null })],
      submissions: [sub(0, { sentOn: '2026-09-05', returnedOn: '2026-09-15', code: 'A' })],
    }))
    expect(s.clocks.withAdtechDays).toBeNull()
    expect(s.clocks.showProportionBar).toBe(false)
    // The reviewer's side is still knowable and is still stated.
    expect(s.clocks.withReviewerDays).toBe(10)
  })

  it('counts an open submission to today', () => {
    const s = derivePackage(pkg({
      preparingStartedAt: '2026-09-01',
      revisions: [rev(0, { startedAt: '2026-09-01' })],
      submissions: [sub(0, { sentOn: '2026-09-20' })],
    }))
    expect(s.clocks.withReviewerDays).toBe(5)
  })
})

describe('productChanged (§23.2)', () => {
  it('is false for the first revision', () => {
    expect(productChanged(null, rev(0))).toBe(false)
  })
  it('is true when the manufacturer changes', () => {
    expect(productChanged(rev(0), rev(1, { manufacturer: 'Beta' }))).toBe(true)
  })
  it('is true when only the model changes — a reviewer is still approving something else', () => {
    expect(productChanged(rev(0), rev(1, { model: 'W-2' }))).toBe(true)
  })
  it('is false when the revision proposes the same product again', () => {
    expect(productChanged(rev(0), rev(1))).toBe(false)
  })
})

describe('summarise (§23.5s five cells)', () => {
  const state = (over: Partial<PackageInput>) => derivePackage(pkg(over))

  it('counts a paper approval inside "approved", and again as its detail', () => {
    const s = summarise(
      [
        { state: state({ source: 'paper', submissions: [sub(0, { sentOn: null, returnedOn: '2026-08-20', code: 'A' })] }), lineCount: 2 },
        { state: state({ revisions: [rev(0, { startedAt: '2026-09-01' })], submissions: [sub(0, { returnedOn: '2026-09-10', code: 'B' })] }), lineCount: 3 },
      ],
      10,
    )
    expect(s.approved).toBe(2)
    expect(s.approvedFromPaper).toBe(1)
  })

  it('keeps the uncovered-lines gap visible', () => {
    const s = summarise([{ state: state({}), lineCount: 4 }], 10)
    expect(s.linesInAPackage).toBe(4)
    expect(s.linesNotInAnyPackage).toBe(6)
  })

  it('never reports a negative gap when a package covers lines no longer in the BOQ', () => {
    const s = summarise([{ state: state({}), lineCount: 12 }], 10)
    expect(s.linesNotInAnyPackage).toBe(0)
  })
})

describe('registerSort (§23.5)', () => {
  it('puts open packages first by age, then the rest in reference order', () => {
    const open = () => derivePackage(pkg({
      preparingStartedAt: '2026-09-01',
      revisions: [rev(0, { startedAt: '2026-09-01' })],
      submissions: [sub(0, { sentOn: '2026-09-01' })],
    }))
    const approved = derivePackage(pkg({
      revisions: [rev(0, { startedAt: '2026-09-01' })],
      submissions: [sub(0, { returnedOn: '2026-09-10', code: 'A' })],
    }))
    const notStarted = derivePackage(pkg())

    const ages = new Map<string, number>([['MA-03', 20], ['MA-05', 4]])
    const rows = [
      { ref: 'MA-09', state: approved },
      { ref: 'MA-05', state: open() },
      { ref: 'MA-01', state: notStarted },
      { ref: 'MA-03', state: open() },
    ]
    const sorted = registerSort(rows, (s) => {
      const hit = rows.find((r) => r.state === s)
      return ages.get(hit?.ref ?? '') ?? 0
    })
    expect(sorted.map((r) => r.ref)).toEqual(['MA-03', 'MA-05', 'MA-01', 'MA-09'])
  })
})
