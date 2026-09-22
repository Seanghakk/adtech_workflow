import { describe, it, expect } from 'vitest'
import { sortByAgeDescending, splitQcInspectionRows, filterProjectsByScope, type AgeSortable, type QcListRow } from './crossProjectLists'

describe('sortByAgeDescending — addendum §3.1', () => {
  it('sorts by ageDays descending', () => {
    const rows: AgeSortable[] = [
      { projectId: '1', projectName: 'Zeta', ageDays: 3 },
      { projectId: '2', projectName: 'Alpha', ageDays: 20 },
      { projectId: '3', projectName: 'Beta', ageDays: 10 },
    ]
    expect(sortByAgeDescending(rows).map((r) => r.projectId)).toEqual(['2', '3', '1'])
  })

  it('ties on ageDays break on project name, ascending (stable across refreshes)', () => {
    const rows: AgeSortable[] = [
      { projectId: '1', projectName: 'Zeta', ageDays: 10 },
      { projectId: '2', projectName: 'Alpha', ageDays: 10 },
      { projectId: '3', projectName: 'Mike', ageDays: 10 },
    ]
    expect(sortByAgeDescending(rows).map((r) => r.projectName)).toEqual(['Alpha', 'Mike', 'Zeta'])
  })

  it('does not mutate the input array', () => {
    const rows: AgeSortable[] = [
      { projectId: '1', projectName: 'B', ageDays: 1 },
      { projectId: '2', projectName: 'A', ageDays: 5 },
    ]
    const original = [...rows]
    sortByAgeDescending(rows)
    expect(rows).toEqual(original)
  })
})

describe('splitQcInspectionRows — addendum §4, "Waiting for inspection" / "Nothing waiting"', () => {
  const row = (id: string, waitingCount: number, failedCount: number, ageDays = 0): QcListRow => ({
    projectId: id,
    projectName: id,
    ageDays,
    waitingCount,
    failedCount,
  })

  it('a project with anything waiting goes in the waiting group', () => {
    const { waiting, quiet } = splitQcInspectionRows([row('A', 1, 0)])
    expect(waiting.map((r) => r.projectId)).toEqual(['A'])
    expect(quiet).toEqual([])
  })

  it('a project with a failed-awaiting-re-inspection item goes in the waiting group, not a third group', () => {
    const { waiting, quiet } = splitQcInspectionRows([row('A', 0, 1)])
    expect(waiting.map((r) => r.projectId)).toEqual(['A'])
    expect(quiet).toEqual([])
  })

  it('a project with neither waiting nor failed goes in the quiet group, not dropped', () => {
    const { waiting, quiet } = splitQcInspectionRows([row('A', 0, 0)])
    expect(waiting).toEqual([])
    expect(quiet.map((r) => r.projectId)).toEqual(['A'])
  })

  it('both groups are independently age-sorted descending', () => {
    const { waiting } = splitQcInspectionRows([row('A', 1, 0, 3), row('B', 1, 0, 20)])
    expect(waiting.map((r) => r.projectId)).toEqual(['B', 'A'])
  })
})

describe('filterProjectsByScope — mirrors board.ts filterByScope exactly', () => {
  const member = { userId: 'u1', teamId: 't1' }
  const teamIdByUserId = new Map([
    ['u1', 't1'],
    ['u2', 't1'],
    ['u3', 't2'],
  ])
  const projects = [
    { id: 'p1', picId: 'u1' }, // mine
    { id: 'p2', picId: 'u2' }, // my team, not mine
    { id: 'p3', picId: 'u3' }, // neither
    { id: 'p4', picId: null }, // unassigned
  ]

  it('mine: only projects PIC-owned by the member', () => {
    expect(filterProjectsByScope(projects, 'mine', member, teamIdByUserId).map((p) => p.id)).toEqual(['p1'])
  })

  it('my-team: PIC on the same team, including the member themselves', () => {
    expect(filterProjectsByScope(projects, 'my-team', member, teamIdByUserId).map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('everything: all projects, including unassigned', () => {
    expect(filterProjectsByScope(projects, 'everything', member, teamIdByUserId).map((p) => p.id)).toEqual([
      'p1',
      'p2',
      'p3',
      'p4',
    ])
  })
})
