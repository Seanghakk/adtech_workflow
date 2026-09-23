/**
 * Brief 098 §3.4, §3.6 — what the preview shows: the four groups a commit
 * will act on, and the floors and systems the file is proposing. Pure, like
 * parse.ts: existing lines/floors/systems are passed in, nothing is read
 * here.
 *
 * v7.2 §7.4's four figures, exactly: new / changed / unchanged / in the app
 * but not in the file. The fourth group is reported and NEVER acted on —
 * "Lines missing from the file are listed and never deleted silently."
 */
import type { BoqTierConfig } from './tiers'
import { splitFloorColumnHeader, type ParsedBoqLine } from './parse'

export interface ExistingBoqLine {
  id: string
  itemNumber: string | null
  sectionLabel: string | null
  systemType: string | null
  description: string
  brand: string | null
  unit: string
  quantity: number
}

export interface BoqFieldChange {
  field: string
  was: string
  now: string
}

export interface BoqChangedLine {
  line: ParsedBoqLine
  existingId: string
  changes: BoqFieldChange[]
}

export interface BoqDiff {
  newLines: ParsedBoqLine[]
  changedLines: BoqChangedLine[]
  unchangedLines: ParsedBoqLine[]
  /** In the app, not in the file. Listed only — never deleted (v7.2 §7.4). */
  missingLines: ExistingBoqLine[]
}

const shown = (v: string | number | null): string => {
  if (v === null || v === '') return '—'
  return String(v)
}

export function diffBoqLines(
  parsed: ParsedBoqLine[],
  existing: ExistingBoqLine[],
  config: BoqTierConfig,
): BoqDiff {
  // Keyed on item number — the stable key (Brief 098 §3.5). Existing lines
  // with no item number cannot be matched by it at all; they fall into
  // `missingLines` and are reported, never touched. See the Result doc's
  // own recommendation for those rows.
  const existingByItem = new Map<string, ExistingBoqLine>()
  for (const e of existing) {
    if (e.itemNumber) existingByItem.set(e.itemNumber, e)
  }

  const newLines: ParsedBoqLine[] = []
  const changedLines: BoqChangedLine[] = []
  const unchangedLines: ParsedBoqLine[] = []
  const matchedIds = new Set<string>()

  for (const line of parsed) {
    const match = existingByItem.get(line.itemNumber)
    if (!match) {
      newLines.push(line)
      continue
    }
    matchedIds.add(match.id)

    const changes: BoqFieldChange[] = []
    if (match.description !== line.description) {
      changes.push({ field: 'Description', was: shown(match.description), now: shown(line.description) })
    }
    if (Number(match.quantity) !== line.quantity) {
      changes.push({ field: 'Total Quantity', was: shown(match.quantity), now: shown(line.quantity) })
    }
    if (match.unit !== line.unit) {
      changes.push({ field: 'Unit', was: shown(match.unit), now: shown(line.unit) })
    }
    if ((match.brand ?? null) !== (line.brand ?? null)) {
      changes.push({ field: 'Brand', was: shown(match.brand), now: shown(line.brand) })
    }
    if (config.hasSystemType && (match.systemType ?? null) !== (line.systemType ?? null)) {
      changes.push({ field: 'System Type', was: shown(match.systemType), now: shown(line.systemType) })
    }
    if (config.hasSectionLabel && (match.sectionLabel ?? null) !== (line.sectionLabel ?? null)) {
      changes.push({ field: 'Section', was: shown(match.sectionLabel), now: shown(line.sectionLabel) })
    }

    if (changes.length === 0) {
      unchangedLines.push(line)
    } else {
      changedLines.push({ line, existingId: match.id, changes })
    }
  }

  const missingLines = existing.filter((e) => !matchedIds.has(e.id))

  return { newLines, changedLines, unchangedLines, missingLines }
}

// ---------------------------------------------------------------------------
// §3.6 Proposals
// ---------------------------------------------------------------------------

export interface ProposedFloor {
  label: string
  towerLabel: string | null
  /** Proposed, and editable before commit (v7.2 §7.6). */
  drawingCode: string
  sortOrder: number
}

export interface ProposedSystem {
  name: string
  /** Guessed from the name only where it matches a lookup row; left blank
   *  rather than guessed wrongly (Brief 098 §3.6). */
  cadCode: string | null
}

export interface CadSystemOption {
  code: string
  labelEn: string
}

/** project_floors.drawing_code allows `^[A-Za-z0-9]+$` only (migration
 *  030) — a floor LABEL may contain spaces and punctuation, a code never
 *  does (v7.2 §6.2 item 2). This strips the label down to something the
 *  constraint accepts; an empty result means we have nothing sensible to
 *  propose, and the field is left blank for the user rather than filled
 *  with a guess that would be refused at write time. */
export function proposeDrawingCode(floorLabel: string): string {
  return floorLabel.replace(/[^A-Za-z0-9]/g, '')
}

export function buildProposedFloors(
  fileFloorHeaders: string[],
  knownHeaders: Set<string>,
  existingFloorCount: number,
): ProposedFloor[] {
  const unknown = fileFloorHeaders.filter((h) => !knownHeaders.has(h))
  return unknown.map((header, i) => {
    const { floorLabel: label, towerLabel } = splitFloorColumnHeader(header)
    return {
      label,
      towerLabel,
      drawingCode: proposeDrawingCode(label),
      // Seeded in tens so a floor can be inserted later without
      // renumbering (v7.2 §6.2 item 2), continuing past whatever the
      // project already has. Editable before commit, because the file's
      // column order is not necessarily the building order (§7.6).
      sortOrder: (existingFloorCount + i + 1) * 10,
    }
  })
}

export function buildProposedSystems(
  parsedSystemNames: string[],
  existingSystemNames: Set<string>,
  cadSystems: CadSystemOption[],
): ProposedSystem[] {
  const byLabel = new Map<string, string>()
  const byCode = new Map<string, string>()
  for (const s of cadSystems) {
    byLabel.set(s.labelEn.trim().toLowerCase(), s.code)
    byCode.set(s.code.trim().toLowerCase(), s.code)
  }

  const seen = new Set<string>()
  const proposals: ProposedSystem[] = []
  for (const raw of parsedSystemNames) {
    const name = raw.trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (existingSystemNames.has(name)) continue

    proposals.push({
      name,
      cadCode: byLabel.get(key) ?? byCode.get(key) ?? null,
    })
  }
  return proposals
}
