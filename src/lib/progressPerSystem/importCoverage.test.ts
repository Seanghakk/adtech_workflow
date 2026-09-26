import { describe, it, expect } from 'vitest'
import { coverageFromParsedLines, coveragePreview } from './importCoverage'
import type { ParsedBoqLine } from '@/lib/boq/parse'

function line(systemType: string | null, floors: [string, number][]): ParsedBoqLine {
  return {
    rowNumber: 2,
    itemNumber: 'A-1',
    sectionLabel: null,
    systemType,
    description: 'x',
    brand: null,
    model: null,
    partNumber: null,
    unit: 'no',
    quantity: 1,
    remarks: null,
    locations: floors.map(([floorLabel, quantity]) => ({
      locationLabel: floorLabel,
      floorLabel,
      towerLabel: null,
      quantity,
    })),
  }
}

describe('coverageFromParsedLines — what the file proposes', () => {
  it('covers a floor where the system has a quantity', () => {
    expect(coverageFromParsedLines([line('CCTV', [['B1', 4], ['L1', 2]])])).toEqual([
      { systemName: 'CCTV', floors: [ { floorLabel: 'B1', towerLabel: null }, { floorLabel: 'L1', towerLabel: null } ] },
    ])
  })

  it('does NOT treat a zero quantity as coverage', () => {
    // The template carries a full grid of floor columns; zeros are where a
    // system does not go. Counting them would put every system everywhere.
    const s = coverageFromParsedLines([line('Car park management', [['B1', 3], ['L1', 0]])])
    expect(s).toEqual([{ systemName: 'Car park management', floors: [{ floorLabel: 'B1', towerLabel: null }] }])
  })

  it('keeps the same floor label under two towers as two floors', () => {
    const l = line('CCTV', [])
    l.locations = [
      { locationLabel: 'A - L1', floorLabel: 'L1', towerLabel: 'A', quantity: 1 },
      { locationLabel: 'B - L1', floorLabel: 'L1', towerLabel: 'B', quantity: 1 },
    ]
    expect(coverageFromParsedLines([l])[0].floors).toHaveLength(2)
  })

  it('unions floors across several lines of the same system', () => {
    const s = coverageFromParsedLines([
      line('CCTV', [['B1', 1]]),
      line('CCTV', [['L1', 1], ['L2', 1]]),
    ])
    expect(s[0].floors.map((f) => f.floorLabel).sort()).toEqual(['B1', 'L1', 'L2'])
  })

  it('ignores a line with no system type rather than inventing one', () => {
    expect(coverageFromParsedLines([line(null, [['B1', 5]])])).toEqual([])
  })
})

describe('coveragePreview — §7s table, and the additive rule', () => {
  it('keeps a floor the file no longer names', () => {
    const rows = coveragePreview(
      [{ systemName: 'CCTV', floors: [{ floorLabel: 'L1', towerLabel: null }] }],
      new Map([['CCTV', ['B1', 'L1']]]),
    )
    expect(rows[0].keptNotInFile).toEqual(['B1'])
    // B1 survives the re-import. An import must never narrow a system.
    expect(rows[0].onCommit.sort()).toEqual(['B1', 'L1'])
  })

  it('adds what the file names and marks a new system', () => {
    const rows = coveragePreview(
      [{ systemName: 'PA/VA', floors: [{ floorLabel: 'GF', towerLabel: null }] }],
      new Map(),
    )
    expect(rows[0]).toMatchObject({ isNewSystem: true, added: ['GF'], onCommit: ['GF'], now: [] })
  })

  it('lists a system that exists but this file never mentions', () => {
    const rows = coveragePreview([], new Map([['Access control', ['B1']]]))
    expect(rows[0]).toMatchObject({
      systemName: 'Access control',
      inFile: [],
      keptNotInFile: ['B1'],
      onCommit: ['B1'],
      isNewSystem: false,
    })
  })

  it('never produces an onCommit smaller than what is covered now', () => {
    const rows = coveragePreview(
      [{ systemName: 'CCTV', floors: [] }],
      new Map([['CCTV', ['B1', 'B2', 'B3']]]),
    )
    expect(rows[0].onCommit).toHaveLength(3)
  })
})
