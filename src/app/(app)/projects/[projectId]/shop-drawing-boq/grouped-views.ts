/**
 * Brief 049 — grouping logic for the Shop Drawing BOQ list, in addition to
 * (not replacing) the existing flat list. Pure functions, no I/O, same
 * split as import/parse-sheet.ts and for the same reason: directly
 * unit-testable without a database or session.
 *
 * SCOPE: Shop Drawing BOQ only. Contract BOQ has NO system_type column at
 * all (confirmed against every migration — its closest field is an
 * optional free-text section_label, a different concept per Brief 046's
 * own comment: "preserve however the source document grouped things," not
 * a fixed system list) and NO per-floor breakdown data (Brief 048's own
 * standing decision). Brief 049's own text assumed Contract BOQ could
 * offer a working "group by system" view; confirmed with Seanghakk rather
 * than guessed — decision: Contract BOQ gets no grouping views this
 * round, its flat list is unchanged. This module and the view switcher
 * built on it apply to Shop Drawing BOQ's list page only.
 *
 * "By tower" and "by floor" are built from shop_drawing_boq_line_locations
 * (the real per-floor breakdown), NOT from lines' own total_quantity — a
 * line's total_quantity is independent of how much of it (if any) is
 * broken down by floor, per migration 018's own shape (location rows are
 * optional child data). A line with total_quantity but ZERO location rows
 * contributes NOTHING to any floor/tower bucket if silently skipped — so
 * it is not skipped: it is counted into an explicit "no floor breakdown
 * recorded" bucket instead (see NoBreakdownGroup below), matching this
 * app's standing "empty is a valid state, never silently dropped"
 * convention (Tender BOQ's own unmapped-location precedent, migration
 * 018's header) rather than letting a by-floor total quietly undercount
 * against the by-system total with no explanation.
 */
import { buildFloorColumns, type FloorData, type TowerData } from './floor-columns'

export type ShopDrawingBoqView = 'flat' | 'system' | 'tower' | 'floor'

export interface ShopDrawingBoqLineForGrouping {
  id: string
  systemType: string
  totalQuantity: number
}

export interface ShopDrawingBoqLocationForGrouping {
  shopDrawingBoqLineId: string
  floorId: string
  quantity: number
}

export interface SystemGroup {
  systemType: string
  lineCount: number
  totalQuantity: number
}

export interface FloorGroup {
  floorId: string
  /** The header format from floor-columns.ts ("Tower 1 - B2" or "Podium") —
   *  reused here rather than re-deriving a second display format. */
  header: string
  towerId: string | null
  entryCount: number
  totalQuantity: number
}

export interface TowerGroup {
  /** null = the "no tower" bucket (a plain floor list, or the floors that
   *  belong to none — same as /floors' own "No tower" section). */
  towerId: string | null
  towerLabel: string
  entryCount: number
  totalQuantity: number
}

export interface NoBreakdownGroup {
  lineCount: number
  totalQuantity: number
}

/** Sorted alphabetically — system_type is free text with no fixed
 *  enumeration anywhere in this schema (migration 018's own comment:
 *  "plain text, unconstrained — NOT a new lookup table"), so there is no
 *  canonical order to sort by instead. */
export function groupBySystem(lines: ShopDrawingBoqLineForGrouping[]): SystemGroup[] {
  const bySystem = new Map<string, SystemGroup>()
  for (const line of lines) {
    const existing = bySystem.get(line.systemType)
    if (existing) {
      existing.lineCount += 1
      existing.totalQuantity += line.totalQuantity
    } else {
      bySystem.set(line.systemType, { systemType: line.systemType, lineCount: 1, totalQuantity: line.totalQuantity })
    }
  }
  return [...bySystem.values()].sort((a, b) => a.systemType.localeCompare(b.systemType))
}

export interface FloorAndTowerGroups {
  /** Ordered per floor-columns.ts's own convention: no-tower floors first
   *  (by sort_order), then each tower in sort_order, its own floors in
   *  sort_order. Floors with zero contributing location rows are omitted
   *  — an empty group is noise, not a finding, on a per-floor breakdown. */
  floorGroups: FloorGroup[]
  /** "No tower" first (if it has any contribution), then towers in
   *  sort_order. Same omit-if-empty rule as floorGroups. */
  towerGroups: TowerGroup[]
  noBreakdown: NoBreakdownGroup
}

export function groupByFloorAndTower(
  lines: ShopDrawingBoqLineForGrouping[],
  locations: ShopDrawingBoqLocationForGrouping[],
  towers: TowerData[],
  floors: FloorData[],
): FloorAndTowerGroups {
  const floorColumns = buildFloorColumns(towers, floors)
  const towerLabelById = new Map(towers.map((tw) => [tw.id, tw.label]))
  const towerIdByFloorId = new Map(floors.map((f) => [f.id, f.towerId]))

  const floorTotals = new Map<string, { entryCount: number; totalQuantity: number }>()
  for (const loc of locations) {
    const existing = floorTotals.get(loc.floorId)
    if (existing) {
      existing.entryCount += 1
      existing.totalQuantity += loc.quantity
    } else {
      floorTotals.set(loc.floorId, { entryCount: 1, totalQuantity: loc.quantity })
    }
  }

  const floorGroups: FloorGroup[] = floorColumns
    .filter((col) => floorTotals.has(col.floorId))
    .map((col) => {
      const totals = floorTotals.get(col.floorId)!
      return {
        floorId: col.floorId,
        header: col.header,
        towerId: towerIdByFloorId.get(col.floorId) ?? null,
        entryCount: totals.entryCount,
        totalQuantity: totals.totalQuantity,
      }
    })

  const towerTotals = new Map<string | null, { entryCount: number; totalQuantity: number }>()
  for (const fg of floorGroups) {
    const existing = towerTotals.get(fg.towerId)
    if (existing) {
      existing.entryCount += fg.entryCount
      existing.totalQuantity += fg.totalQuantity
    } else {
      towerTotals.set(fg.towerId, { entryCount: fg.entryCount, totalQuantity: fg.totalQuantity })
    }
  }

  const towerGroups: TowerGroup[] = []
  if (towerTotals.has(null)) {
    const totals = towerTotals.get(null)!
    towerGroups.push({ towerId: null, towerLabel: 'No tower', ...totals })
  }
  for (const tower of [...towers].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const totals = towerTotals.get(tower.id)
    if (totals) {
      towerGroups.push({ towerId: tower.id, towerLabel: towerLabelById.get(tower.id) ?? tower.label, ...totals })
    }
  }

  const lineIdsWithLocations = new Set(locations.map((l) => l.shopDrawingBoqLineId))
  const linesWithNoBreakdown = lines.filter((line) => !lineIdsWithLocations.has(line.id))
  const noBreakdown: NoBreakdownGroup = {
    lineCount: linesWithNoBreakdown.length,
    totalQuantity: linesWithNoBreakdown.reduce((sum, l) => sum + l.totalQuantity, 0),
  }

  return { floorGroups, towerGroups, noBreakdown }
}
