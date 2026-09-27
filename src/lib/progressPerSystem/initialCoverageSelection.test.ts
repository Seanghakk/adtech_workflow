import { describe, it, expect } from 'vitest'
import { initialCoverageSelection } from './initialCoverageSelection'

const FLOORS = ['b3', 'b2', 'b1', 'gf', 'l1', 'l2']

describe('initialCoverageSelection — §6.5', () => {
  it('a system just added by hand opens with EVERY floor selected', () => {
    expect(initialCoverageSelection(FLOORS, [], true)).toEqual(FLOORS)
  })

  // The distinction this function exists for. Production hit exactly this on
  // 26 Sep 2026: a system was added, got no coverage, and the editor opened
  // empty — so "just created" had to become a real input rather than being
  // inferred from "covers nothing".
  it('a system that covers NOTHING is not the same as one just created', () => {
    expect(initialCoverageSelection(FLOORS, [], false)).toEqual([])
  })

  it('re-opening an uncovered system does not re-select everything for it', () => {
    // §6.5 gives "No floors." its own copy, so covering nothing is a finished
    // decision. Offering all six floors again every visit would nag somebody
    // out of a choice they made deliberately.
    const firstVisit = initialCoverageSelection(FLOORS, [], false)
    const secondVisit = initialCoverageSelection(FLOORS, [], false)
    expect(firstVisit).toEqual([])
    expect(secondVisit).toEqual([])
  })

  it('editing existing coverage starts from what the system actually covers', () => {
    expect(initialCoverageSelection(FLOORS, ['b3', 'b2', 'b1'], false)).toEqual(['b3', 'b2', 'b1'])
  })

  // Partial coverage is the normal case in §6.5 ("3 of 30 · B3, B2, B1"), so
  // "just created" must win over it rather than the two being conflated.
  it('justCreated wins even if coverage somehow already exists', () => {
    expect(initialCoverageSelection(FLOORS, ['gf'], true)).toEqual(FLOORS)
  })

  it('returns a copy, so the caller cannot mutate the project floor list', () => {
    const out = initialCoverageSelection(FLOORS, [], true)
    out.push('l3')
    expect(FLOORS).toHaveLength(6)
  })
})
