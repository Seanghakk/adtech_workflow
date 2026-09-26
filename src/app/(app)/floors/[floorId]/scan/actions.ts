'use server'

/**
 * Brief 100 Part E — the scanned-floor phone page's write paths
 * (v7.2 §12.5-§12.8).
 *
 * These mirror the desktop screen's own gates exactly, because the
 * database enforces one rule and two screens must not describe it
 * differently: migration 022 keys floor_sub_stages writes to
 * installation → project_management, tnc → tnc, and migration 017 keys
 * qc_inspections to the qc team. RLS is the real enforcement; the checks
 * here are this app's usual belt-and-suspenders so a direct POST is
 * refused with the same sentence the screen already showed.
 *
 * `requireTeam` is duplicated from update/floor-actions.ts rather than
 * imported: it is module-private there, and this repo's standing
 * convention is a per-file gate helper (see that file's own comment).
 * Promoting it to a shared module would edit the desktop write path,
 * which Part E has no reason to touch.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'
import {
  existsByColumn,
  verifyWriteAffectedRow,
  writeFailureMessage,
} from '@/lib/supabase/verified-write'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { deriveNotifyOutcome } from '@/lib/floorScan/notify'
import { STAGE_TEAM, type Stage } from '@/lib/floorScan/rows'
import type { ScanSaveState, InspectionSaveState } from './scan-shared'

const STATUSES = ['not_started', 'in_progress', 'done'] as const
const STAGES = ['installation', 'tnc'] as const

async function requireTeam(
  teamCodes: string[],
  teamLabel: string,
): Promise<{ userId: string } | { error: string }> {
  const { member } = await getCurrentMember()
  if (!member) return { error: 'You need to be signed in to do this.' }
  if (!teamCodes.includes(member.teamCode)) {
    return { error: `Only the ${teamLabel} team can change this here. Nothing was recorded.` }
  }
  return { userId: member.userId }
}

/**
 * §12.5 / §12.6. The photo gate is STRUCTURAL on the client — selecting
 * "done" navigates to a capture screen that has no save control — but it
 * is re-asserted here, because a structural gate in the UI is not a gate
 * on the write path.
 */
export async function saveSubStageStatus(
  _prev: ScanSaveState,
  formData: FormData,
): Promise<ScanSaveState> {
  const floorId = String(formData.get('floorId') ?? '')
  const projectId = String(formData.get('projectId') ?? '')
  const subStageId = String(formData.get('subStageId') ?? '')
  const status = String(formData.get('status') ?? '')
  const stage = String(formData.get('stage') ?? '')
  const photoUrl = String(formData.get('photoUrl') ?? '').trim()

  if (
    !floorId ||
    !projectId ||
    !subStageId ||
    !STATUSES.includes(status as (typeof STATUSES)[number]) ||
    !STAGES.includes(stage as (typeof STAGES)[number])
  ) {
    return { kind: 'error', message: 'Invalid status.' }
  }

  if (status === 'done' && !photoUrl) {
    return { kind: 'error', message: 'A photo is required to mark this sub-stage done.' }
  }

  const team = STAGE_TEAM[stage as Stage]
  const gate = await requireTeam([team], stage === 'installation' ? 'Project' : 'TNC')
  if ('error' in gate) return { kind: 'error', message: gate.error }

  // Set explicitly: this app has no generic updated_at trigger, and the
  // matrix's "16+ days -> stalled" read is computed from this column.
  const nowIso = new Date().toISOString()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('progress_cells')
    .update(
      status === 'done'
        ? { status, updated_by: gate.userId, photo_url: photoUrl, updated_at: nowIso }
        : { status, updated_by: gate.userId, updated_at: nowIso },
    )
    .eq('id', subStageId)
    .select('id')

  // Brief 094: requireTeam confirmed team membership, never that THIS
  // row's own stage matches the claimed one. RLS re-checks the real row
  // and refuses silently — zero rows, no error.
  const verdict = await verifyWriteAffectedRow(
    { data, error },
    existsByColumn(supabase, 'progress_cells', 'id', subStageId),
  )
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return { kind: 'error', message: writeFailureMessage(verdict, t, 'Could not save this status.') }
  }

  revalidatePath(`/floors/${floorId}/scan`)
  revalidatePath(`/projects/${projectId}/update`)
  return {
    kind: 'saved',
    at: nowIso,
    withPhoto: status === 'done',
    newStatus: status as (typeof STATUSES)[number],
  }
}

/**
 * §12.8. Parity with the desktop recorder and nothing more: result,
 * reason (required on fail only), optional photo. No severity scale, no
 * checklist, no category picker.
 *
 * "A fail does not rewind the status — the inspection is a separate
 * record; never write back to the status column." Nothing below touches
 * floor_sub_stages.
 */
export async function recordInspection(
  _prev: InspectionSaveState,
  formData: FormData,
): Promise<InspectionSaveState> {
  const floorId = String(formData.get('floorId') ?? '')
  const projectId = String(formData.get('projectId') ?? '')
  const subStageId = String(formData.get('subStageId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  const result = String(formData.get('result') ?? '')
  const notes = String(formData.get('notes') ?? '').trim()

  if (!floorId || !projectId || !subStageId || (result !== 'pass' && result !== 'fail')) {
    return { kind: 'error', message: 'Invalid inspection.' }
  }
  if (result === 'fail' && !notes) {
    return { kind: 'error', message: 'A reason is required on a fail.' }
  }

  const gate = await requireTeam(['qc'], 'QC')
  if ('error' in gate) return { kind: 'error', message: gate.error }

  const supabase = await createClient()

  // migration 008's CHECK: an installation row's inspection is typed
  // 'installation', a tnc row's 'commissioning'. Same mapping the
  // desktop recorder uses.
  const inspectionType = stage === 'tnc' ? 'commissioning' : 'installation'

  // An INSERT refused by RLS throws rather than returning zero rows
  // (Brief 094), so the error below is the whole check.
  const { error } = await supabase.from('qc_inspections').insert({
    project_id: projectId,
    inspection_type: inspectionType,
    progress_cell_id: subStageId,
    status: result,
    inspector_id: gate.userId,
    inspected_at: new Date().toISOString(),
    notes: notes || null,
  })

  if (error) {
    return { kind: 'error', message: 'Could not save this inspection.' }
  }

  // §12.7's conditional line, on a FAIL only. See lib/floorScan/notify.ts
  // for why "has been told on Telegram" is earned rather than assumed:
  // Telegram is inert in this app, so today this resolves to 'nobody' or
  // 'not_wired', and never to a claim that someone was told.
  let notify = null
  if (result === 'fail') {
    const { data: subStage } = await supabase
      .from('progress_cells')
      .select('updated_by')
      .eq('id', subStageId)
      .maybeSingle()

    // Via workflow.get_user_profiles(), NOT a direct read: public.
    // user_profiles carries one RLS policy (auth.uid() = id), so a plain
    // query returns a row only for the caller themselves and every other
    // member's name comes back empty (Brief 013 / Result 013).
    let markedDoneByName: string | null = null
    if (subStage?.updated_by) {
      const profiles = await getUserProfilesByIds(supabase, [subStage.updated_by])
      const profile = profiles.get(subStage.updated_by)
      markedDoneByName = profile?.fullName ?? profile?.username ?? null
    }

    notify = deriveNotifyOutcome({ markedDoneByName, telegramDelivered: false })
  }

  // NOT revalidating the scan path here, deliberately. This form is
  // INLINE on that page, so revalidating it remounts the client tree and
  // discards the action state — which silently swallows the saved block
  // and, with it, §12.7's "no one to notify" line. Measured, not
  // assumed: the first build of this did exactly that. The row is
  // refreshed by the saved block's own "Back to the floor" control
  // instead, once the person has read the outcome.
  revalidatePath(`/projects/${projectId}/update`)
  return { kind: 'saved', result, notify }
}
