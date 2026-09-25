/**
 * Brief 100 Part B — the shop drawing approval lifecycle (v7.2 §9).
 *
 * Pure: every state the drawer shows is derived here from rows passed in,
 * so the two clocks in §9.4 — the part of this screen most likely to be
 * quoted in a delay dispute — can be tested directly.
 *
 * The backend already enforces all of this (migrations 027–028): the check
 * RPC stamps its own name and time, a submission can be returned exactly
 * once, and A/B returns set the status to done. Nothing here is a
 * permission check; this only decides what to SHOW.
 */
import { daysSinceICT } from '@/lib/format/datetime'

export type DrawingStatus = 'not_started' | 'in_progress' | 'done'
export type PreSubmissionStage = 'drafting' | 'internal_check' | null
export type ReturnCode = 'A' | 'B' | 'C'
export type ReviewerParty = 'client' | 'consultant' | 'main_contractor' | 'other'

export interface SubmissionRecord {
  id: string
  revision: number
  reviewerParty: string
  reviewerOrg: string | null
  submittedAt: string
  returnedAt: string | null
  code: ReturnCode | null
  comments: string | null
}

export interface CheckRecord {
  revision: number
  checkedBy: string
  checkedAt: string
}

export interface LifecycleInput {
  status: DrawingStatus
  preSubmissionStage: PreSubmissionStage
  draftingStartedAt: string | null
  /** True where the drawing was marked done without ever passing through
   *  the lifecycle — migration 028's own column. §9.2's dashed chip. */
  legacyDoneNoHistory: boolean
  submissions: SubmissionRecord[]
  checks: CheckRecord[]
  now: Date
}

/** The four cells of §9.3's stage strip, plus the two states that sit
 *  outside it. `checked` is not its own cell — it is "internal check,
 *  done" — but the drawer needs to tell it apart to know whether to show
 *  the Submit form (§21.4 "Checked"). */
export type Stage = 'not_started' | 'drafting' | 'internal_check' | 'checked' | 'submitted' | 'approved'

/** §9.2 — amber is possession, not blame. */
export type Possession = 'none' | 'adtech' | 'reviewer' | 'approved' | 'marked_done_by_hand'

export interface Lifecycle {
  currentRevision: number
  stage: Stage
  possession: Possession
  /** The submission awaiting a return, if any. */
  openSubmission: SubmissionRecord | null
  /** The last return, whatever its code. */
  lastReturned: SubmissionRecord | null
  /** Whether the CURRENT revision has been checked — what decides between
   *  the Submit form and §9.5's "Submitting comes after the check". */
  currentRevisionChecked: boolean
  currentCheck: CheckRecord | null
  /** §9.4 — both sides, in whole days, summed across ALL revisions. */
  clocks: Clocks
}

export interface Clocks {
  /** null means "start not recorded" — permanent, never a substituted
   *  proxy. See §9.4: a guessed start invents a with-us figure that would
   *  then be used as evidence in a delay dispute. */
  withAdtechDays: number | null
  /** null means never sent. */
  withReviewerDays: number | null
  /** §9.4 — omitted entirely when the start is not recorded, because a
   *  proportion needs both halves to mean anything. */
  showProportionBar: boolean
}

/**
 * Whole ICT CALENDAR days, not 24-hour buckets.
 *
 * Brief 105 fixed this. It used to be Math.floor((to - from) / 86_400_000),
 * which counts elapsed 24-hour periods — so a drawing sent at 18:00 ICT and
 * read at 09:00 the next morning reported 0 days, where every other age
 * figure in this app reported 1. daysSinceICT is what the matrix, the age
 * ladder and the cross-project lists all use (25 files), so the drawer's
 * clocks were the only figures in the app counting differently, and they
 * read SHORT — by up to a full day, for part of every day.
 *
 * That matters more here than almost anywhere else: §9.4 is explicit that
 * these two numbers are the ones quoted in a delay dispute, and a with-the-
 * reviewer figure that under-reports is exactly the wrong way to be wrong.
 *
 * Counting calendar days also makes the material approval caller correct
 * for free: its sent_on/returned_on are DATE columns that parse as UTC
 * midnight, and an ICT calendar date derived from them is the date written
 * on the form. One rule, both callers, no shim at either call site.
 */
function days(fromIso: string, toIso: string | Date): number {
  return Math.max(0, daysSinceICT(fromIso, toIso))
}

const byRevision = (a: SubmissionRecord, b: SubmissionRecord) => a.revision - b.revision

export function deriveLifecycle(input: LifecycleInput): Lifecycle {
  const submissions = [...input.submissions].sort(byRevision)
  const openSubmission = submissions.find((s) => s.returnedAt === null) ?? null
  const returned = submissions.filter((s) => s.returnedAt !== null)
  const lastReturned = returned.length > 0 ? returned[returned.length - 1] : null

  const approvedByLastReturn =
    lastReturned !== null && (lastReturned.code === 'A' || lastReturned.code === 'B')

  // The same derivation workflow.record_shop_drawing_check() uses: one past
  // the highest submission, or the open submission's own revision while one
  // is in flight. The exception is an approved drawing: an A or B return
  // FINISHES it, so the revision on show is the one that was approved — not
  // a next revision that will never exist.
  const currentRevision = openSubmission
    ? openSubmission.revision
    : approvedByLastReturn
      ? lastReturned.revision
      : submissions.length > 0
        ? Math.max(...submissions.map((s) => s.revision)) + 1
        : 0

  const currentCheck = input.checks.find((c) => c.revision === currentRevision) ?? null
  const currentRevisionChecked = currentCheck !== null

  const approved = approvedByLastReturn

  let stage: Stage
  if (openSubmission) {
    stage = 'submitted'
  } else if (approved) {
    stage = 'approved'
  } else if (input.status === 'not_started') {
    stage = 'not_started'
  } else if (currentRevisionChecked) {
    stage = 'checked'
  } else if (input.preSubmissionStage === 'internal_check') {
    stage = 'internal_check'
  } else {
    // in_progress with no stage recorded still reads as drafting: the
    // drawing has left "not started", which is what drafting means.
    stage = 'drafting'
  }

  let possession: Possession
  if (input.legacyDoneNoHistory || (input.status === 'done' && !approved)) {
    // §9.2 / §9.5 — marked done by hand, or done before tracking existed.
    possession = 'marked_done_by_hand'
  } else if (stage === 'submitted') {
    possession = 'reviewer'
  } else if (stage === 'approved') {
    possession = 'approved'
  } else if (stage === 'not_started') {
    possession = 'none'
  } else {
    possession = 'adtech'
  }

  return {
    currentRevision,
    stage,
    possession,
    openSubmission,
    lastReturned,
    currentRevisionChecked,
    currentCheck,
    clocks: computeClocks(input, submissions),
  }
}

/**
 * §9.4, stated exactly as the design does:
 *
 *   With the reviewer = the sum of (returned − sent) over every
 *   submission; the open one counts to today.
 *
 *   With ADTECH = the sum of the gaps we held it, running from
 *   drafting_started_at for Rev 0 and from the previous return date for
 *   every later revision.
 *
 * The with-us total is null — "start not recorded" — whenever
 * drafting_started_at is missing, and nothing is substituted for it.
 */
export function computeClocks(input: LifecycleInput, sortedSubmissions: SubmissionRecord[]): Clocks {
  const withReviewerDays =
    sortedSubmissions.length === 0
      ? null
      : sortedSubmissions.reduce(
          (total, s) => total + days(s.submittedAt, s.returnedAt ?? input.now),
          0,
        )

  if (!input.draftingStartedAt) {
    return { withAdtechDays: null, withReviewerDays, showProportionBar: false }
  }

  let withAdtechDays = 0
  let heldFrom: string = input.draftingStartedAt

  for (const s of sortedSubmissions) {
    // The stretch from when we picked this revision up to when we sent it.
    withAdtechDays += days(heldFrom, s.submittedAt)
    if (s.returnedAt === null) {
      // It is with the reviewer right now; we are not holding it.
      heldFrom = ''
      break
    }
    // It came back: we hold it again from the return date.
    heldFrom = s.returnedAt
  }

  // Still in our hands — either never sent, or returned and not yet
  // resubmitted. A drawing that has been approved is finished, so the
  // clock stops at its return rather than running forever.
  const lastReturn = sortedSubmissions.filter((s) => s.returnedAt).pop()
  const finished =
    lastReturn !== undefined && (lastReturn.code === 'A' || lastReturn.code === 'B')
  if (heldFrom && !finished) {
    withAdtechDays += days(heldFrom, input.now)
  }

  return {
    withAdtechDays,
    withReviewerDays,
    showProportionBar: true,
  }
}

/**
 * §9.3's origin line — "third revision · started 18 Sep after a C return".
 * Returned as parts so the screen can localise the ordinal and the date
 * without this module importing i18n.
 */
export interface OriginLine {
  revision: number
  /** When the current revision started with us: drafting_started_at for
   *  Rev 0, the previous C return for later ones. Null where the start is
   *  not recorded. */
  startedAt: string | null
  /** True for every revision after the first — they exist because a
   *  revision came back with code C. */
  afterCReturn: boolean
}

export function originLine(input: LifecycleInput, lifecycle: Lifecycle): OriginLine {
  if (lifecycle.currentRevision === 0) {
    return { revision: 0, startedAt: input.draftingStartedAt, afterCReturn: false }
  }
  const previous = [...input.submissions]
    .sort(byRevision)
    .filter((s) => s.revision === lifecycle.currentRevision - 1)[0]
  return {
    revision: lifecycle.currentRevision,
    startedAt: previous?.returnedAt ?? null,
    afterCReturn: previous?.code === 'C',
  }
}
