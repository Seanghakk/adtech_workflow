import { describe, it, expect } from 'vitest'
import { summariseFloorRow, systemsNotOnFloor, type SystemCell } from './floorRow'
import type { MatrixCellState } from '@/app/(app)/projects/[projectId]/floor-matrix'

/** Ages are the fixture's own numbers, so assertions do not move with time. */
const ageOf = (iso: string | null) => (iso === null ? 0 : Number(iso))

function cell(
  systemId: string,
  systemName: string,
  subStage: string,
  state: MatrixCellState,
  clockDate: string | null,
  holderName: string | null = null,
): SystemCell {
  return { systemId, systemName, stage: 'installation', subStage, state, clockDate, holderName }
}

describe('summariseFloorRow — §22.4 with systems (D096)', () => {
  const cells = [
    cell('acc', 'Access control', 'first_fix', 'in_progress', '19', 'Dara Kim'),
    cell('cctv', 'CCTV', 'second_fix', 'in_progress', '6', 'Sok Chan'),
    cell('pava', 'PA/VA', 'first_fix', 'awaiting_qc', '2', 'Vanna Ly'),
    cell('cctv', 'CCTV', 'first_fix', 'qc_passed', '30', 'Sok Chan'),
  ]

  it('names the holder of the oldest open cell ACROSS systems, with its system', () => {
    const s = summariseFloorRow(cells, ageOf)
    expect(s.oldest).toMatchObject({
      systemName: 'Access control',
      subStage: 'first_fix',
      holderName: 'Dara Kim',
      ageDays: 19,
    })
  })

  it('lists every other open system by age only, oldest first', () => {
    const s = summariseFloorRow(cells, ageOf)
    expect(s.alsoOpen).toEqual([
      { systemId: 'cctv', systemName: 'CCTV', ageDays: 6 },
      { systemId: 'pava', systemName: 'PA/VA', ageDays: 2 },
    ])
  })

  it('does NOT name the other systems holders — they belong in each system header', () => {
    const s = summariseFloorRow(cells, ageOf)
    expect(JSON.stringify(s.alsoOpen)).not.toContain('Sok Chan')
    expect(JSON.stringify(s.alsoOpen)).not.toContain('Vanna Ly')
  })

  it('never lists the named system again under "Also open"', () => {
    const s = summariseFloorRow(cells, ageOf)
    expect(s.alsoOpen.map((a) => a.systemId)).not.toContain('acc')
  })

  it('reduces a system with several open cells to its own oldest age', () => {
    const s = summariseFloorRow(
      [
        cell('acc', 'Access control', 'first_fix', 'in_progress', '19', 'Dara Kim'),
        cell('cctv', 'CCTV', 'first_fix', 'in_progress', '3'),
        cell('cctv', 'CCTV', 'second_fix', 'in_progress', '11'),
      ],
      ageOf,
    )
    expect(s.alsoOpen).toEqual([{ systemId: 'cctv', systemName: 'CCTV', ageDays: 11 }])
  })

  it('counts "n of m done" across every system on the floor — §22.4s "3 of 15"', () => {
    const s = summariseFloorRow(cells, ageOf)
    expect(s.doneCount).toBe(1)
    expect(s.totalCount).toBe(4)
  })

  it('reports all-QC-passed only when every cell has passed', () => {
    const passed = [
      cell('cctv', 'CCTV', 'first_fix', 'qc_passed', '1'),
      cell('acc', 'Access control', 'first_fix', 'qc_passed', '1'),
    ]
    expect(summariseFloorRow(passed, ageOf).allQcPassed).toBe(true)
    expect(summariseFloorRow(cells, ageOf).allQcPassed).toBe(false)
  })

  it('distinguishes "nothing started" from "nothing open"', () => {
    // A fully QC-passed floor also has nothing open, but it is not "not started".
    const fresh = [cell('cctv', 'CCTV', 'first_fix', 'not_started', null)]
    expect(summariseFloorRow(fresh, ageOf).nothingStarted).toBe(true)
    expect(summariseFloorRow(fresh, ageOf).oldest).toBeNull()

    const passed = [cell('cctv', 'CCTV', 'first_fix', 'qc_passed', '1')]
    expect(summariseFloorRow(passed, ageOf).nothingStarted).toBe(false)
  })
})

describe('systemsNotOnFloor — §22.6as one line, never rows', () => {
  const systems = [
    { id: 'cctv', name: 'CCTV' },
    { id: 'carp', name: 'Car park management' },
    { id: 'idle', name: 'Unconfigured system' },
  ]

  it('names a system that covers other floors but not this one', () => {
    const out = systemsNotOnFloor(
      systems,
      new Set(['cctv']),
      new Map([['carp', ['B3', 'B2', 'B1']], ['idle', []]]),
    )
    expect(out).toEqual([{ systemName: 'Car park management', coversLabels: ['B3', 'B2', 'B1'] }])
  })

  it('stays silent about a system that covers nothing anywhere', () => {
    // That is an unconfigured system, which §6.5 reports on the setup screen
    // where it can be fixed — repeating it on every floor would be noise.
    const out = systemsNotOnFloor(systems, new Set(['cctv', 'carp']), new Map([['idle', []]]))
    expect(out).toEqual([])
  })
})
