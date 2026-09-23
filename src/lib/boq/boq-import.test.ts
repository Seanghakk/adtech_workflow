import { describe, it, expect } from 'vitest'
import { BOQ_TIERS } from './tiers'
import { parseBoqSheet } from './parse'
import { diffBoqLines, buildProposedFloors, buildProposedSystems, proposeDrawingCode, type ExistingBoqLine } from './diff'

const SD = BOQ_TIERS.shop_drawing
const CONTRACT = BOQ_TIERS.contract

const sdHeaders = [...SD.fixedHeaders]
const noFloors = new Map<string, { floorLabel: string; towerLabel: string | null }>()

describe('parseBoqSheet — file-level refusal (v7.2 §7.3)', () => {
  it('refuses a file whose fixed headers are wrong, before reading any row', () => {
    const result = parseBoqSheet([['Item', 'Desc', 'Qty'], ['1.1', 'x', '2']], SD, noFloors)
    expect(result.kind).toBe('not-template')
    if (result.kind !== 'not-template') return
    expect(result.expectedHeaders).toEqual(sdHeaders)
    expect(result.foundHeaders).toEqual(['Item', 'Desc', 'Qty'])
  })

  it('accepts the template even when extra floor columns are present', () => {
    const result = parseBoqSheet([[...sdHeaders, 'L1']], SD, noFloors)
    // Header-only file: the shape is right, there is simply nothing in it.
    expect(result.kind).toBe('no-data-rows')
  })
})

describe('parseBoqSheet — row errors (v7.2 §7.5)', () => {
  const row = (over: Record<number, string>) => {
    const base = ['1.1', 'Fire Alarm', 'Smoke detector', 'Siemens', 'M-1', 'nos', '40', '']
    for (const [i, v] of Object.entries(over)) base[Number(i)] = v
    return base
  }

  it('returns good rows AND failures together — a bad row does not reject the file', () => {
    const result = parseBoqSheet([sdHeaders, row({}), row({ 0: '1.2', 6: 'TBC' })], SD, noFloors)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.lines).toHaveLength(1)
    expect(result.rowErrors).toHaveLength(1)
    expect(result.rowErrors[0].message).toContain('Row 3')
    expect(result.rowErrors[0].message).toContain('quantity "TBC" is not a number')
  })

  it('refuses a row with no item number (Brief 098 §3.5)', () => {
    const result = parseBoqSheet([sdHeaders, row({ 0: '' })], SD, noFloors)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.lines).toHaveLength(0)
    expect(result.rowErrors[0].message).toContain('no item number')
  })

  it('refuses a duplicate item number within one file, naming the first row', () => {
    const result = parseBoqSheet([sdHeaders, row({}), row({})], SD, noFloors)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.lines).toHaveLength(1)
    expect(result.rowErrors[0].message).toContain('already used on row 2')
  })

  it('reads a known floor column into a location, and leaves blanks unrecorded', () => {
    const known = new Map([['L1', { floorLabel: 'L1', towerLabel: null }]])
    const result = parseBoqSheet([[...sdHeaders, 'L1', 'L2'], [...row({}), '25', '']], SD, known)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.lines[0].locations).toEqual([
      { locationLabel: 'L1', floorLabel: 'L1', towerLabel: null, quantity: 25 },
    ])
    expect(result.fileFloorHeaders).toEqual(['L1', 'L2'])
  })

  it('splits an UNKNOWN tower floor column the same way the proposal will', () => {
    // Regression: a quantity in a column for a floor the project does not
    // have yet must carry the floor label and tower label separately, so it
    // resolves to the floor the same commit creates. Recording it against
    // the whole "Tower 1 - B2" header left floor_id null on commit.
    const result = parseBoqSheet([[...sdHeaders, 'Tower 1 - B2'], [...row({}), '7']], SD, noFloors)
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.lines[0].locations).toEqual([
      { locationLabel: 'Tower 1 - B2', floorLabel: 'B2', towerLabel: 'Tower 1', quantity: 7 },
    ])
    // ...and that is exactly what buildProposedFloors will create.
    const proposed = buildProposedFloors(result.fileFloorHeaders, new Set(), 0)
    expect(proposed[0].label).toBe('B2')
    expect(proposed[0].towerLabel).toBe('Tower 1')
  })

  it('ignores floor columns entirely on a tier that has none', () => {
    const contractHeaders = [...CONTRACT.fixedHeaders]
    const result = parseBoqSheet(
      [[...contractHeaders, 'L1'], ['1.1', 'Sec A', 'Cable', '', 'm', '100', '9']],
      CONTRACT,
      noFloors,
    )
    expect(result.kind).toBe('ok')
    if (result.kind !== 'ok') return
    expect(result.lines[0].locations).toEqual([])
    expect(result.lines[0].sectionLabel).toBe('Sec A')
    expect(result.fileFloorHeaders).toEqual([])
  })
})

describe('diffBoqLines — the four groups (v7.2 §7.4)', () => {
  const parsedLine = (itemNumber: string, description: string, quantity: number) => ({
    rowNumber: 2,
    itemNumber,
    sectionLabel: null,
    systemType: 'Fire Alarm',
    description,
    brand: null,
    model: null,
    partNumber: null,
    unit: 'nos',
    quantity,
    remarks: null,
    locations: [],
  })

  const existing: ExistingBoqLine[] = [
    { id: 'a', itemNumber: '1.1', sectionLabel: null, systemType: 'Fire Alarm', description: 'Smoke detector', brand: null, unit: 'nos', quantity: 40 },
    { id: 'b', itemNumber: '1.2', sectionLabel: null, systemType: 'Fire Alarm', description: 'Dome camera', brand: null, unit: 'nos', quantity: 10 },
  ]

  it('sorts lines into new, changed, unchanged and missing', () => {
    const diff = diffBoqLines(
      [parsedLine('1.1', 'Smoke detector', 55), parsedLine('1.3', 'NVR', 1)],
      existing,
      SD,
    )
    expect(diff.changedLines).toHaveLength(1)
    expect(diff.changedLines[0].changes).toEqual([{ field: 'Total Quantity', was: '40', now: '55' }])
    expect(diff.newLines.map((l) => l.itemNumber)).toEqual(['1.3'])
    expect(diff.unchangedLines).toHaveLength(0)
    // 1.2 is in the app but not in the file — reported, never deleted.
    expect(diff.missingLines.map((l) => l.id)).toEqual(['b'])
  })

  it('counts an identical re-import as entirely unchanged', () => {
    const diff = diffBoqLines(
      [parsedLine('1.1', 'Smoke detector', 40), parsedLine('1.2', 'Dome camera', 10)],
      existing,
      SD,
    )
    expect(diff.unchangedLines).toHaveLength(2)
    expect(diff.changedLines).toHaveLength(0)
    expect(diff.newLines).toHaveLength(0)
    expect(diff.missingLines).toHaveLength(0)
  })

  it('treats an existing line with no item number as unmatchable, and never as changed', () => {
    const orphan: ExistingBoqLine[] = [
      { id: 'z', itemNumber: null, sectionLabel: null, systemType: null, description: 'Legacy line', brand: null, unit: 'nos', quantity: 3 },
    ]
    const diff = diffBoqLines([parsedLine('1.1', 'Smoke detector', 40)], orphan, SD)
    expect(diff.newLines).toHaveLength(1)
    expect(diff.missingLines.map((l) => l.id)).toEqual(['z'])
    expect(diff.changedLines).toHaveLength(0)
  })
})

describe('proposals (v7.2 §7.6)', () => {
  it('proposes a drawing code the database constraint will actually accept', () => {
    expect(proposeDrawingCode('B2')).toBe('B2')
    expect(proposeDrawingCode('Level 07')).toBe('Level07')
    expect(proposeDrawingCode('Tower 1 - B2')).toBe('Tower1B2')
    // Nothing usable left — better blank than a code that would be refused.
    expect(proposeDrawingCode('—')).toBe('')
  })

  it('proposes only the floors the project does not already have, ordered in tens', () => {
    const proposals = buildProposedFloors(['L1', 'Tower 1 - B2', 'L3'], new Set(['L1']), 2)
    expect(proposals).toEqual([
      { label: 'B2', towerLabel: 'Tower 1', drawingCode: 'B2', sortOrder: 30 },
      { label: 'L3', towerLabel: null, drawingCode: 'L3', sortOrder: 40 },
    ])
  })

  it('guesses a CAD code only on a real lookup match, and leaves the rest blank', () => {
    const lookup = [
      { code: 'FIRE', labelEn: 'Fire Alarm' },
      { code: 'CCTV', labelEn: 'CCTV' },
    ]
    const proposals = buildProposedSystems(
      ['Fire Alarm', 'cctv', 'Something Bespoke', 'Fire Alarm'],
      new Set<string>(),
      lookup,
    )
    expect(proposals).toEqual([
      { name: 'Fire Alarm', cadCode: 'FIRE' },
      { name: 'cctv', cadCode: 'CCTV' },
      { name: 'Something Bespoke', cadCode: null },
    ])
  })

  it('does not propose a system the project already holds', () => {
    const proposals = buildProposedSystems(['Fire Alarm'], new Set(['Fire Alarm']), [])
    expect(proposals).toEqual([])
  })
})
