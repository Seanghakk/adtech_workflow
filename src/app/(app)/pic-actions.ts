'use server'

/**
 * Brief 012 §3 — assigning/reassigning a project's PIC from the board
 * (screen 4a), the ONLY write path to workflow.projects.pic_id anywhere
 * in the app (that table has had no UPDATE policy since migration 003 —
 * see workflow.assign_project_pic()'s own comment, migration 009). Calls
 * the SECURITY DEFINER function rather than a plain .update() — there is
 * no RLS policy this could go through even if attempted directly.
 *
 * isManagerOrAdmin() here is belt-and-suspenders, same as every other
 * Server Function in this app (see sales/assign/actions.ts) — the real
 * gate is workflow.is_manager(), checked inside the SQL function itself.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isManagerOrAdmin } from '@/lib/auth/roles'

export interface AssignPicState {
  error: string | null
}

export async function assignProjectPic(
  _prevState: AssignPicState,
  formData: FormData,
): Promise<AssignPicState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to assign a PIC.' }
  }

  const projectId = String(formData.get('projectId') ?? '')
  const newPicId = String(formData.get('newPicId') ?? '')

  if (!projectId || !newPicId) {
    return { error: 'Choose a person.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('assign_project_pic', {
    p_project_id: projectId,
    p_new_pic_id: newPicId,
  })

  if (error) {
    return { error: 'Could not assign this PIC. Nothing was changed — try again.' }
  }

  revalidatePath('/')
  // Brief 067 §2 — renamed from /exceptions and /load.
  revalidatePath('/delays-and-blockers')
  revalidatePath('/who-is-on-what')
  return { error: null }
}
