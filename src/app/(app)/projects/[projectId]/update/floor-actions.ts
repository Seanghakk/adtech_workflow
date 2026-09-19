'use server'

/**
 * Brief 024 §2 — write paths for the floor breakdown that expands out of
 * screen 6a on a floor-tracked project. None of these add a new RLS
 * policy: every one of them relies entirely on migration 009's existing
 * PIC-of-the-project-keyed INSERT/UPDATE policies on workflow.
 * project_floors / shop_drawing_items / floor_sub_stages / project_
 * handover_items (Brief 024 §2.2/§5 — sub-stage write access does not
 * change this round). The isCurrentUserPic checks below are this app's
 * usual belt-and-suspenders (see update/actions.ts's own comment on why
 * a direct POST must be refused with the same clear reason the UI
 * already shows) — RLS is the real enforcement.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function requireProjectPic(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<{ userId: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You need to be signed in to do this.' }
  }

  const { data: project } = await supabase.from('projects').select('pic_id').eq('id', projectId).maybeSingle()

  if (!project) {
    return { error: 'Project not found.' }
  }
  if (!project.pic_id || project.pic_id !== user.id) {
    return { error: 'Only this project’s PIC can change floor detail here. Nothing was recorded.' }
  }

  return { userId: user.id }
}

// "Add floor" (Brief 024 §2.2's own addFloor action) REMOVED per Brief
// 050 §B — superseded by the real floor/tower configuration screen at
// /projects/[projectId]/floors (Brief 047), which also supports edit,
// delete, and tower assignment that this lightweight form never did.
// Confirmed before removing: nothing else in the app called this action
// (grepped the whole src tree — its only caller was FloorBreakdown.tsx's
// own local AddFloorForm, also removed this round). Floor DISPLAY and
// sub-stage status updates below are unaffected — only the add-a-floor
// path is gone from this screen.

const SUB_STAGE_STATUSES = ['not_started', 'in_progress', 'done'] as const

/** Brief §2.2 — inline sub-stage status edit, PIC only, migration 009's
 *  existing write policy on workflow.floor_sub_stages. */
export async function updateSubStageStatus(formData: FormData): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const subStageId = String(formData.get('subStageId') ?? '')
  const status = String(formData.get('status') ?? '')

  if (!projectId || !subStageId || !SUB_STAGE_STATUSES.includes(status as (typeof SUB_STAGE_STATUSES)[number])) {
    return { error: 'Invalid status.' }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return gate

  const { error } = await supabase.from('floor_sub_stages').update({ status }).eq('id', subStageId)
  if (error) {
    return { error: 'Could not save this status.' }
  }

  revalidatePath(`/projects/${projectId}/update`)
  return { error: null }
}

/** Same as above, for workflow.shop_drawing_items (both project-scope and
 *  floor-scope rows — project_id is always set on both, migration 008). */
export async function updateShopDrawingStatus(formData: FormData): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const itemId = String(formData.get('itemId') ?? '')
  const status = String(formData.get('status') ?? '')

  if (!projectId || !itemId || !SUB_STAGE_STATUSES.includes(status as (typeof SUB_STAGE_STATUSES)[number])) {
    return { error: 'Invalid status.' }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return gate

  const { error } = await supabase.from('shop_drawing_items').update({ status }).eq('id', itemId)
  if (error) {
    return { error: 'Could not save this status.' }
  }

  revalidatePath(`/projects/${projectId}/update`)
  return { error: null }
}

const HANDOVER_DELIVERABLES = [
  'material_approval',
  'final_bom_spares',
  'tc_document',
  'as_built_drawing',
  'training_om_manual',
  'warranty_documents',
] as const

const HANDOVER_STATUSES = ['not_started', 'in_progress', 'done'] as const

/** Brief §2.4 — the six-deliverable handover checklist. workflow.
 *  project_handover_items rows are NOT auto-seeded (migration 008's own
 *  comment) — a project with zero rows shows all six as virtual
 *  not_started, and the first edit on any of them UPSERTs the row,
 *  relying on migration 009's existing PIC-keyed INSERT/UPDATE policies.
 *  No mandatory-reason rule here — that is 6a's own percent-update rule
 *  only, not asked for on this checklist. */
export async function upsertHandoverItem(formData: FormData): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const deliverable = String(formData.get('deliverable') ?? '')
  const status = String(formData.get('status') ?? '')

  if (
    !projectId ||
    !HANDOVER_DELIVERABLES.includes(deliverable as (typeof HANDOVER_DELIVERABLES)[number]) ||
    !HANDOVER_STATUSES.includes(status as (typeof HANDOVER_STATUSES)[number])
  ) {
    return { error: 'Invalid deliverable or status.' }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return gate

  const { error } = await supabase
    .from('project_handover_items')
    .upsert(
      {
        project_id: projectId,
        deliverable,
        status,
        completed_at: status === 'done' ? new Date().toISOString() : null,
      },
      { onConflict: 'project_id,deliverable' },
    )

  if (error) {
    return { error: 'Could not save this deliverable.' }
  }

  revalidatePath(`/projects/${projectId}/update`)
  return { error: null }
}
