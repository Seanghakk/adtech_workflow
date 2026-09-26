import { describe, it, expect } from 'vitest'
import { buildSystemMatrixRows, systemCoverageCaption } from '@/app/(app)/projects/[projectId]/floor-matrix'

const towers: never[] = []
const floors = [
  { id: 'b1', label: 'B1', sortOrder: 1, towerId: null },
  { id: 'gf', label: 'GF', sortOrder: 2, towerId: null },
  { id: 'l1', label: 'L1', sortOrder: 3, towerId: null },
]

const daysSince = () => 0
const isStale = () => false

function cell(systemId: string, floorId: string, subStage: string, status: string) {
  return {
    id: `${systemId}-${floorId}-${subStage}`,
    systemId,
    floorId,
    stage: subStage === 'pre_commissioning' || subStage === 'commissioning' ? 'tnc' : 'installation',
    subStage,
    status,
    updatedAt: '2026-09-01T00:00:00Z',
  }
}

describe('buildSystemMatrixRows — §11.5', () => {
  const systems = [
    { id: 'cctv', name: 'CCTV', coveredFloorIds: new Set(['b1', 'gf', 'l1']) },
    { id: 'carp', name: 'Car park management', coveredFloorIds: new Set(['b1']) },
  ]

  it('keeps every floor on ONE row across all systems', () => {
    const rows = buildSystemMatrixRows({
      towers, floors, systems, cells: [],
      latestInspectionBySubStageId: new Map(), daysSince, isStale,
    })
    expect(rows).toHaveLength(3)
    // Each row carries a group per system, so floors stay aligned.
    expect(rows.every((r) => r.groups.length === 2)).toBe(true)
    expect(rows.every((r) => r.groups.every((g) => g.cells.length === 5))).toBe(true)
  })

  it('renders an uncovered floor as not_applicable — the state D096 makes real', () => {
    const rows = buildSystemMatrixRows({
      towers, floors, systems, cells: [],
      latestInspectionBySubStageId: new Map(), daysSince, isStale,
    })
    const gf = rows.find((r) => r.floorId === 'gf')!
    const carPark = gf.groups.find((g) => g.systemId === 'carp')!
    expect(carPark.cells.every((c) => c.state === 'not_applicable')).toBe(true)
    // Before D096 the app could not produce this state at all (Brief 101).
    expect(carPark.cells.every((c) => c.subStageId === null)).toBe(true)
  })

  it('shows two systems on ONE floor at different states — the point of D096', () => {
    const rows = buildSystemMatrixRows({
      towers, floors, systems,
      cells: [
        cell('cctv', 'b1', 'first_fix', 'done'),
        cell('carp', 'b1', 'first_fix', 'not_started'),
      ],
      latestInspectionBySubStageId: new Map(), daysSince, isStale,
    })
    const b1 = rows.find((r) => r.floorId === 'b1')!
    expect(b1.groups.find((g) => g.systemId === 'cctv')!.cells[0].state).toBe('awaiting_qc')
    expect(b1.groups.find((g) => g.systemId === 'carp')!.cells[0].state).toBe('not_started')
  })

  it('never borrows one system s cell for another', () => {
    const rows = buildSystemMatrixRows({
      towers, floors, systems,
      cells: [cell('cctv', 'b1', 'first_fix', 'done')],
      latestInspectionBySubStageId: new Map(), daysSince, isStale,
    })
    const b1 = rows.find((r) => r.floorId === 'b1')!
    expect(b1.groups.find((g) => g.systemId === 'carp')!.cells[0].subStageId).toBeNull()
  })
})

describe('systemCoverageCaption — §11.5s header caption', () => {
  const ids = ['b1', 'gf', 'l1']
  const labels = ['B1', 'GF', 'L1']

  it('gives a bare count when a system covers every floor', () => {
    expect(systemCoverageCaption(ids, labels, new Set(ids))).toEqual({ count: 3, range: null })
  })

  it('gives a range for a contiguous run — §11.5s "B3–B1 · 3 floors"', () => {
    expect(systemCoverageCaption(ids, labels, new Set(['b1', 'gf']))).toEqual({
      count: 2, range: 'B1–GF',
    })
  })

  it('omits the range when the covered floors are not contiguous', () => {
    expect(systemCoverageCaption(ids, labels, new Set(['b1', 'l1']))).toEqual({
      count: 2, range: null,
    })
  })

  it('reports zero for a system that covers nothing', () => {
    expect(systemCoverageCaption(ids, labels, new Set())).toEqual({ count: 0, range: null })
  })
})
