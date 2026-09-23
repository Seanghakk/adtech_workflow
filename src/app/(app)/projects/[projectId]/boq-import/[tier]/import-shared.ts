/**
 * Brief 098 — shared between actions.ts ('use server' — can only export
 * async functions) and the client flow component. Same split as every other
 * *-shared.ts file in this app.
 *
 * The preview is held in the CLIENT between step 2 and step 3 and posted
 * back on commit, rather than stashed server-side: nothing is written until
 * Commit (v7.2 §7.1), so there is no half-import to keep anywhere, and the
 * uploaded file never has to be stored. The commit function re-checks the
 * one thing that must never slip through regardless of what comes back —
 * an item number on every line (migration 037 raises if one is missing).
 */
import type { ParsedBoqLine, BoqRowError } from '@/lib/boq/parse'
import type { BoqChangedLine, ExistingBoqLine, ProposedFloor, ProposedSystem, CadSystemOption } from '@/lib/boq/diff'

/** What the user decided about one proposed floor (v7.2 §7.6). */
export type FloorProposalChoice = 'create' | 'map' | 'skip'

export interface FloorProposalDecision {
  label: string
  towerLabel: string | null
  drawingCode: string
  sortOrder: number
  choice: FloorProposalChoice
  /** Set only when choice === 'map' — the existing floor this file column
   *  actually means. */
  mapToFloorId: string | null
}

export interface BoqPreview {
  fileName: string
  /** Rows that parsed cleanly and may be committed. */
  lines: ParsedBoqLine[]
  rowErrors: BoqRowError[]
  newLines: ParsedBoqLine[]
  changedLines: BoqChangedLine[]
  unchangedCount: number
  missingLines: ExistingBoqLine[]
  proposedFloors: ProposedFloor[]
  proposedSystems: ProposedSystem[]
  cadSystems: CadSystemOption[]
  /** The project's existing floors, for "Map to existing". */
  existingFloors: { id: string; label: string }[]
}

export interface BoqImportState {
  /** A file-level refusal — v7.2 §7.3. Whole file, before any row is read. */
  notTemplate: { fileName: string; expectedHeaders: string[]; foundHeaders: string[] } | null
  /** Any other top-level problem, including the §21.2 "preview failed" case. */
  error: string | null
  preview: BoqPreview | null
  /** Set once a commit has actually happened — v7.2 §7.7's blue result. */
  result: {
    linesWritten: number
    linesInserted: number
    linesUpdated: number
    floorsCreated: number
    floorsMapped: number
    systemsAdded: number
    rowsLeftOut: number
    appLinesKept: number
    byName: string
    at: string
  } | null
}

export const boqImportInitialState: BoqImportState = {
  notTemplate: null,
  error: null,
  preview: null,
  result: null,
}
