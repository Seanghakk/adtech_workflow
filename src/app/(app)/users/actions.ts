'use server'

/**
 * Brief 012 §2 — User Management's two write paths. Neither invents new
 * RLS: workflow.members already accepts INSERT/UPDATE from a manager
 * (members_insert/members_update, migration 001) — this brief only needed
 * to build the UI in front of a permission that has existed since the
 * schema's first migration but had no screen. The isManagerOrAdmin()
 * check here is the same "don't trust the UI alone" belt-and-suspenders
 * every other Server Function in this app already applies (see
 * sales/assign/actions.ts's own comment) — RLS is the real enforcement.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isManagerOrAdmin } from '@/lib/auth/roles'

export interface LinkAccountState {
  error: string | null
}

export async function linkAccount(
  _prevState: LinkAccountState,
  formData: FormData,
): Promise<LinkAccountState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to link accounts.' }
  }

  const userId = String(formData.get('userId') ?? '')
  const teamId = String(formData.get('teamId') ?? '')
  const role = String(formData.get('role') ?? '')

  if (!userId || !teamId || !role) {
    return { error: 'Choose a team and a role.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('members').insert({
    user_id: userId,
    team_id: teamId,
    role,
  })

  if (error) {
    return { error: 'Could not link this account. Nothing was changed — try again.' }
  }

  revalidatePath('/users')
  return { error: null }
}

export interface DeactivateMemberState {
  error: string | null
}

export async function deactivateMember(
  _prevState: DeactivateMemberState,
  formData: FormData,
): Promise<DeactivateMemberState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to deactivate members.' }
  }

  const memberId = String(formData.get('memberId') ?? '')
  if (!memberId) {
    return { error: 'No member specified.' }
  }

  const supabase = await createClient()

  // §2.5 — deactivate, never delete. No delete control exists anywhere in
  // this screen; this is the only state change a departing member's row
  // ever undergoes.
  const { error } = await supabase
    .from('members')
    .update({ is_active: false })
    .eq('id', memberId)

  if (error) {
    return { error: 'Could not deactivate this member. Nothing was changed — try again.' }
  }

  revalidatePath('/users')
  revalidatePath('/')
  return { error: null }
}
