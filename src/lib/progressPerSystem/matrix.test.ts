import { describe, it, expect } from 'vitest'
import { buildSystemMatrixRows, systemCoverageCaption } from '@/app/(app)/projects/[projectId]/floor-matrix'
import { groupFloorsByTower } from '@/lib/floorLabels/towerGroups'

const towers: never[] = []
const floors = [
  { id: 'b1', label: 'B1', sortOrder: 1, towerId: null },
  { id: 'gf', label: 'GF', sortOrder: 2, towerId: null },
  { id: 'l1', label: 'L1', sortOrder: 3, towerId: null },
]

const daysSince = () => 0
const isStale = () => false

const OTHER = 'Other floors'

/** The sections flattened back to the flat row list these assertions were
 *  written against. Grouping changed the shape, not the rows. */
function build(args: Parameters<typeof buildSystemMatrixRows>[0]) {
  return buildSystemMatrixRows(args).flatMap((s) => s.rows)
}

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
    const rows = build({
      towers, floors, systems, cells: [],
      latestInspectionBySubStageId: new Map(), daysSince, isStale, otherFloorsHeading: OTHER,
    })
    expect(rows).toHaveLength(3)
    // Each row carries a group per system, so floors stay aligned.
    expect(rows.every((r) => r.groups.length === 2)).toBe(true)
    expect(rows.every((r) => r.groups.every((g) => g.cells.length === 5))).toBe(true)
  })

  it('renders an uncovered floor as not_applicable — the state D096 makes real', () => {
    const rows = build({
      towers, floors, systems, cells: [],
      latestInspectionBySubStageId: new Map(), daysSince, isStale, otherFloorsHeading: OTHER,
    })
    const gf = rows.find((r) => r.floorId === 'gf')!
    const carPark = gf.groups.find((g) => g.systemId === 'carp')!
    expect(carPark.cells.every((c) => c.state === 'not_applicable')).toBe(true)
    // Before D096 the app could not produce this state at all (Brief 101).
    expect(carPark.cells.every((c) => c.subStageId === null)).toBe(true)
  })

  it('shows two systems on ONE floor at different states — the point of D096', () => {
    const rows = build({
      towers, floors, systems,
      cells: [
        cell('cctv', 'b1', 'first_fix', 'done'),
        cell('carp', 'b1', 'first_fix', 'not_started'),
      ],
      latestInspectionBySubStageId: new Map(), daysSince, isStale, otherFloorsHeading: OTHER,
    })
    const b1 = rows.find((r) => r.floorId === 'b1')!
    expect(b1.groups.find((g) => g.systemId === 'cctv')!.cells[0].state).toBe('awaiting_qc')
    expect(b1.groups.find((g) => g.systemId === 'carp')!.cells[0].state).toBe('not_started')
  })

  it('never borrows one system s cell for another', () => {
    const rows = build({
      towers, floors, systems,
      cells: [cell('cctv', 'b1', 'first_fix', 'done')],
      latestInspectionBySubStageId: new Map(), daysSince, isStale, otherFloorsHeading: OTHER,
    })
    const b1 = rows.find((r) => r.floorId === 'b1')!
    expect(b1.groups.find((g) => g.systemId === 'carp')!.cells[0].subStageId).toBeNull()
  })

  // ---- Design's tower-label rule, 28 Sep 2026 ------------------------------

  it('draws no heading when every floor is tower-less — rule 3', () => {
    const sections = buildSystemMatrixRows({
      towers, floors, systems, cells: [],
      latestInspectionBySubStageId: new Map(), daysSince, isStale, otherFloorsHeading: OTHER,
    })
    expect(sections).toHaveLength(1)
    expect(sections[0].heading).toBeNull()
  })

  it('splits into one section per tower, with bare labels beneath — rules 1 and 2', () => {
    const sections = buildSystemMatrixRows({
      towers: [
        { id: 'tw', label: 'Tower', sortOrder: 2 },
        { id: 'pod', label: 'Podium', sortOrder: 1 },
      ],
      floors: [
        { id: 'p-gf', label: 'GF', sortOrder: 1, towerId: 'pod' },
        { id: 't-gf', label: 'GF', sortOrder: 2, towerId: 'tw' },
        { id: 't-l2', label: 'L2', sortOrder: 3, towerId: 'tw' },
      ],
      systems: [{ id: 'cctv', name: 'CCTV', coveredFloorIds: new Set(['p-gf', 't-gf', 't-l2']) }],
      cells: [],
      latestInspectionBySubStageId: new Map(), daysSince, isStale, otherFloorsHeading: OTHER,
    })
    expect(sections.map((s) => s.heading)).toEqual(['Podium', 'Tower'])
    // The tower is named once, above; never inside a floor label.
    expect(sections.flatMap((s) => s.rows).map((r) => r.label)).toEqual(['GF', 'GF', 'L2'])
    // Rule 5 — the qualified form survives for accessible names/tooltips.
    expect(sections[1].rows.map((r) => r.fullLabel)).toEqual(['Tower - GF', 'Tower - L2'])
  })

  it('heads a tower-less group "Other floors" when towers share the view — rule 4', () => {
    const sections = buildSystemMatrixRows({
      towers: [{ id: 'tw', label: 'Tower', sortOrder: 1 }],
      floors: [
        { id: 'site', label: 'Site office', sortOrder: 1, towerId: null },
        { id: 't-gf', label: 'GF', sortOrder: 2, towerId: 'tw' },
      ],
      systems: [{ id: 'cctv', name: 'CCTV', coveredFloorIds: new Set(['site', 't-gf']) }],
      cells: [],
      latestInspectionBySubStageId: new Map(), daysSince, isStale, otherFloorsHeading: OTHER,
    })
    // Tower-less keeps its existing position — first.
    expect(sections.map((s) => s.heading)).toEqual([OTHER, 'Tower'])
  })
})

describe('systemCoverageCaption — §11.5s header caption', () => {
  const flat = () => groupFloorsByTower(towers, floors, OTHER)

  it('gives a bare count when a system covers every floor', () => {
    expect(systemCoverageCaption(flat(), new Set(['b1', 'gf', 'l1']))).toEqual({ count: 3, range: null })
  })

  it('gives a range for a contiguous run — §11.5s "B3–B1 · 3 floors"', () => {
    expect(systemCoverageCaption(flat(), new Set(['b1', 'gf']))).toEqual({
      count: 2, range: 'B1–GF',
    })
  })

  // CHANGED BY DESIGN'S RULE. This used to return null — "not contiguous,
  // say nothing". Design specifies commas instead ("Tower: GF–L2, L5"), so
  // a gap is now stated rather than swallowed.
  it('splits a non-contiguous run with commas rather than dropping the range', () => {
    expect(systemCoverageCaption(flat(), new Set(['b1', 'l1']))).toEqual({
      count: 2, range: 'B1, L1',
    })
  })

  it('reports zero for a system that covers nothing', () => {
    expect(systemCoverageCaption(flat(), new Set())).toEqual({ count: 0, range: null })
  })

  // ---- the defect this rule was written to fix ----------------------------

  it('never ranges across a tower boundary — the "Tower - GF–Tower - L2" bug', () => {
    const groups = groupFloorsByTower(
      [
        { id: 'pod', label: 'Podium', sortOrder: 1 },
        { id: 'tw', label: 'Tower', sortOrder: 2 },
      ],
      [
        { id: 'p-b1', label: 'B1', sortOrder: 1, towerId: 'pod' },
        { id: 'p-l1', label: 'L1', sortOrder: 2, towerId: 'pod' },
        { id: 't-gf', label: 'GF', sortOrder: 3, towerId: 'tw' },
        { id: 't-l2', label: 'L2', sortOrder: 4, towerId: 'tw' },
        // L3 exists and is NOT covered below — that gap is what makes the
        // next assertion a comma case rather than a range.
        { id: 't-l3', label: 'L3', sortOrder: 5, towerId: 'tw' },
        { id: 't-l5', label: 'L5', sortOrder: 6, towerId: 'tw' },
      ],
      OTHER,
    )
    // Every floor of both towers except one — so a range exists in each.
    expect(systemCoverageCaption(groups, new Set(['p-b1', 'p-l1', 't-gf', 't-l2'])).range).toBe(
      'Podium: B1–L1 · Tower: GF–L2',
    )
    // And a gap inside one tower is commas, not a span across the seam.
    expect(systemCoverageCaption(groups, new Set(['t-gf', 't-l2', 't-l5'])).range).toBe(
      'Tower: GF–L2, L5',
    )
  })

  it('drops the range dash for a single floor in a group', () => {
    const groups = groupFloorsByTower(
      [{ id: 'tw', label: 'Tower', sortOrder: 1 }],
      [
        { id: 't-gf', label: 'GF', sortOrder: 1, towerId: 'tw' },
        { id: 't-l5', label: 'L5', sortOrder: 2, towerId: 'tw' },
      ],
      OTHER,
    )
    expect(systemCoverageCaption(groups, new Set(['t-l5'])).range).toBe('Tower: L5')
  })

  it('prefixes a mixed view s tower-less group with its heading', () => {
    const groups = groupFloorsByTower(
      [{ id: 'tw', label: 'Tower', sortOrder: 1 }],
      [
        { id: 'site', label: 'B1', sortOrder: 1, towerId: null },
        { id: 't-gf', label: 'GF', sortOrder: 2, towerId: 'tw' },
        { id: 't-l2', label: 'L2', sortOrder: 3, towerId: 'tw' },
      ],
      OTHER,
    )
    expect(systemCoverageCaption(groups, new Set(['site', 't-gf'])).range).toBe(
      'Other floors: B1 · Tower: GF',
    )
  })
})
