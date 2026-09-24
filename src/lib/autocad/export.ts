/**
 * Brief 100 Part A — the AutoCAD Sheet Set export (v7.2 §8, §21.3).
 *
 * Pure: the snapshot, the CSV, the missing-value warnings and the
 * "changed since" comparison are all computed from data passed in, with no
 * I/O, so they can be unit-tested directly — the same split every other
 * lib/ module in this app uses.
 *
 * What this is NOT, per v7.2 §8.1: the LISP routine, writing the DST, or
 * backfilling existing drawing sets. The app writes a CSV; ADTSSMLOAD on
 * the AutoCAD side reads it.
 */

/** The date the CAD standard's master template reached the company share
 *  drive, decided by Seanghakk 24 Sep 2026. A project whose start_date is
 *  before this began under the old way of working, so the export carries
 *  v7.2 §8.6's note rather than pretending otherwise. A project with NO
 *  start_date recorded shows nothing — guessing would be worse than saying
 *  nothing, and the Result doc counts how many projects that affects. */
export const CAD_STANDARD_FROM = '2026-09-22'

export function isPreStandardProject(startDate: string | null): boolean {
  if (!startDate) return false
  return startDate < CAD_STANDARD_FROM
}

// ---------------------------------------------------------------------------
// §8.2 — the two groups. Property names ARE the ADTECH-TB block's attribute
// tags, so these strings are the contract with the LISP routine and must not
// be prettified.
// ---------------------------------------------------------------------------

export const PROJECT_TAGS = [
  'PROJECTNO',
  'PROJECTNAME',
  'SONO',
  'MAINCONTRACTOR',
  'OWNER',
  'CONSULTANT',
] as const

export const DRAWING_TAGS = [
  'DRAWINGNO',
  'TITLE',
  'REV',
  'STATUS',
  'ISSUEDATE',
  'FLOOR',
  'CREATEDBY',
  'CHECKEDBY',
  'APPROVEDBY',
] as const

export type ProjectTag = (typeof PROJECT_TAGS)[number]
export type DrawingTag = (typeof DRAWING_TAGS)[number]

export type ProjectValues = Record<ProjectTag, string>
export type DrawingValues = Record<DrawingTag, string>

export interface ExportProjectInput {
  soNumber: string | null
  name: string
  clientName: string | null
  cadOwnerName: string | null
  cadConsultantName: string | null
}

/** §8.2a — "SO with its hyphen removed". The SO number appears twice under
 *  two different tags on purpose: SONO carries it in full, and PROJECTNO
 *  feeds AutoCAD's built-in Project Number field, which is the same
 *  identifier in the compact form the drawing number itself uses. There is
 *  no separate project-number column in the schema — checked directly. */
export function projectNumberFrom(soNumber: string | null): string {
  return (soNumber ?? '').replace(/-/g, '')
}

export function buildProjectValues(p: ExportProjectInput): ProjectValues {
  return {
    PROJECTNO: projectNumberFrom(p.soNumber),
    PROJECTNAME: p.name,
    SONO: p.soNumber ?? '',
    MAINCONTRACTOR: p.clientName ?? '',
    OWNER: p.cadOwnerName ?? '',
    CONSULTANT: p.cadConsultantName ?? '',
  }
}

export interface ExportDrawingInput {
  drawingNumber: string | null
  /** v7.2 §8.2 sends a TITLE per drawing. shop_drawing_items has no title
   *  column — checked directly — so the title is composed from the two
   *  things the register does carry, in the app's own existing vocabulary
   *  (drawingType* dictionary keys) rather than invented wording. Passed in
   *  already localised so this module stays free of i18n. */
  typeLabel: string
  floorLabel: string | null
  revision: number | null
  statusLabel: string
  issueDate: string | null
  drafterName: string | null
  checkerName: string | null
  approverName: string | null
}

/** §8.2 — "FLOOR | Floor label, or GENERAL for project-level drawings". */
export const GENERAL_FLOOR = 'GENERAL'

export function buildDrawingValues(d: ExportDrawingInput): DrawingValues {
  const floor = d.floorLabel ?? GENERAL_FLOOR
  return {
    DRAWINGNO: d.drawingNumber ?? '',
    TITLE: d.floorLabel ? `${d.typeLabel} — ${d.floorLabel}` : d.typeLabel,
    REV: d.revision === null ? '' : `Rev ${d.revision}`,
    STATUS: d.statusLabel,
    ISSUEDATE: d.issueDate ?? '',
    FLOOR: floor,
    CREATEDBY: d.drafterName ?? '',
    CHECKEDBY: d.checkerName ?? '',
    APPROVEDBY: d.approverName ?? '',
  }
}

// ---------------------------------------------------------------------------
// The CSV itself
// ---------------------------------------------------------------------------

function csvCell(value: string): string {
  // Quote whenever the value could otherwise break a row, and double any
  // embedded quote — RFC 4180, which is what AutoCAD's own reader expects.
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/**
 * Two blocks in one file: the six project values that are the same on every
 * sheet, then one row per drawing. A leading SECTION column keeps the two
 * shapes unambiguous for the routine reading it, since a CSV has no other
 * way to say "these rows mean something different".
 */
export function buildExportCsv(project: ProjectValues, drawings: DrawingValues[]): string {
  const lines: string[] = []

  lines.push(['SECTION', 'TAG', 'VALUE'].join(','))
  for (const tag of PROJECT_TAGS) {
    lines.push(['PROJECT', tag, csvCell(project[tag])].join(','))
  }

  lines.push('')
  lines.push(['SECTION', ...DRAWING_TAGS].join(','))
  for (const d of drawings) {
    lines.push(['DRAWING', ...DRAWING_TAGS.map((t) => csvCell(d[t]))].join(','))
  }

  return lines.join('\r\n')
}

export function exportFileName(soNumber: string | null, now: Date): string {
  const stamp = now.toISOString().slice(0, 10)
  const so = projectNumberFrom(soNumber) || 'project'
  return `${so}-sheetset-${stamp}.csv`
}

// ---------------------------------------------------------------------------
// §8.3 / §21.3 — missing values warn, they never block
// ---------------------------------------------------------------------------

/** Which setup section fixes this, for the "Set it in <section>" link. */
export type FixSection = 'identity' | 'structure' | 'systems' | 'drawings'

export interface MissingValueWarning {
  /** Dictionary key for the headline. */
  key:
    | 'exportMissingOwner'
    | 'exportMissingConsultant'
    | 'exportMissingFloorCodes'
    | 'exportMissingSystemCodes'
    | 'exportMissingDrawingPeople'
  /** Shown before the headline key's words where the warning counts things. */
  count: number | null
  /** The ADTECH-TB tag that will be blank because of this. */
  tag: string
  section: FixSection
}

export interface MissingValueInput {
  ownerSet: boolean
  consultantSet: boolean
  floorsWithoutDrawingCode: number
  systemsWithoutCadCode: number
  drawingsMissingPeople: number
}

export function buildMissingValueWarnings(input: MissingValueInput): MissingValueWarning[] {
  const out: MissingValueWarning[] = []
  if (!input.ownerSet) {
    out.push({ key: 'exportMissingOwner', count: null, tag: 'OWNER', section: 'identity' })
  }
  if (!input.consultantSet) {
    out.push({ key: 'exportMissingConsultant', count: null, tag: 'CONSULTANT', section: 'identity' })
  }
  if (input.floorsWithoutDrawingCode > 0) {
    out.push({
      key: 'exportMissingFloorCodes',
      count: input.floorsWithoutDrawingCode,
      tag: 'DRAWINGNO',
      section: 'structure',
    })
  }
  if (input.systemsWithoutCadCode > 0) {
    out.push({
      key: 'exportMissingSystemCodes',
      count: input.systemsWithoutCadCode,
      tag: 'DRAWINGNO',
      section: 'systems',
    })
  }
  if (input.drawingsMissingPeople > 0) {
    out.push({
      key: 'exportMissingDrawingPeople',
      count: input.drawingsMissingPeople,
      tag: 'CREATEDBY, CHECKEDBY, APPROVEDBY',
      section: 'drawings',
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// §8.4 — "changed since" is a staleness notice, not an age ladder
// ---------------------------------------------------------------------------

/** What is stored in autocad_export_log.snapshot, and compared against on
 *  the next export. Deliberately small: the things §8.4's own worked
 *  example talks about, not the whole CSV. */
export interface ExportSnapshot {
  picName: string | null
  owner: string
  consultant: string
  floorCount: number
  systemCount: number
  drawingCount: number
  /** Highest revision seen across the register, so "revision bumped to
   *  Rev 2" can be said without keeping every drawing's history. */
  maxRevision: number
}

export interface SnapshotChange {
  key:
    | 'exportChangedPic'
    | 'exportChangedOwner'
    | 'exportChangedConsultant'
    | 'exportChangedFloorsAdded'
    | 'exportChangedFloorsRemoved'
    | 'exportChangedSystemsAdded'
    | 'exportChangedDrawingsRegistered'
    | 'exportChangedRevisionBumped'
  from?: string
  to?: string
  count?: number
}

export function diffSnapshots(previous: ExportSnapshot, current: ExportSnapshot): SnapshotChange[] {
  const out: SnapshotChange[] = []

  if ((previous.picName ?? '') !== (current.picName ?? '')) {
    out.push({
      key: 'exportChangedPic',
      from: previous.picName ?? '—',
      to: current.picName ?? '—',
    })
  }
  if (previous.owner !== current.owner) {
    out.push({ key: 'exportChangedOwner', from: previous.owner || '—', to: current.owner || '—' })
  }
  if (previous.consultant !== current.consultant) {
    out.push({
      key: 'exportChangedConsultant',
      from: previous.consultant || '—',
      to: current.consultant || '—',
    })
  }

  const floorDelta = current.floorCount - previous.floorCount
  if (floorDelta > 0) out.push({ key: 'exportChangedFloorsAdded', count: floorDelta })
  if (floorDelta < 0) out.push({ key: 'exportChangedFloorsRemoved', count: -floorDelta })

  const systemDelta = current.systemCount - previous.systemCount
  if (systemDelta > 0) out.push({ key: 'exportChangedSystemsAdded', count: systemDelta })

  const drawingDelta = current.drawingCount - previous.drawingCount
  if (drawingDelta > 0) out.push({ key: 'exportChangedDrawingsRegistered', count: drawingDelta })

  if (current.maxRevision > previous.maxRevision) {
    out.push({ key: 'exportChangedRevisionBumped', count: current.maxRevision })
  }

  return out
}
