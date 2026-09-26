/**
 * Brief 106b — coverage proposed by the BOQ import (v7.4 §6.5, §7).
 *
 * "The shop drawing template already names floors per system." It names them
 * implicitly rather than in a column of its own: a line carries a System
 * Type, and its floor columns carry quantities. A system covers a floor when
 * some line of that system has a quantity there.
 *
 * Deriving it here, from the already-parsed rows, rather than in SQL or in
 * the preview's JSX, because it is the one place the file's meaning is turned
 * into a claim about scope — and §7's preview has to show it before anything
 * is written.
 */
import type { ParsedBoqLine } from '@/lib/boq/parse'

export interface ProposedFloor {
  floorLabel: string
  /** Carried because migration 021 allows the SAME floor label under
   *  different towers. Resolving coverage on the bare label would attach a
   *  system to an arbitrary one of them — the same trap the locations block
   *  of commit_boq_import already guards against. */
  towerLabel: string | null
}

export interface ProposedCoverage {
  systemName: string
  floors: ProposedFloor[]
}

/**
 * A quantity of ZERO IS NOT COVERAGE. The shop drawing template routinely
 * carries a full grid of floor columns with zeros where a system does not
 * go, and treating those as coverage would put every system on every floor —
 * exactly the state D096 exists to end.
 */
export function coverageFromParsedLines(lines: ParsedBoqLine[]): ProposedCoverage[] {
  const bySystem = new Map<string, Map<string, ProposedFloor>>()

  for (const line of lines) {
    const system = line.systemType?.trim()
    if (!system) continue

    for (const loc of line.locations) {
      if (loc.quantity <= 0) continue
      const floors = bySystem.get(system) ?? new Map<string, ProposedFloor>()
      // Keyed on tower + floor so the same label under two towers stays two
      // floors, not one.
      floors.set(`${loc.towerLabel ?? ''}::${loc.floorLabel}`, {
        floorLabel: loc.floorLabel,
        towerLabel: loc.towerLabel,
      })
      bySystem.set(system, floors)
    }
  }

  return [...bySystem.entries()]
    .map(([systemName, floors]) => ({ systemName, floors: [...floors.values()] }))
    .sort((a, b) => a.systemName.localeCompare(b.systemName))
}

/**
 * §7's preview table: System · Now · This file · On commit.
 *
 * "On commit" is where the additive rule becomes visible. §6.5: "Import is
 * additive only: it adds floors and creates systems, and never removes a
 * floor from a system. A floor the file no longer names is listed as 'not in
 * this file, kept'."
 */
export interface CoveragePreviewRow {
  systemName: string
  /** Floors this system covers today. Empty for a system the file creates. */
  now: string[]
  /** Floors this file names for it. */
  inFile: string[]
  /** now ∪ inFile — never a subtraction. */
  onCommit: string[]
  /** Covered now, not named by this file, and KEPT. The row that stops a
   *  re-import quietly narrowing a system's scope. */
  keptNotInFile: string[]
  /** Named by the file and not covered today. */
  added: string[]
  isNewSystem: boolean
}

export function coveragePreview(
  proposed: ProposedCoverage[],
  currentBySystem: Map<string, string[]>,
): CoveragePreviewRow[] {
  const names = new Set<string>([...currentBySystem.keys(), ...proposed.map((p) => p.systemName)])

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((systemName) => {
      const now = currentBySystem.get(systemName) ?? []
      const inFile = (proposed.find((p) => p.systemName === systemName)?.floors ?? []).map(
        (f) => f.floorLabel,
      )
      const added = inFile.filter((f) => !now.includes(f))
      const keptNotInFile = now.filter((f) => !inFile.includes(f))

      return {
        systemName,
        now,
        inFile,
        // The union, in a stable order: what is already there, then what
        // this file adds. Never `inFile` alone — that would be a removal.
        onCommit: [...now, ...added],
        keptNotInFile,
        added,
        isNewSystem: !currentBySystem.has(systemName),
      }
    })
}
