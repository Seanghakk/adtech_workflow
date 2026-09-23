/**
 * Brief 097 — the setup strip's six section states (v7.2 §6.1), computed
 * once here so the Project Setup page itself and the SO record's own
 * "Project setup — n of 6 sections done" link (v7.2 §5) can never
 * disagree about what "done" means for a given project. Same "compute
 * once, share the result" reasoning this app already applies to age
 * bands (src/lib/age.ts) and cell state (src/lib/subStageDisplayState.ts).
 */
import type { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface SetupSectionsStatus {
  identityDone: boolean
  structureDone: boolean
  systemsDone: boolean
  boqTiersFilled: number
  drawingCount: number
  exportCount: number
  doneCount: number
}

export async function getSetupSectionsStatus(
  supabase: SupabaseClient,
  projectId: string,
  project: {
    so_number: string | null
    name: string
    pic_id: string | null
    cad_owner_name: string | null
    cad_consultant_name: string | null
  },
  clientName: string | null | undefined,
): Promise<SetupSectionsStatus> {
  const [
    { data: floorRows },
    { count: tenderCount },
    { count: shopDrawingCount },
    { count: contractCount },
    { count: systemCount },
    { count: shopDrawingItemCount },
    { count: exportCount },
  ] = await Promise.all([
    supabase.from('project_floors').select('id').eq('project_id', projectId),
    supabase.from('tender_boq_lines').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('shop_drawing_boq_lines').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('contract_boq_lines').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    // Brief 098 §2 — systems are their own stored rows now (migration 037),
    // no longer inferred from BOQ system_type strings.
    supabase.from('project_systems').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('shop_drawing_items').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase.from('autocad_export_log').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])

  const identityDone = Boolean(
    project.so_number && project.name && clientName && project.pic_id && project.cad_owner_name && project.cad_consultant_name,
  )
  const structureDone = (floorRows?.length ?? 0) > 0
  const systemsDone = (systemCount ?? 0) > 0
  const boqTiersFilled = [(contractCount ?? 0) > 0, (tenderCount ?? 0) > 0, (shopDrawingCount ?? 0) > 0].filter(
    Boolean,
  ).length
  const drawingCount = shopDrawingItemCount ?? 0
  const drawingsDone = structureDone && drawingCount > 0
  const exportsDone = drawingCount > 0 && (exportCount ?? 0) > 0

  const doneCount = [identityDone, structureDone, systemsDone, boqTiersFilled === 3, drawingsDone, exportsDone].filter(
    Boolean,
  ).length

  return {
    identityDone,
    structureDone,
    systemsDone,
    boqTiersFilled,
    drawingCount,
    exportCount: exportCount ?? 0,
    doneCount,
  }
}
