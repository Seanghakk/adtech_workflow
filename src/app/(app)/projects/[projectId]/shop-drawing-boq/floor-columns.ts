/**
 * Brief 055 — shared floor/zone column-header generation for Shop Drawing
 * BOQ's per-project template shape. One source of truth, imported by both
 * the template-download button (so what a user downloads always matches
 * what the importer will accept) and the import action (to build the
 * canonical header -> floor_id map used to validate and resolve an
 * uploaded file's floor/zone columns) — never duplicated inline at either
 * site.
 *
 * Header format: "<Tower label> - <Floor label>" for a floor under a
 * tower, or the bare floor label for a no-tower floor (e.g. "Podium") —
 * matches the brief's own worked examples exactly. The full combined
 * label is used (not the bare floor label alone) because migration 021
 * deliberately allows the SAME floor label to repeat across different
 * towers ("L1" in both Tower 1 and Tower 2) — this string doubles as
 * shop_drawing_boq_line_locations.location_label on import (see
 * import/actions.ts), whose primary key is (line_id, location_label) with
 * no floor_id in that key, so a bare label would collide across towers on
 * exactly the kind of project this feature exists for.
 *
 * Column order matches /floors' own display order (Brief 047): no-tower
 * floors first (by sort_order), then each tower in sort_order, its own
 * floors in sort_order — not alphabetical, not creation order.
 */
export interface TowerData {
  id: string
  label: string
  sortOrder: number
}

export interface FloorData {
  id: string
  label: string
  sortOrder: number
  towerId: string | null
}

export interface FloorColumn {
  header: string
  floorId: string
}

export function buildFloorColumns(towers: TowerData[], floors: FloorData[]): FloorColumn[] {
  const sortedTowers = [...towers].sort((a, b) => a.sortOrder - b.sortOrder)
  const noTowerFloors = floors.filter((f) => f.towerId === null).sort((a, b) => a.sortOrder - b.sortOrder)

  const columns: FloorColumn[] = noTowerFloors.map((f) => ({ header: f.label, floorId: f.id }))

  for (const tower of sortedTowers) {
    const towerFloors = floors.filter((f) => f.towerId === tower.id).sort((a, b) => a.sortOrder - b.sortOrder)
    for (const floor of towerFloors) {
      columns.push({ header: `${tower.label} - ${floor.label}`, floorId: floor.id })
    }
  }

  return columns
}
