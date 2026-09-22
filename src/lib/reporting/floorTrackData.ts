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
  const [{ data: towerRows }, { data: floorRows }] = await Promise.all([
    supabase.from('project_towers').select('id, project_id, label, sort_order').in('project_id', projectIds),
    supabase.from('project_floors').select('id, project_id, label, sort_order, tower_id').in('project_id', projectIds),
  ])

  for (const id of projectIds) {
    byProject.set(id, { floors: [], towers: [], subStages: [], latestInspectionBySubStageId: new Map() })
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
      ? supabase.from('floor_sub_stages').select('id, floor_id, stage, sub_stage, status, updated_at').in('floor_id', floorIds)
      : Promise.resolve({ data: [] }),
    floorIds.length > 0
      ? supabase
          .from('qc_inspections')
          .select('floor_sub_stage_id, status, inspected_at, created_at')
          .in('project_id', projectIds)
          .in('status', ['pass', 'fail'])
      : Promise.resolve({ data: [] }),
  ])

  const inspectionsBySubStage = new Map<string, { result: 'pass' | 'fail'; date: string }[]>()
  for (const r of inspectionRows ?? []) {
    if (!r.floor_sub_stage_id) continue
    const list = inspectionsBySubStage.get(r.floor_sub_stage_id) ?? []
    list.push({ result: r.status as 'pass' | 'fail', date: r.inspected_at ?? r.created_at })
    inspectionsBySubStage.set(r.floor_sub_stage_id, list)
  }

  for (const s of subStageRows ?? []) {
    const projectId = floorToProject.get(s.floor_id)
    if (!projectId) continue
    const bucket = byProject.get(projectId)
    if (!bucket) continue
    bucket.subStages.push({
      id: s.id,
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
