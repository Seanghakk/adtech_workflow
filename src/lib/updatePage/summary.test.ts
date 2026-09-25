import { describe, it, expect } from 'vitest'
import {
  countCellStates,
  barSegments,
  isOpenState,
  floorBand,
  floorHasOpenWork,
  deriveNeedsAttention,
  needsAttentionIsClear,
  defaultOpenFloorIds,
  completeBasis,
  floorOption,
  type FloorSummary,
  type FloorCell,
} from './summary'
import type { MatrixCellState } from '@/app/(app)/projects/[projectId]/floor-matrix'

const cell = (state: MatrixCellState, clockDate: string | null = '2026-09-20', holderName: string | null = null): FloorCell => ({
  subStageId: `${state}-${clockDate}`,
  stage: 'installation',
  subStage: 'first_fix',
  state,
  clockDate,
  holderName,
})

const floor = (floorId: string, label: string, cells: FloorCell[]): FloorSummary => ({
  floorId,
  label,
  towerLabel: null,
  cells,
})

/** Older date = bigger age, so the helper is just "days before today". */
const ageOf = (iso: string | null) =>
  iso === null ? 0 : Math.round((Date.parse('2026-09-25') - Date.parse(iso)) / 86_400_000)

describe('the bar (§22.2)', () => {
  it('omits zero-count segments', () => {
    const counts = countCellStates(['qc_passed', 'qc_passed', 'not_started'])
    expect(barSegments(counts).map((s) => [s.state, s.count])).toEqual([
      ['not_started', 1],
      ['qc_passed', 2],
    ])
  })

  it('keeps matrix order rather than count order', () => {
    // not_started must come first even though qc_passed is larger.
    const counts = countCellStates(['qc_passed', 'qc_passed', 'qc_passed', 'not_started'])
    expect(barSegments(counts)[0].state).toBe('not_started')
  })

  it('shows Not applicable only when above zero', () => {
    expect(barSegments(countCellStates(['qc_passed'])).some((s) => s.state === 'not_applicable')).toBe(false)
    expect(
      barSegments(countCellStates(['qc_passed', 'not_applicable'])).some((s) => s.state === 'not_applicable'),
    ).toBe(true)
  })
})

describe('what "open" means (§22.3) — one definition, several callers', () => {
  it('counts in progress, awaiting QC, failed and stalled', () => {
    expect(['in_progress', 'awaiting_qc', 'qc_failed', 'stalled'].every((s) => isOpenState(s as MatrixCellState))).toBe(true)
  })

  it('does NOT count not started or QC passed', () => {
    // Nothing has begun, and nothing is left to do — neither is "open
    // work" and treating either as open would fill the filter with
    // floors nobody needs to look at.
    expect(isOpenState('not_started')).toBe(false)
    expect(isOpenState('qc_passed')).toBe(false)
  })
})

describe('the floor band (§22.4) is the oldest OPEN cell', () => {
  it('takes the oldest open cell, not the oldest cell', () => {
    const f = floor('f1', 'L1', [
      cell('qc_passed', '2026-01-01'), // much older, but not open
      cell('in_progress', '2026-09-01'),
      cell('awaiting_qc', '2026-09-20'),
    ])
    expect(floorBand(f, ageOf)).toBe('in_progress')
  })

  it('is transparent when nothing is open', () => {
    const f = floor('f1', 'L1', [cell('qc_passed'), cell('not_started')])
    expect(floorBand(f, ageOf)).toBeNull()
    expect(floorHasOpenWork(f)).toBe(false)
  })
})

describe('Needs attention (§22.2)', () => {
  it('names the oldest unmoved open cell with its holder and age', () => {
    const floors = [
      floor('f1', 'L1', [cell('in_progress', '2026-09-24', 'Sok Dara')]),
      floor('f2', 'L2', [cell('qc_failed', '2026-09-06', 'Chan Nita')]),
    ]
    const n = deriveNeedsAttention(floors, ageOf)
    expect(n.oldestUnmoved?.floorLabel).toBe('L2')
    expect(n.oldestUnmoved?.holderName).toBe('Chan Nita')
    expect(n.oldestUnmoved?.ageDays).toBe(19)
  })

  it('counts failed and awaiting separately, and names the first failed floor', () => {
    const floors = [
      floor('f1', 'L1', [cell('qc_failed', '2026-09-10'), cell('awaiting_qc', '2026-09-22')]),
      floor('f2', 'L2', [cell('awaiting_qc', '2026-09-23')]),
    ]
    const n = deriveNeedsAttention(floors, ageOf)
    expect(n.qcFailed.count).toBe(1)
    expect(n.qcFailed.firstFloorLabel).toBe('L1')
    expect(n.awaitingQc.count).toBe(2)
    expect(n.awaitingQc.floorIds).toEqual(['f1', 'f2'])
  })

  it('is clear only when all three are empty', () => {
    const allDone = [floor('f1', 'L1', [cell('qc_passed'), cell('not_started')])]
    expect(needsAttentionIsClear(deriveNeedsAttention(allDone, ageOf))).toBe(true)

    const oneOpen = [floor('f1', 'L1', [cell('in_progress')])]
    expect(needsAttentionIsClear(deriveNeedsAttention(oneOpen, ageOf))).toBe(false)
  })

  it('a project with no floors at all is clear, not broken', () => {
    expect(needsAttentionIsClear(deriveNeedsAttention([], ageOf))).toBe(true)
  })
})

describe('which floors start open (§22.5)', () => {
  it('opens them all at four or fewer', () => {
    expect(defaultOpenFloorIds(['a', 'b', 'c', 'd'], null)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('above four, opens only the floor named in the URL', () => {
    expect(defaultOpenFloorIds(['a', 'b', 'c', 'd', 'e'], 'c')).toEqual(['c'])
  })

  it('above four with no floor in the URL, opens none', () => {
    expect(defaultOpenFloorIds(['a', 'b', 'c', 'd', 'e'], null)).toEqual([])
  })

  it('ignores a ?floor= that is not on this project', () => {
    // A stale link, or a floor since deleted. It must not open nothing
    // AND claim a floor — it just opens nothing.
    expect(defaultOpenFloorIds(['a', 'b', 'c', 'd', 'e'], 'zzz')).toEqual([])
  })

  it('opens a small project fully even when the URL names one floor', () => {
    expect(defaultOpenFloorIds(['a', 'b'], 'a')).toEqual(['a', 'b'])
  })
})

describe('the Complete block’s basis (open item 21)', () => {
  it('counts drawings as well as sub-stage cells, because the figure does', () => {
    const floors = [
      floor('f1', 'L1', [cell('qc_passed'), cell('not_started')]),
      floor('f2', 'L2', [cell('in_progress')]),
    ]
    const basis = completeBasis(floors, 2, 6)
    expect(basis.subStageCells).toBe(3)
    expect(basis.drawings).toBe(8)
    // one bucket per floor plus the project-level drawing bucket
    expect(basis.buckets).toBe(3)
  })

  it('drops the project-level bucket when it has no rows', () => {
    // compute_project_rollup_percent contributes no rows for an empty
    // bucket rather than scoring it zero, so the count must match.
    const basis = completeBasis([floor('f1', 'L1', [cell('qc_passed')])], 0, 0)
    expect(basis.buckets).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// §22.8 floor picker options
// ---------------------------------------------------------------------------

describe('floorOption', () => {
  // Ages: the fixture dates map to fixed day counts so the assertions
  // do not move with the clock.
  const ageOf = (iso: string | null) => (iso === null ? 0 : Number(iso))

  function floor(cells: Partial<FloorCell>[]): FloorSummary {
    return {
      floorId: 'f1',
      label: 'L7',
      towerLabel: null,
      cells: cells.map((c, i) => ({
        subStageId: `s${i}`,
        stage: 'rough_in',
        subStage: 'first_fix',
        state: 'not_started',
        clockDate: '0',
        holderName: null,
        ...c,
      })) as FloorCell[],
    }
  }

  it('names the holder and the age of the oldest open cell when stalled', () => {
    const o = floorOption(
      floor([
        { state: 'stalled', clockDate: '19', holderName: 'Dara Kim' },
        { state: 'in_progress', clockDate: '4', holderName: 'Someone Else' },
      ]),
      ageOf,
    )
    expect(o).toEqual({ kind: 'stalled', holderName: 'Dara Kim', ageDays: 19 })
  })

  it('drops the stalled word when the oldest open cell is merely in progress', () => {
    const o = floorOption(floor([{ state: 'in_progress', clockDate: '4', holderName: 'Dara Kim' }]), ageOf)
    expect(o).toEqual({ kind: 'open', holderName: 'Dara Kim', ageDays: 4 })
  })

  it('names the queue, not a person, when every open cell is awaiting QC', () => {
    const o = floorOption(
      floor([
        { state: 'awaiting_qc', clockDate: '3', holderName: 'Dara Kim' },
        { state: 'qc_passed', clockDate: '1' },
      ]),
      ageOf,
    )
    expect(o.kind).toBe('awaiting')
    expect(o.holderName).toBeNull()
  })

  it('reports a failed cell as open work with its holder, not as awaiting', () => {
    const o = floorOption(
      floor([
        { state: 'awaiting_qc', clockDate: '2' },
        { state: 'qc_failed', clockDate: '9', holderName: 'Dara Kim' },
      ]),
      ageOf,
    )
    expect(o).toEqual({ kind: 'open', holderName: 'Dara Kim', ageDays: 9 })
  })

  it('says all QC passed only when nothing is left, counting not-applicable as settled', () => {
    expect(floorOption(floor([{ state: 'qc_passed' }, { state: 'not_applicable' }]), ageOf).kind).toBe('all_passed')
  })

  it('says not started when a passed cell sits beside an untouched one', () => {
    expect(floorOption(floor([{ state: 'qc_passed' }, { state: 'not_started' }]), ageOf).kind).toBe('not_started')
  })

  it('says not started, not all-passed, for a floor with no cells at all', () => {
    expect(floorOption(floor([]), ageOf).kind).toBe('not_started')
  })
})
