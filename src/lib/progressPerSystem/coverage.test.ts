import { describe, it, expect } from 'vitest'
import { coverageShape, removalWarnings, systemsWithNoCoverage, type CoverageFloor } from './coverage'

/** Thirty floors in building order: B3, B2, B1, GF, L1 … L26. */
const FLOORS: CoverageFloor[] = [
  { id: 'b3', label: 'B3' },
  { id: 'b2', label: 'B2' },
  { id: 'b1', label: 'B1' },
  { id: 'gf', label: 'GF' },
  ...Array.from({ length: 26 }, (_, i) => ({ id: `l${i + 1}`, label: `L${i + 1}` })),
]

describe('coverageShape — §6.5s three forms', () => {
  it('says "All 30 floors" when every floor is covered', () => {
    expect(coverageShape(FLOORS, FLOORS.map((f) => f.id))).toEqual({ kind: 'all', total: 30 })
  })

  it('gives a range for a contiguous run — §6.5s "27 of 30 · GF to L26"', () => {
    const ids = FLOORS.slice(3).map((f) => f.id) // GF through L26
    expect(coverageShape(FLOORS, ids)).toEqual({
      kind: 'range', covered: 27, total: 30, from: 'GF', to: 'L26',
    })
  })

  it('names five or fewer — §6.5s "3 of 30 · B3, B2, B1"', () => {
    // Deliberately passed out of order: the shape must follow BUILDING order.
    expect(coverageShape(FLOORS, ['b1', 'b3', 'b2'])).toEqual({
      kind: 'named', covered: 3, total: 30, labels: ['B3', 'B2', 'B1'],
    })
  })

  it('does NOT call a broken run contiguous', () => {
    // B3, B2, then L1 — a gap, so naming a "B3 to L1" range would be a lie.
    const s = coverageShape(FLOORS, ['b3', 'b2', 'l1'])
    expect(s.kind).toBe('named')
  })

  it('prefers naming two floors over a range, which would be longer and say less', () => {
    expect(coverageShape(FLOORS, ['b3', 'b2']).kind).toBe('named')
  })

  it('names a contiguous run of five, because naming wins at five or fewer', () => {
    // The range form is for runs too long to list, not for runs as such —
    // §6.5's own "3 of 30 · B3, B2, B1" is contiguous and named.
    const s = coverageShape(FLOORS, ['b3', 'b2', 'b1', 'gf', 'l1'])
    expect(s).toEqual({ kind: 'named', covered: 5, total: 30, labels: ['B3', 'B2', 'B1', 'GF', 'L1'] })
  })

  it('switches to a range at six contiguous floors', () => {
    const s = coverageShape(FLOORS, ['b3', 'b2', 'b1', 'gf', 'l1', 'l2'])
    expect(s).toEqual({ kind: 'range', covered: 6, total: 30, from: 'B3', to: 'L2' })
  })

  it('falls back to a bare count where §6.5 gives no wording — scattered and over five', () => {
    const scattered = ['b3', 'b1', 'l1', 'l3', 'l5', 'l7']
    expect(coverageShape(FLOORS, scattered)).toEqual({ kind: 'count', covered: 6, total: 30 })
  })

  it('reports none when a system covers nothing', () => {
    expect(coverageShape(FLOORS, [])).toEqual({ kind: 'none' })
  })

  it('treats a one-floor project covered as "all", not as a named list', () => {
    const one = [{ id: 'gf', label: 'GF' }]
    expect(coverageShape(one, ['gf'])).toEqual({ kind: 'all', total: 1 })
  })
})

describe('removalWarnings — §6.5s amber warning', () => {
  it('warns only about floors with work that has actually moved', () => {
    const recorded = new Map([['b1', 2], ['b2', 0]])
    const w = removalWarnings(['b1', 'b2'], FLOORS, 'Car park management', recorded)
    expect(w).toEqual([{ floorLabel: 'B1', systemName: 'Car park management', recordedSubStages: 2 }])
  })

  it('stays silent when nothing has been recorded — so the real warning keeps its force', () => {
    expect(removalWarnings(['b1'], FLOORS, 'CCTV', new Map())).toEqual([])
  })
})

describe('systemsWithNoCoverage — the setup strip', () => {
  it('names the systems that will silently record nothing', () => {
    const systems = [{ id: 's1', name: 'CCTV' }, { id: 's2', name: 'Car park management' }]
    expect(systemsWithNoCoverage(systems, new Set(['s1']))).toEqual([
      { id: 's2', name: 'Car park management' },
    ])
  })
})
