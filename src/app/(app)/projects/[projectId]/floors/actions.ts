'use server'

/**
 * Brief 047 — Floor and Zone (Tower/Wing) Configuration, PIC-gated. Every
 * write here relies on migration 021's RLS policies (project_towers, new;
 * project_floors' own existing migration-009 policies, unchanged) —
 * requireProjectPic below is this app's usual belt-and-suspenders (see
 * update/floor-actions.ts's own requireProjectPic, mirrored here rather
 * than imported — that file does not export it, and every actions.ts file
 * in this app keeps its own local copy) — RLS is the real enforcement.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { existsByColumn, verifyWriteAffectedRow, writeFailureMessage } from '@/lib/supabase/verified-write'
import type { FloorZoneFormState } from './floors-shared'

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
    return { error: 'Only this project’s PIC can change floor/tower configuration here. Nothing was recorded.' }
  }

  return { userId: user.id }
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

function isForeignKeyViolation(error: { code?: string } | null): boolean {
  return error?.code === '23503'
}

// -----------------------------------------------------------------------------
// Towers
// -----------------------------------------------------------------------------

export async function createTower(
  _prevState: FloorZoneFormState,
  formData: FormData,
): Promise<FloorZoneFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const label = String(formData.get('label') ?? '').trim()

  if (!projectId || !label) {
    return { error: 'A tower label is required.', savedAt: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, savedAt: null }

  const { count } = await supabase
    .from('project_towers')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const { error } = await supabase.from('project_towers').insert({
    project_id: projectId,
    label,
    sort_order: (count ?? 0) + 1,
  })

  if (error) {
    if (isUniqueViolation(error)) {
      return { error: 'A tower with this label already exists on this project.', savedAt: null }
    }
    return { error: 'Could not add this tower. Nothing was saved — try again.', savedAt: null }
  }

  revalidatePath(`/projects/${projectId}/floors`)
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function updateTower(
  _prevState: FloorZoneFormState,
  formData: FormData,
): Promise<FloorZoneFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const towerId = String(formData.get('towerId') ?? '')
  const label = String(formData.get('label') ?? '').trim()
  const sortOrderRaw = String(formData.get('sortOrder') ?? '')
  const sortOrder = Number(sortOrderRaw)

  if (!projectId || !towerId || !label || !Number.isFinite(sortOrder)) {
    return { error: 'A label and a valid order number are required.', savedAt: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, savedAt: null }

  const { data, error } = await supabase
    .from('project_towers')
    .update({ label, sort_order: sortOrder, updated_at: new Date().toISOString() })
    .eq('id', towerId)
    .select('id')

  if (error && isUniqueViolation(error)) {
    return { error: 'A tower with this label already exists on this project.', savedAt: null }
  }
  const verdict = await verifyWriteAffectedRow({ data, error }, existsByColumn(supabase, 'project_towers', 'id', towerId))
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return {
      error: writeFailureMessage(verdict, t, 'Could not save this tower. Nothing was changed — try again.'),
      savedAt: null,
    }
  }

  revalidatePath(`/projects/${projectId}/floors`)
  return { error: null, savedAt: crypto.randomUUID() }
}

/** ON DELETE RESTRICT (migration 021) — a tower with floors still
 *  assigned to it refuses to delete at the database layer; surfaced here
 *  as a plain message rather than a raw constraint error, same technique
 *  contract-boq/actions.ts uses for the identical situation. */
export async function deleteTower(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const towerId = String(formData.get('towerId') ?? '')

  if (!projectId || !towerId) {
    return { error: 'Invalid request.' }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error }

  const { data, error } = await supabase.from('project_towers').delete().eq('id', towerId).select('id')

  if (error && isForeignKeyViolation(error)) {
    return { error: 'Reassign or remove this tower’s floors first, then delete the tower.' }
  }
  const verdict = await verifyWriteAffectedRow({ data, error }, existsByColumn(supabase, 'project_towers', 'id', towerId))
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return { error: writeFailureMessage(verdict, t, 'Could not delete this tower — try again.') }
  }

  revalidatePath(`/projects/${projectId}/floors`)
  return { error: null }
}

// -----------------------------------------------------------------------------
// Floors
// -----------------------------------------------------------------------------

/** "Turn floor tracking on for the project" (Brief 047) is not a separate
 *  flag anywhere in the schema — Brief 007 Amendment A already settled
 *  this as purely derived from whether project_floors rows exist
 *  (tracksFloors = floorIds.length > 0, exactly the check update/page.tsx
 *  already uses). Adding the FIRST floor via this action IS "turning
 *  tracking on"; no toggle/column was added or is needed. */
export async function createFloor(
  _prevState: FloorZoneFormState,
  formData: FormData,
): Promise<FloorZoneFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const label = String(formData.get('label') ?? '').trim()
  const towerIdRaw = String(formData.get('towerId') ?? '')
  const towerId = towerIdRaw || null

  if (!projectId || !label) {
    return { error: 'A floor label is required.', savedAt: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, savedAt: null }

  const { count } = await supabase
    .from('project_floors')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const { error } = await supabase.from('project_floors').insert({
    project_id: projectId,
    tower_id: towerId,
    label,
    sort_order: (count ?? 0) + 1,
  })

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        error: towerId
          ? 'A floor with this label already exists under this tower.'
          : 'A floor with this label already exists on this project.',
        savedAt: null,
      }
    }
    return { error: 'Could not add this floor. Nothing was saved — try again.', savedAt: null }
  }

  revalidatePath(`/projects/${projectId}/floors`)
  revalidatePath(`/projects/${projectId}/update`)
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function updateFloor(
  _prevState: FloorZoneFormState,
  formData: FormData,
): Promise<FloorZoneFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const floorId = String(formData.get('floorId') ?? '')
  const label = String(formData.get('label') ?? '').trim()
  const sortOrder = Number(String(formData.get('sortOrder') ?? ''))
  const towerIdRaw = String(formData.get('towerId') ?? '')
  const towerId = towerIdRaw || null

  if (!projectId || !floorId || !label || !Number.isFinite(sortOrder)) {
    return { error: 'A label and a valid order number are required.', savedAt: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, savedAt: null }

  const { data, error } = await supabase
    .from('project_floors')
    .update({ label, sort_order: sortOrder, tower_id: towerId, updated_at: new Date().toISOString() })
    .eq('id', floorId)
    .select('id')

  if (error && isUniqueViolation(error)) {
    return {
      error: towerId
        ? 'A floor with this label already exists under this tower.'
        : 'A floor with this label already exists on this project.',
      savedAt: null,
    }
  }
  const verdict = await verifyWriteAffectedRow({ data, error }, existsByColumn(supabase, 'project_floors', 'id', floorId))
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return {
      error: writeFailureMessage(verdict, t, 'Could not save this floor. Nothing was changed — try again.'),
      savedAt: null,
    }
  }

  revalidatePath(`/projects/${projectId}/floors`)
  revalidatePath(`/projects/${projectId}/update`)
  return { error: null, savedAt: crypto.randomUUID() }
}

/**
 * DELIBERATE DESIGN, flagged per the brief's own "real trade-off" clause
 * rather than decided silently (see Result 047 for the full reasoning):
 * a floor's 7 sub-stage/drawing child rows are auto-seeded, unconditionally,
 * the instant a floor is created (workflow.seed_floor_children(), migration
 * 008) — every FK into project_floors in this schema is ON DELETE RESTRICT
 * (no CASCADE anywhere in this repo), so a plain DELETE on project_floors
 * would ALWAYS fail once those 7 rows exist, making "remove a floor row"
 * unimplementable as asked. Rather than force-cascading through real
 * recorded progress (which this app's own conventions elsewhere refuse to
 * do silently — see contract-boq/actions.ts's own delete-refusal), this
 * action checks first: if every one of the floor's 7 seeded rows is still
 * in its pristine 'not_started' state, and no QC inspection has ever
 * referenced it, the seeded rows are cleaned up (they are system
 * bookkeeping, not user-entered content) and the floor is deleted. If ANY
 * real progress or inspection exists, deletion is refused with a clear
 * message — "remove a freshly-added floor" (the realistic use case for a
 * CONFIGURATION screen: fixing a typo or duplicate right after setup)
 * stays possible; a floor with real work recorded against it cannot be
 * silently destroyed.
 */
export async function deleteFloor(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const floorId = String(formData.get('floorId') ?? '')

  if (!projectId || !floorId) {
    return { error: 'Invalid request.' }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error }

  const { data: subStages } = await supabase
    .from('floor_sub_stages')
    .select('id, status')
    .eq('floor_id', floorId)

  const { data: drawingItems } = await supabase
    .from('shop_drawing_items')
    .select('id, status')
    .eq('floor_id', floorId)
    .eq('scope', 'floor')

  const { count: materialInspectionCount } = await supabase
    .from('qc_inspection_floors')
    .select('qc_inspection_id', { count: 'exact', head: true })
    .eq('floor_id', floorId)

  const subStageIds = (subStages ?? []).map((s) => s.id)
  const { count: subStageInspectionCount } = subStageIds.length
    ? await supabase
        .from('qc_inspections')
        .select('id', { count: 'exact', head: true })
        .in('floor_sub_stage_id', subStageIds)
    : { count: 0 }

  const isPristine =
    (subStages ?? []).every((s) => s.status === 'not_started') &&
    (drawingItems ?? []).every((d) => d.status === 'not_started') &&
    (materialInspectionCount ?? 0) === 0 &&
    (subStageInspectionCount ?? 0) === 0

  if (!isPristine) {
    return { error: 'This floor has recorded progress or QC inspections — it can’t be removed.' }
  }

  // Brief 094 — these two are bulk cleanup-by-parent-id deletes: zero rows
  // affected is a legitimate, unremarkable outcome (a floor can genuinely
  // have zero shop_drawing_items rows in scope 'floor'), not a signal RLS
  // refused anything, so they are left as plain error checks. The final
  // delete below, by the floor's own id, is exactly the single-row case
  // this brief targets and gets the full verified-write treatment.
  const { error: subStageError } = await supabase.from('floor_sub_stages').delete().eq('floor_id', floorId)
  if (subStageError) {
    return { error: 'Could not remove this floor — try again.' }
  }

  const { error: drawingError } = await supabase
    .from('shop_drawing_items')
    .delete()
    .eq('floor_id', floorId)
    .eq('scope', 'floor')
  if (drawingError) {
    return { error: 'Could not remove this floor — try again.' }
  }

  const { data: deletedFloor, error: floorError } = await supabase
    .from('project_floors')
    .delete()
    .eq('id', floorId)
    .select('id')

  const verdict = await verifyWriteAffectedRow(
    { data: deletedFloor, error: floorError },
    existsByColumn(supabase, 'project_floors', 'id', floorId),
  )
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return { error: writeFailureMessage(verdict, t, 'Could not remove this floor — try again.') }
  }

  revalidatePath(`/projects/${projectId}/floors`)
  revalidatePath(`/projects/${projectId}/update`)
  return { error: null }
}
