/**
 * Brief 080 §4 (blocking question 2) — ONE bulk fetch, shared by
 * Installation, Testing & commissioning, QC inspections, and Floor
 * progress (all four read floor_sub_stages + qc_inspections across
 * potentially every open project). A single set of queries scoped by
 * project_id IN (...), grouped in memory afterwards — the same "fetch
 * broad, group in JS" shape this app already uses everywhere reads span
 * multiple projects (reporting/exceptions.ts, reporting/board.ts, the
 * Board page itself) — NOT one query per project.
 */
import { resolveLatestInspection, type LatestInspection } from '@/lib/subStageDisplayState'
import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface FloorSubStageRow {
  id: string
  /** Brief 106b — a cell belongs to one system. §10.1 keeps ONE ROW PER
   *  PROJECT in the six lists; the system is carried so a row can answer
   *  the two questions that need it: which system is furthest behind, and
   *  which system the oldest item belongs to. */
  systemId: string
  systemName: string | null
  floorId: string
  stage: 'installation' | 'tnc'
  subStage: string
  status: 'not_started' | 'in_progress' | 'done'
  updatedAt: string
}

export interface ProjectFloorTrackData {
  floors: { id: string; label: string; sortOrder: number; towerId: string | null }[]
  towers: { id: string; label: string; sortOrder: number }[]
  subStages: FloorSubStageRow[]
  latestInspectionBySubStageId: Map<string, LatestInspection | null>
  /** Brief 106b — the project's systems and what each covers, so a list
   *  row can name a system without a second round trip. */
  systems: { id: string; name: string; coveredFloorIds: Set<string> }[]
}

/**
 * One call, N project ids in, ONE set of queries (projects table not
 * included — the caller already has project identity/PIC from its own
 * board-shaped fetch). Returns a per-project breakdown, keyed by
 * project_id, ready for floor-matrix.ts's own buildMatrixRows /
 * computeCellState — no second cell-state derivation is written here.
 */
export async function fetchFloorTrackData(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, ProjectFloorTrackData>> {
  const byProject = new Map<string, ProjectFloorTrackData>()
  if (projectIds.length === 0) return byProject

  // Two-step, matching the matrix's own proven query shape exactly
  // (projects/[projectId]/page.tsx, isMatrixView branch): floors first
  // (scoped by project_id), THEN floor_sub_stages scoped by the
  // resulting floor_id list — not a nested join-filter, which has no
  // proven precedent anywhere in this app's own Supabase client usage.
  const [{ data: towerRows }, { data: floorRows }, { data: systemRows }] = await Promise.all([
    supabase.from('project_towers').select('id, project_id, label, sort_order').in('project_id', projectIds),
    supabase.from('project_floors').select('id, project_id, label, sort_order, tower_id').in('project_id', projectIds),
    // Brief 106b — §10.1 keeps one row per project, so systems are loaded
    // only to NAME one: which system is furthest behind, and which the
    // oldest item belongs to.
    supabase.from('project_systems').select('id, project_id, name').in('project_id', projectIds).order('name'),
  ])

  const { data: coverageRows } = (systemRows ?? []).length
    ? await supabase
        .from('project_system_floors')
        .select('project_system_id, floor_id')
        .in('project_system_id', (systemRows ?? []).map((r) => r.id))
        .is('removed_at', null)
    : { data: [] }

  const systemNameById = new Map((systemRows ?? []).map((r) => [r.id, r.name]))

  for (const id of projectIds) {
    byProject.set(id, {
      floors: [],
      towers: [],
      subStages: [],
      latestInspectionBySubStageId: new Map(),
      systems: [],
    })
  }

  for (const sys of systemRows ?? []) {
    byProject.get(sys.project_id)?.systems.push({
      id: sys.id,
      name: sys.name,
      coveredFloorIds: new Set(
        (coverageRows ?? []).filter((c) => c.project_system_id === sys.id).map((c) => c.floor_id),
      ),
    })
  }

  for (const t of towerRows ?? []) {
    byProject.get(t.project_id)?.towers.push({ id: t.id, label: t.label, sortOrder: t.sort_order })
  }
  const floorToProject = new Map<string, string>()
  for (const f of floorRows ?? []) {
    floorToProject.set(f.id, f.project_id)
    byProject.get(f.project_id)?.floors.push({ id: f.id, label: f.label, sortOrder: f.sort_order, towerId: f.tower_id })
  }

  const floorIds = [...floorToProject.keys()]
  const [{ data: subStageRows }, { data: inspectionRows }] = await Promise.all([
    floorIds.length > 0
      ? supabase
          .from('progress_cells')
          .select('id, project_system_id, floor_id, stage, sub_stage, status, updated_at')
          .in('floor_id', floorIds)
      : Promise.resolve({ data: [] }),
    floorIds.length > 0
      ? supabase
          .from('qc_inspections')
          .select('progress_cell_id, status, inspected_at, created_at')
          .in('project_id', projectIds)
          .in('status', ['pass', 'fail'])
      : Promise.resolve({ data: [] }),
  ])

  const inspectionsBySubStage = new Map<string, { result: 'pass' | 'fail'; date: string }[]>()
  for (const r of inspectionRows ?? []) {
    if (!r.progress_cell_id) continue
    const list = inspectionsBySubStage.get(r.progress_cell_id) ?? []
    list.push({ result: r.status as 'pass' | 'fail', date: r.inspected_at ?? r.created_at })
    inspectionsBySubStage.set(r.progress_cell_id, list)
  }

  for (const s of subStageRows ?? []) {
    const projectId = floorToProject.get(s.floor_id)
    if (!projectId) continue
    const bucket = byProject.get(projectId)
    if (!bucket) continue
    bucket.subStages.push({
      id: s.id,
      systemId: s.project_system_id,
      systemName: systemNameById.get(s.project_system_id) ?? null,
      floorId: s.floor_id,
      stage: s.stage as 'installation' | 'tnc',
      subStage: s.sub_stage,
      status: s.status as 'not_started' | 'in_progress' | 'done',
      updatedAt: s.updated_at,
    })
    bucket.latestInspectionBySubStageId.set(s.id, resolveLatestInspection(inspectionsBySubStage.get(s.id) ?? []))
  }

  return byProject
}

/**
 * Brief 106b / §10.1 — which system the oldest item belongs to.
 *
 * §10.1 keeps ONE ROW PER PROJECT in all six lists: "splitting a project
 * into a row per system would multiply the rows in a list that exists to be
 * scanned. It would also put the same project in four places in the age
 * order." So the system is never a row — it appears only where it answers a
 * question, and this is one of the two: the age on the row belongs to some
 * specific crew's work, and naming it is the difference between "L07 is
 * behind" and "L07's access control is behind".
 *
 * Returns null on a one-system project, where naming it every time would be
 * noise, and null when the cell cannot be identified rather than guessing.
 */
export function systemOfOldestItem(
  data: ProjectFloorTrackData,
  floorId: string | null,
  subStageKey: string | null,
): string | null {
  if (!floorId || data.systems.length <= 1) return null

  const candidates = data.subStages.filter(
    (c) => c.floorId === floorId && (subStageKey === null || c.subStage === subStageKey),
  )
  if (candidates.length === 0) return null

  // The oldest by the same clock the row's age uses. Ties keep the first in
  // Project setup order, which is the order the caller loaded them in.
  const oldest = candidates.reduce((a, b) => (a.updatedAt <= b.updatedAt ? a : b))
  return oldest.systemName
}
