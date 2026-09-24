/**
 * Brief 100 Part E — the scanned-floor phone page's rows (v7.2 §12.3,
 * §12.4, §21.6).
 *
 * Pure. Which five rows exist, what state each is in, who may act on it,
 * and which group it belongs to are all decided here so §21.6's states
 * can be tested rather than only looked at on a handset.
 *
 * The display state itself is NOT recomputed here: it comes from
 * `computeSubStageDisplayState`, whose own header says it exists so the
 * matrix and this page cannot disagree. Calling it is the point.
 */
import {
  computeSubStageDisplayState,
  resolveLatestInspection,
  type SubStageDisplayState,
} from '@/lib/subStageDisplayState'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

export type Stage = 'installation' | 'tnc'

/** The only three statuses ever stored (§12.5, and migration 008's CHECK). */
export type StoredStatus = 'not_started' | 'in_progress' | 'done'

/**
 * §12.3's fixed order, every role, always five rows. Mirrors
 * MATRIX_COLUMNS in floor-matrix.ts — the matrix's columns and this
 * page's rows are the same five things in the same order, and a person
 * who sees them disagree has no way to tell which one is lying.
 */
export const PHONE_ROW_ORDER: Array<{ stage: Stage; subStage: string }> = [
  { stage: 'installation', subStage: 'first_fix' },
  { stage: 'installation', subStage: 'second_fix' },
  { stage: 'installation', subStage: 'third_fix' },
  { stage: 'tnc', subStage: 'pre_commissioning' },
  { stage: 'tnc', subStage: 'commissioning' },
]

/** Labels live in the dictionary, not a lookup table (there isn't one). */
export const SUB_STAGE_KEYS: Record<string, DictionaryKey> = {
  first_fix: 'subStageFirstFix',
  second_fix: 'subStageSecondFix',
  third_fix: 'subStageThirdFix',
  pre_commissioning: 'subStagePreCommissioning',
  commissioning: 'subStageCommissioning',
}

/** Which team owns each stage — the same split migration 022's RLS enforces. */
export const STAGE_TEAM: Record<Stage, string> = {
  installation: 'project_management',
  tnc: 'tnc',
}

export interface PhoneInspection {
  result: 'pass' | 'fail'
  date: string
  notes: string | null
}

export interface PhoneSubStageInput {
  id: string
  stage: Stage
  subStage: string
  sequence: number
  status: StoredStatus
  photoUrl: string | null
  updatedAt: string | null
  updatedByName: string | null
  inspections: PhoneInspection[]
}

export interface PhoneRow extends PhoneSubStageInput {
  displayState: SubStageDisplayState
  /** This person's team owns this stage, so the status control opens. */
  canUpdateStatus: boolean
  /** QC, and this row is done and uninspected (§12.8's one condition). */
  canInspect: boolean
  /** The latest inspection's note, for a QC-failed row's subline (§12.4). */
  latestInspection: PhoneInspection | null
}

/**
 * §12.3: "Every role sees the same five rows in the same order — only
 * the controls differ." So the order is the constant above, never the
 * order rows happen to come back from the database in. `sequence` is
 * per-stage (1–3 installation, 1–2 tnc), so sorting on it alone would
 * interleave the two stages.
 */
export function orderPhoneRows<T extends { stage: string; subStage: string }>(rows: T[]): T[] {
  const rank = new Map(PHONE_ROW_ORDER.map((r, i) => [`${r.stage}:${r.subStage}`, i]))
  return [...rows].sort(
    (a, b) =>
      (rank.get(`${a.stage}:${a.subStage}`) ?? 99) - (rank.get(`${b.stage}:${b.subStage}`) ?? 99),
  )
}

export interface PhoneViewer {
  /** workflow.teams.code — the stable code, never the display label. */
  teamCode: string | null
}

export function buildPhoneRows(subStages: PhoneSubStageInput[], viewer: PhoneViewer): PhoneRow[] {
  return orderPhoneRows(subStages).map((s) => {
    const latestInspection = resolveLatestInspection(s.inspections)
    const displayState = computeSubStageDisplayState({
      status: s.status,
      latestInspection,
    })
    const isQc = viewer.teamCode === 'qc'
    return {
      ...s,
      displayState,
      latestInspection: latestInspection
        ? (s.inspections.find(
            (i) => i.result === latestInspection.result && i.date === latestInspection.date,
          ) ?? { ...latestInspection, notes: null })
        : null,
      // Mirrors migration 022's RLS exactly. The screen never claims a
      // permission the database would refuse — it is not the gate, but
      // it must not disagree with the gate.
      canUpdateStatus: viewer.teamCode === STAGE_TEAM[s.stage],
      // §12.8: "only on sub-stages that are done and uninspected — the
      // same condition that fills the 'Waiting for you on this floor'
      // group". One condition, used in both places, so they cannot drift.
      canInspect: isQc && displayState === 'awaiting_qc',
    }
  })
}

// ---------------------------------------------------------------------------
// §12.3 / §12.4 grouping
// ---------------------------------------------------------------------------

export type PhoneGroupKind =
  /** Yours to update, at the top (§12.3). */
  | 'actionable'
  /** QC's own actionable group: done and uninspected (§12.3, §12.8). */
  | 'qc_waiting'
  /** qc_passed and qc_failed (§12.4) — visible, on white, never grey. */
  | 'already_inspected'
  /** Everything else, under a label naming who owns it (§12.3). */
  | 'owned'

export interface PhoneGroup {
  kind: PhoneGroupKind
  /** Set on 'actionable' and 'owned' — which stage's team owns these. */
  stage?: Stage
  rows: PhoneRow[]
}

/**
 * §12.3's grouping. Two rules do the work:
 *
 *   - The actionable group goes at the TOP, under a label naming why it
 *     is theirs. A person on two teams would see two actionable groups,
 *     "not a merged list" — this app gives a member exactly one
 *     `teamCode`, so that case cannot arise today; the shape below still
 *     produces one group per stage rather than one merged group, so it
 *     stays true if membership ever widens.
 *   - An inspected row (passed or failed) leaves the actionable group
 *     entirely and sits under "Already inspected" (§12.4). A failed cell
 *     waits on the installer to redo the work, not on QC to re-inspect,
 *     so it must not sit in QC's waiting group — but it stays TAPPABLE
 *     for the team that owns the stage, because redoing it is exactly
 *     what is supposed to happen next.
 *
 * Empty groups are never emitted. §21.6 is explicit that the QC "nothing
 * waiting" case is a sentence "in place of the actionable group, never an
 * empty group", and the same holds for every other group here.
 */
export function groupPhoneRows(rows: PhoneRow[], viewer: PhoneViewer): PhoneGroup[] {
  const inspected = rows.filter(
    (r) => r.displayState === 'qc_passed' || r.displayState === 'qc_failed',
  )
  const rest = rows.filter((r) => !inspected.includes(r))

  const groups: PhoneGroup[] = []

  if (viewer.teamCode === 'qc') {
    const waiting = rest.filter((r) => r.canInspect)
    if (waiting.length > 0) groups.push({ kind: 'qc_waiting', rows: waiting })
  }

  // One actionable group per stage this person owns, top of the page.
  for (const stage of ['installation', 'tnc'] as const) {
    if (viewer.teamCode !== STAGE_TEAM[stage]) continue
    const mine = rest.filter((r) => r.stage === stage)
    if (mine.length > 0) groups.push({ kind: 'actionable', stage, rows: mine })
  }

  const claimed = new Set(groups.flatMap((g) => g.rows))
  for (const stage of ['installation', 'tnc'] as const) {
    const others = rest.filter((r) => r.stage === stage && !claimed.has(r))
    if (others.length > 0) groups.push({ kind: 'owned', stage, rows: others })
  }

  if (inspected.length > 0) groups.push({ kind: 'already_inspected', rows: inspected })

  return groups
}

/**
 * §21.6 "Phone, QC with nothing waiting": the sentence replaces the
 * actionable group. True only for QC — for anyone else there is no
 * waiting group to be empty in the first place.
 */
export function showsQcNothingWaiting(groups: PhoneGroup[], viewer: PhoneViewer): boolean {
  return viewer.teamCode === 'qc' && !groups.some((g) => g.kind === 'qc_waiting')
}
