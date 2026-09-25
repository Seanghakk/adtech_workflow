/**
 * Brief 105 — material approval's derivations (v7.4 §23).
 *
 * Pure, and deliberately THIN. §23.2 says the lifecycle IS §9's with three
 * differences, so this module does not restate §9 — it maps a package onto
 * the shop drawing shape and calls the SAME computeClocks() the drawing
 * drawer uses. The two clocks are the part of this screen most likely to be
 * quoted in a delay dispute; having one implementation of them is the whole
 * point of §23.2, and Brief 105 §4 says so outright ("if the clock helper is
 * not currently exported, export it rather than writing a second"). It was
 * already exported, so nothing had to change in §9's module.
 *
 * The three differences §23.2 names, and where each lives here:
 *   · no internal check      → three stages, not four (Stage below)
 *   · a product per revision → product lives on RevisionRecord, and
 *                              productChanged() is what the drawer and the
 *                              history read for "product changed"
 *   · approved on paper      → source 'paper', which forces possession and
 *                              suppresses both clocks permanently
 */
import { computeClocks, type SubmissionRecord as DrawingSubmission } from '@/lib/shopDrawing/lifecycle'

export type ReturnCode = 'A' | 'B' | 'C'
export type Party = 'client' | 'consultant' | 'main_contractor' | 'other'
export type PackageSource = 'tracked' | 'paper'

/** §23.6's strip has THREE cells. There is no manager's stamp before a
 *  submittal is sent, so §9's "internal check" cell does not exist here —
 *  not as a state, not as a count, not as copy. */
export type Stage = 'not_started' | 'preparing' | 'submitted' | 'approved'

/** §23.5's chip. 'paper' is its own possession because the dashed
 *  "Approved on paper" chip is not the same statement as a tracked approval. */
export type Possession = 'none' | 'adtech' | 'reviewer' | 'approved' | 'paper'

export interface RevisionRecord {
  id: string
  rev: number
  manufacturer: string | null
  product: string | null
  model: string | null
  startedAt: string | null
}

export interface SubmissionRecord {
  id: string
  revisionId: string
  rev: number
  party: Party
  org: string | null
  /** NULL for a paper approval — §5.3: no send date is asked for, and none
   *  is guessed. */
  sentOn: string | null
  returnedOn: string | null
  code: ReturnCode | null
  comments: string | null
}

export interface PackageInput {
  source: PackageSource
  preparingStartedAt: string | null
  revisions: RevisionRecord[]
  submissions: SubmissionRecord[]
  now: Date
}

export interface PackageState {
  stage: Stage
  possession: Possession
  currentRev: number
  currentRevision: RevisionRecord | null
  previousRevision: RevisionRecord | null
  openSubmission: SubmissionRecord | null
  lastReturned: SubmissionRecord | null
  /** §23.2 — true when this revision names a different product from the one
   *  before it. A rejected material is often replaced, not revised. */
  productChanged: boolean
  clocks: {
    withAdtechDays: number | null
    withReviewerDays: number | null
    showProportionBar: boolean
  }
}

const byRev = (a: { rev: number }, b: { rev: number }) => a.rev - b.rev

export function derivePackage(input: PackageInput): PackageState {
  const revisions = [...input.revisions].sort(byRev)
  const submissions = [...input.submissions].sort(byRev)

  const openSubmission = submissions.find((s) => s.returnedOn === null) ?? null
  const returned = submissions.filter((s) => s.returnedOn !== null)
  const lastReturned = returned.length > 0 ? returned[returned.length - 1] : null
  const approved = lastReturned !== null && (lastReturned.code === 'A' || lastReturned.code === 'B')

  const currentRev = revisions.length > 0 ? revisions[revisions.length - 1].rev : 0
  const currentRevision = revisions[revisions.length - 1] ?? null
  const previousRevision = revisions.length > 1 ? revisions[revisions.length - 2] : null

  // §5.3 — a paper approval is a finished record on arrival. It is never
  // preparing, never submitted, and never offered a C.
  if (input.source === 'paper') {
    return {
      stage: 'approved',
      possession: 'paper',
      currentRev,
      currentRevision,
      previousRevision,
      openSubmission: null,
      lastReturned,
      productChanged: false,
      // Permanently not recorded. Not "unknown yet" — the design is explicit
      // that this reading is final, so no proxy is ever substituted.
      clocks: { withAdtechDays: null, withReviewerDays: null, showProportionBar: false },
    }
  }

  let stage: Stage
  if (openSubmission) stage = 'submitted'
  else if (approved) stage = 'approved'
  else if (currentRevision?.startedAt) stage = 'preparing'
  else stage = 'not_started'

  const possession: Possession =
    stage === 'submitted' ? 'reviewer'
    : stage === 'approved' ? 'approved'
    : stage === 'preparing' ? 'adtech'
    : 'none'

  return {
    stage,
    possession,
    currentRev,
    currentRevision,
    previousRevision,
    openSubmission,
    lastReturned,
    productChanged: productChanged(previousRevision, currentRevision),
    clocks: clocksFor(input, submissions),
  }
}

/**
 * §23.2's "product changed". Compared on the three fields that name a
 * product, because a revision that only fixes a model number is still a
 * different product to a reviewer being asked to approve it.
 */
export function productChanged(
  previous: RevisionRecord | null,
  current: RevisionRecord | null,
): boolean {
  if (!previous || !current) return false
  return (
    previous.manufacturer !== current.manufacturer ||
    previous.product !== current.product ||
    previous.model !== current.model
  )
}

/**
 * sent_on and returned_on are DATE columns, so they parse as UTC midnight.
 * `now` is a real instant. Comparing the two directly loses the ICT offset
 * and an open submission reads a day short for seven hours out of every
 * twenty-four — the sort of quiet off-by-one that is only ever noticed in a
 * delay dispute, which §9.4 says is the one thing these clocks must not do.
 *
 * So `now` is normalised to ICT-midnight-as-UTC before it meets a date,
 * putting both sides on the same footing. Same rule as daysSinceICT, which
 * this deliberately mirrors rather than re-deriving.
 */
export function ictMidnight(d: Date): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Phnom_Penh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')))
}

/**
 * §9.4's clocks, unchanged, via §9's own helper.
 *
 * The mapping is the whole of this function: a material approval submission
 * is a drawing submission with sent_on for submittedAt. Where sent_on is
 * NULL (a paper approval) the submission is dropped rather than given a
 * substituted date — the caller above never reaches here for a paper
 * package, and this guard means a stray row cannot invent a duration either.
 */
function clocksFor(input: PackageInput, submissions: SubmissionRecord[]) {
  const asDrawing: DrawingSubmission[] = submissions
    .filter((s) => s.sentOn !== null)
    .map((s) => ({
      id: s.id,
      revision: s.rev,
      reviewerParty: s.party,
      reviewerOrg: s.org,
      submittedAt: s.sentOn as string,
      returnedAt: s.returnedOn,
      code: s.code,
      comments: s.comments,
    }))

  return computeClocks(
    {
      // Only draftingStartedAt, submissions and now are read by computeClocks;
      // the rest of §9's input shape is not consulted by it. Passing honest
      // placeholders rather than lying about a status this feature does not
      // have (§23.2: "No status dropdown … state is derived from recordings").
      status: 'in_progress',
      preSubmissionStage: null,
      draftingStartedAt: input.preparingStartedAt,
      legacyDoneNoHistory: false,
      submissions: asDrawing,
      checks: [],
      now: ictMidnight(input.now),
    },
    asDrawing,
  )
}

/**
 * §23.5's summary — the five cells, derived once so the register and the SO
 * record tile cannot disagree about what "approved" counts.
 */
export interface RegisterSummary {
  withAdtech: number
  withReviewer: number
  approved: number
  approvedFromPaper: number
  notStarted: number
  linesInAPackage: number
  contractLines: number
  linesNotInAnyPackage: number
}

export function summarise(
  packages: { state: PackageState; lineCount: number }[],
  contractLines: number,
): RegisterSummary {
  const linesInAPackage = packages.reduce((n, p) => n + p.lineCount, 0)
  return {
    withAdtech: packages.filter((p) => p.state.possession === 'adtech').length,
    withReviewer: packages.filter((p) => p.state.possession === 'reviewer').length,
    // A paper approval IS approved — §23.5's own detail line says so
    // ("n recorded from paper"), it is a breakdown of this figure, not a
    // separate one.
    approved: packages.filter(
      (p) => p.state.possession === 'approved' || p.state.possession === 'paper',
    ).length,
    approvedFromPaper: packages.filter((p) => p.state.possession === 'paper').length,
    notStarted: packages.filter((p) => p.state.possession === 'none').length,
    linesInAPackage,
    contractLines,
    linesNotInAnyPackage: Math.max(0, contractLines - linesInAPackage),
  }
}

/**
 * §23.5's sort: open packages by the holder's age, oldest first, then
 * approved and not-started in reference order.
 */
export function registerSort(
  rows: { ref: string; state: PackageState }[],
  ageOf: (state: PackageState) => number,
): { ref: string; state: PackageState }[] {
  const isOpen = (s: PackageState) => s.possession === 'adtech' || s.possession === 'reviewer'
  return [...rows].sort((a, b) => {
    const aOpen = isOpen(a.state)
    const bOpen = isOpen(b.state)
    if (aOpen !== bOpen) return aOpen ? -1 : 1
    if (aOpen && bOpen) return ageOf(b.state) - ageOf(a.state)
    return a.ref.localeCompare(b.ref)
  })
}
