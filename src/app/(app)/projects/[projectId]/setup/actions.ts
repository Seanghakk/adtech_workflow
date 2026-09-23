'use server'

/**
 * Brief 097 §3 — the write path for the three fields Brief 096 added but
 * left with no way in: workflow.projects has no general UPDATE policy
 * for ordinary members (every project-level write goes through a narrow
 * SECURITY DEFINER function instead — assign_project_pic, set_project_
 * dates). Migration 036 adds workflow.set_project_cad_identity() for
 * cad_owner_name / cad_consultant_name / drawing_numbering_mode,
 * mirroring set_project_dates' own "set together" shape — every call
 * here reads the two fields it is NOT changing first and passes them
 * through unchanged, so calling one action never silently clears the
 * other's value.
 *
 * The RPC itself raises an explicit exception on every refusal path
 * (not found, not this project's PIC, a bad numbering-mode value) —
 * Postgres RPC calls surface a raised exception as a real PostgrestError,
 * never silently (the same reason every INSERT in this app was already
 * Class A per Brief 094's own inventory) — so no verified-write wrapper
 * is needed here the way a plain UPDATE would need one.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import type { SetupFormState } from './setup-shared'

export async function updateProjectIdentity(
  _prevState: SetupFormState,
  formData: FormData,
): Promise<SetupFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const ownerNameRaw = String(formData.get('ownerName') ?? '').trim()
  const consultantNameRaw = String(formData.get('consultantName') ?? '').trim()

  if (!projectId) {
    return { error: 'Invalid request.', savedAt: null }
  }

  const supabase = await createClient()

  // Read the field this action is NOT changing so it is passed through
  // unchanged, not cleared — see this file's own header.
  const { data: project } = await supabase
    .from('projects')
    .select('drawing_numbering_mode')
    .eq('id', projectId)
    .maybeSingle()

  const { error } = await supabase.rpc('set_project_cad_identity', {
    p_project_id: projectId,
    p_cad_owner_name: ownerNameRaw || null,
    p_cad_consultant_name: consultantNameRaw || null,
    p_drawing_numbering_mode: project?.drawing_numbering_mode ?? null,
  })

  if (error) {
    const t = await getServerTranslator()
    return { error: error.message.includes('PIC') ? t('setupRefusedNotPic') : 'Could not save. Nothing was changed — try again.', savedAt: null }
  }

  revalidatePath(`/projects/${projectId}/setup`)
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function updateNumberingMode(
  _prevState: SetupFormState,
  formData: FormData,
): Promise<SetupFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const mode = String(formData.get('mode') ?? '')

  if (!projectId || (mode !== 'adtech' && mode !== 'client')) {
    return { error: 'Invalid request.', savedAt: null }
  }

  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('cad_owner_name, cad_consultant_name')
    .eq('id', projectId)
    .maybeSingle()

  const { error } = await supabase.rpc('set_project_cad_identity', {
    p_project_id: projectId,
    p_cad_owner_name: project?.cad_owner_name ?? null,
    p_cad_consultant_name: project?.cad_consultant_name ?? null,
    p_drawing_numbering_mode: mode,
  })

  if (error) {
    const t = await getServerTranslator()
    return { error: error.message.includes('PIC') ? t('setupRefusedNotPic') : 'Could not save. Nothing was changed — try again.', savedAt: null }
  }

  revalidatePath(`/projects/${projectId}/setup`)
  return { error: null, savedAt: crypto.randomUUID() }
}
