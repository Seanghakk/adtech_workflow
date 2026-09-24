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
  /** Brief 100 Part C — the four read-out tiles on the SO record (v7.2
   *  §21.5) need counts, not just done/not-done. Computed here with the
   *  section states so the tiles and the strip can never disagree. */
  floorCount: number
  towerCount: number
  boqLineCount: number
  lastExportAt: string | null
  /** The first of the six sections that is not done — what the register's
   *  subline names ("Floors come next."). null when all six are done. */
  nextSection: 1 | 2 | 3 | 4 | 5 | 6 | null
  /** Brief 100 Part C review item 1 — true when any of the reads behind
   *  these numbers failed. Without it a failed read falls back to zeroes,
   *  and the SO record's tiles show their honest-looking "nothing here
   *  yet" wording: a failure wearing an empty project's clothes. */
  readFailed: boolean
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
    { data: floorRows, error: floorError },
    { count: tenderCount, error: tenderError },
    { count: shopDrawingCount, error: shopDrawingError },
    { count: contractCount, error: contractError },
    { count: systemCount, error: systemError },
    { count: shopDrawingItemCount, error: itemError },
    { count: exportCount, error: exportError },
    { count: towerCount, error: towerError },
    { data: lastExportRow, error: lastExportError },
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
    supabase.from('project_towers').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    supabase
      .from('autocad_export_log')
      .select('exported_at')
      .eq('project_id', projectId)
      .order('exported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Brief 100 Part C review item 1. An error is not enough on its own:
  // measured against PostgREST, a `head: true` count against a table that
  // does not exist comes back 204 with count = null and NO error object,
  // where a plain select or maybeSingle against the same table returns a
  // proper 404/PGRST205. A count that SUCCEEDED is always a number — 0 for
  // an empty table — so a null count is itself the failure signal, and
  // checking it closes the silent case the error check cannot see. Same
  // shape of problem as Brief 094's silent RLS refusals: the absence of an
  // error is not the presence of a result.
  const countFailed = [
    tenderCount,
    shopDrawingCount,
    contractCount,
    systemCount,
    shopDrawingItemCount,
    exportCount,
    towerCount,
  ].some((c) => c === null || c === undefined)

  const readFailed = Boolean(
    floorError ||
      tenderError ||
      shopDrawingError ||
      contractError ||
      systemError ||
      itemError ||
      exportError ||
      towerError ||
      lastExportError ||
      countFailed ||
      floorRows === null,
  )

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

  // v7.2 §21.5 — "a subline naming the next section". The six in the
  // order §6.2 puts them, first one not done.
  const sectionDone: boolean[] = [
    identityDone,
    structureDone,
    systemsDone,
    boqTiersFilled === 3,
    drawingsDone,
    exportsDone,
  ]
  const nextIndex = sectionDone.findIndex((done) => !done)
  const nextSection = nextIndex === -1 ? null : ((nextIndex + 1) as 1 | 2 | 3 | 4 | 5 | 6)

  return {
    identityDone,
    structureDone,
    systemsDone,
    boqTiersFilled,
    drawingCount,
    exportCount: exportCount ?? 0,
    doneCount,
    floorCount: floorRows?.length ?? 0,
    towerCount: towerCount ?? 0,
    boqLineCount: (contractCount ?? 0) + (tenderCount ?? 0) + (shopDrawingCount ?? 0),
    lastExportAt: lastExportRow?.exported_at ?? null,
    nextSection,
    readFailed,
  }
}
