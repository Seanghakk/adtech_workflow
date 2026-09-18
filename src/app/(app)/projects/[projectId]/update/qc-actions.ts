'use server'

/**
 * Brief 024 §3 — QC inspection recording. Writable only by an active
 * member of the QC team (migration 017's team-keyed policy on workflow.
 * qc_inspections / qc_inspection_floors — Brief §4.1/§4.5: independent of
 * PIC, independent of is_member() alone). The teamCode check below is
 * this app's usual belt-and-suspenders (see floor-actions.ts's own
 * comment) — migration 017's RLS policy is the real enforcement.
 *
 * INSPECTOR IS SELF-STAMPED (§3.2), same pattern progress_updates.
 * author_id already uses in update/actions.ts (`author_id: user.id`) —
 * never a form field.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'

const INSPECTION_STATUSES = ['pending', 'pass', 'fail'] as const

async function requireQcMember(): Promise<{ userId: string } | { error: string }> {
  const { member } = await getCurrentMember()
  if (!member) {
    return { error: 'You need to be signed in to do this.' }
  }
  if (member.teamCode !== 'qc') {
    return { error: 'Only an active member of the QC team can record an inspection. Nothing was recorded.' }
  }
  return { userId: member.userId }
}

/** Brief §3.1 — installation/commissioning inspection, gating one
 *  specific floor's specific sub-stage instance directly via
 *  floor_sub_stage_id (migration 008's qc_inspections_shape_check). */
export async function recordSubStageInspection(formData: FormData): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const floorSubStageId = String(formData.get('floorSubStageId') ?? '')
  const inspectionType = String(formData.get('inspectionType') ?? '')
  const status = String(formData.get('status') ?? '')
  const notes = String(formData.get('notes') ?? '').trim()

  if (
    !projectId ||
    !floorSubStageId ||
    !['installation', 'commissioning'].includes(inspectionType) ||
    !INSPECTION_STATUSES.includes(status as (typeof INSPECTION_STATUSES)[number])
  ) {
    return { error: 'Invalid inspection.' }
  }

  const gate = await requireQcMember()
  if ('error' in gate) return gate

  const supabase = await createClient()
  const { error } = await supabase.from('qc_inspections').insert({
    project_id: projectId,
    inspection_type: inspectionType,
    floor_sub_stage_id: floorSubStageId,
    status,
    inspector_id: gate.userId,
    inspected_at: status === 'pending' ? null : new Date().toISOString(),
    notes: notes || null,
  })

  if (error) {
    return { error: 'Could not save this inspection.' }
  }

  revalidatePath(`/projects/${projectId}/update`)
  return { error: null }
}

/** Brief §3.1/Amendment §3.2 — material inspection, per shipment, at
 *  project level. floor_sub_stage_id stays null; the floors this
 *  shipment serves are recorded as one qc_inspection_floors row each
 *  (a delivery commonly serves several floors at once). */
export async function recordMaterialInspection(formData: FormData): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const status = String(formData.get('status') ?? '')
  const notes = String(formData.get('notes') ?? '').trim()
  const floorIds = formData.getAll('floorIds').map(String).filter(Boolean)

  if (!projectId || !INSPECTION_STATUSES.includes(status as (typeof INSPECTION_STATUSES)[number])) {
    return { error: 'Invalid inspection.' }
  }

  const gate = await requireQcMember()
  if ('error' in gate) return gate

  const supabase = await createClient()
  const { data: inspection, error } = await supabase
    .from('qc_inspections')
    .insert({
      project_id: projectId,
      inspection_type: 'material',
      floor_sub_stage_id: null,
      status,
      inspector_id: gate.userId,
      inspected_at: status === 'pending' ? null : new Date().toISOString(),
      notes: notes || null,
    })
    .select('id')
    .single()

  if (error || !inspection) {
    return { error: 'Could not save this inspection.' }
  }

  if (floorIds.length > 0) {
    const { error: floorsError } = await supabase
      .from('qc_inspection_floors')
      .insert(floorIds.map((floorId) => ({ qc_inspection_id: inspection.id, floor_id: floorId })))

    if (floorsError) {
      return { error: 'Inspection saved, but could not record which floors it serves.' }
    }
  }

  revalidatePath(`/projects/${projectId}/update`)
  return { error: null }
}
