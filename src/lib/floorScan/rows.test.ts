import { describe, it, expect } from 'vitest'
import {
  PHONE_ROW_ORDER,
  orderPhoneRows,
  buildPhoneRows,
  groupPhoneRows,
  showsQcNothingWaiting,
  type PhoneSubStageInput,
  type Stage,
} from './rows'

const sub = (
  stage: Stage,
  subStage: string,
  sequence: number,
  status: PhoneSubStageInput['status'] = 'not_started',
  inspections: PhoneSubStageInput['inspections'] = [],
): PhoneSubStageInput => ({
  id: `${stage}:${subStage}`,
  stage,
  subStage,
  sequence,
  status,
  photoUrl: null,
  updatedAt: null,
  updatedByName: null,
  inspections,
})

/** The five rows every role sees, in §12.3's fixed order. */
const fiveRows = (): PhoneSubStageInput[] => [
  sub('installation', 'first_fix', 1),
  sub('installation', 'second_fix', 2),
  sub('installation', 'third_fix', 3),
  sub('tnc', 'pre_commissioning', 1),
  sub('tnc', 'commissioning', 2),
]

describe('§12.3 — the same five rows, in the same order, every role', () => {
  it('orders installation before T&C rather than by sequence', () => {
    // The trap: `sequence` restarts at 1 for tnc, so sorting on it alone
    // interleaves the two stages and puts pre-commissioning second.
    const shuffled = [
      sub('tnc', 'pre_commissioning', 1),
      sub('installation', 'second_fix', 2),
      sub('tnc', 'commissioning', 2),
      sub('installation', 'first_fix', 1),
      sub('installation', 'third_fix', 3),
    ]
    expect(orderPhoneRows(shuffled).map((r) => r.subStage)).toEqual(
      PHONE_ROW_ORDER.map((r) => r.subStage),
    )
  })

  it('gives every role the same five rows — only the controls differ', () => {
    const forPm = buildPhoneRows(fiveRows(), { teamCode: 'project_management' })
    const forQc = buildPhoneRows(fiveRows(), { teamCode: 'qc' })
    const outsider = buildPhoneRows(fiveRows(), { teamCode: null })
    expect(forPm.map((r) => r.subStage)).toEqual(forQc.map((r) => r.subStage))
    expect(outsider.map((r) => r.subStage)).toEqual(forQc.map((r) => r.subStage))
    expect(forPm.filter((r) => r.canUpdateStatus)).toHaveLength(3)
    expect(outsider.filter((r) => r.canUpdateStatus)).toHaveLength(0)
  })
})

describe('who may act, mirroring migration 022 exactly', () => {
  it('lets project_management update installation only', () => {
    const rows = buildPhoneRows(fiveRows(), { teamCode: 'project_management' })
    expect(rows.filter((r) => r.canUpdateStatus).map((r) => r.stage)).toEqual([
      'installation',
      'installation',
      'installation',
    ])
  })

  it('lets tnc update T&C only', () => {
    const rows = buildPhoneRows(fiveRows(), { teamCode: 'tnc' })
    expect(rows.filter((r) => r.canUpdateStatus).map((r) => r.stage)).toEqual(['tnc', 'tnc'])
  })

  it('gives QC no status control at all — QC inspects, it does not update', () => {
    const rows = buildPhoneRows(fiveRows(), { teamCode: 'qc' })
    expect(rows.some((r) => r.canUpdateStatus)).toBe(false)
  })
})

describe('§12.8 — the inspection control appears on done-and-uninspected only', () => {
  it('offers it for a done row with no inspection', () => {
    const rows = buildPhoneRows(
      [sub('installation', 'first_fix', 1, 'done'), ...fiveRows().slice(1)],
      { teamCode: 'qc' },
    )
    expect(rows[0].displayState).toBe('awaiting_qc')
    expect(rows[0].canInspect).toBe(true)
  })

  it('withdraws it once inspected, pass or fail', () => {
    const passed = buildPhoneRows(
      [sub('installation', 'first_fix', 1, 'done', [{ result: 'pass', date: '2026-09-20', notes: null }])],
      { teamCode: 'qc' },
    )
    const failed = buildPhoneRows(
      [sub('installation', 'first_fix', 1, 'done', [{ result: 'fail', date: '2026-09-20', notes: 'Conduit crushed' }])],
      { teamCode: 'qc' },
    )
    expect(passed[0].canInspect).toBe(false)
    expect(failed[0].canInspect).toBe(false)
    expect(failed[0].latestInspection?.notes).toBe('Conduit crushed')
  })

  it('never offers it to someone who is not QC', () => {
    const rows = buildPhoneRows([sub('installation', 'first_fix', 1, 'done')], {
      teamCode: 'project_management',
    })
    expect(rows[0].displayState).toBe('awaiting_qc')
    expect(rows[0].canInspect).toBe(false)
  })
})

describe('§12.3 / §12.4 grouping', () => {
  it('puts the actionable group first, and never emits an empty group', () => {
    const viewer = { teamCode: 'project_management' }
    const groups = groupPhoneRows(buildPhoneRows(fiveRows(), viewer), viewer)
    expect(groups[0].kind).toBe('actionable')
    expect(groups[0].stage).toBe('installation')
    expect(groups.every((g) => g.rows.length > 0)).toBe(true)
    // the T&C rows still appear, under whoever owns them
    const owned = groups.find((g) => g.kind === 'owned')
    expect(owned?.stage).toBe('tnc')
    expect(groups.flatMap((g) => g.rows)).toHaveLength(5)
  })

  it('shows an outsider all five rows and no actionable group', () => {
    const viewer = { teamCode: null }
    const groups = groupPhoneRows(buildPhoneRows(fiveRows(), viewer), viewer)
    expect(groups.some((g) => g.kind === 'actionable')).toBe(false)
    expect(groups.every((g) => g.kind === 'owned')).toBe(true)
    expect(groups.flatMap((g) => g.rows)).toHaveLength(5)
  })

  it('moves an inspected row out of the actionable group into "Already inspected"', () => {
    const viewer = { teamCode: 'project_management' }
    const rows = buildPhoneRows(
      [
        sub('installation', 'first_fix', 1, 'done', [{ result: 'fail', date: '2026-09-21', notes: 'Redo' }]),
        sub('installation', 'second_fix', 2, 'in_progress'),
        ...fiveRows().slice(2),
      ],
      viewer,
    )
    const groups = groupPhoneRows(rows, viewer)
    const actionable = groups.find((g) => g.kind === 'actionable')
    expect(actionable?.rows.map((r) => r.subStage)).toEqual(['second_fix', 'third_fix'])
    const inspected = groups.find((g) => g.kind === 'already_inspected')
    expect(inspected?.rows.map((r) => r.subStage)).toEqual(['first_fix'])
    // §12.4: it leaves the actionable GROUP, but the installer who has to
    // redo the work can still tap it — that is the next thing to happen.
    expect(inspected?.rows[0].canUpdateStatus).toBe(true)
  })

  it('keeps a QC-failed row out of QC’s waiting group', () => {
    // A failed cell waits on the installer to redo the work, not on QC
    // to re-inspect it (§12.4).
    const viewer = { teamCode: 'qc' }
    const rows = buildPhoneRows(
      [
        sub('installation', 'first_fix', 1, 'done', [{ result: 'fail', date: '2026-09-21', notes: null }]),
        sub('installation', 'second_fix', 2, 'done'),
        ...fiveRows().slice(2),
      ],
      viewer,
    )
    const groups = groupPhoneRows(rows, viewer)
    const waiting = groups.find((g) => g.kind === 'qc_waiting')
    expect(waiting?.rows.map((r) => r.subStage)).toEqual(['second_fix'])
    expect(groups.find((g) => g.kind === 'already_inspected')?.rows.map((r) => r.subStage)).toEqual([
      'first_fix',
    ])
  })

  it('lists every row exactly once, whatever the role', () => {
    for (const teamCode of ['project_management', 'tnc', 'qc', null]) {
      const viewer = { teamCode }
      const rows = buildPhoneRows(
        [
          sub('installation', 'first_fix', 1, 'done', [{ result: 'pass', date: '2026-09-20', notes: null }]),
          sub('installation', 'second_fix', 2, 'done'),
          sub('installation', 'third_fix', 3, 'in_progress'),
          sub('tnc', 'pre_commissioning', 1),
          sub('tnc', 'commissioning', 2),
        ],
        viewer,
      )
      const groups = groupPhoneRows(rows, viewer)
      const ids = groups.flatMap((g) => g.rows.map((r) => r.id))
      expect(new Set(ids).size, `role ${teamCode}`).toBe(5)
      expect(ids, `role ${teamCode}`).toHaveLength(5)
    }
  })
})

describe('§21.6 — the phone empty states', () => {
  it('nothing started: every row not_started, and no group is empty', () => {
    const viewer = { teamCode: 'project_management' }
    const rows = buildPhoneRows(fiveRows(), viewer)
    expect(rows.every((r) => r.displayState === 'not_started')).toBe(true)
    // Group labels are unchanged in this state (§21.6 says so explicitly).
    const groups = groupPhoneRows(rows, viewer)
    expect(groups.map((g) => g.kind)).toEqual(['actionable', 'owned'])
  })

  it('QC with nothing waiting is a sentence, never an empty group', () => {
    const viewer = { teamCode: 'qc' }
    const groups = groupPhoneRows(buildPhoneRows(fiveRows(), viewer), viewer)
    expect(groups.some((g) => g.kind === 'qc_waiting')).toBe(false)
    expect(showsQcNothingWaiting(groups, viewer)).toBe(true)
  })

  it('does not show that sentence to anyone but QC', () => {
    const viewer = { teamCode: 'project_management' }
    const groups = groupPhoneRows(buildPhoneRows(fiveRows(), viewer), viewer)
    expect(showsQcNothingWaiting(groups, viewer)).toBe(false)
  })

  it('drops the sentence the moment something is waiting', () => {
    const viewer = { teamCode: 'qc' }
    const rows = buildPhoneRows(
      [sub('installation', 'first_fix', 1, 'done'), ...fiveRows().slice(1)],
      viewer,
    )
    const groups = groupPhoneRows(rows, viewer)
    expect(showsQcNothingWaiting(groups, viewer)).toBe(false)
  })
})
