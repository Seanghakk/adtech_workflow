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

export interface ReactivateMemberState {
  error: string | null
}

/**
 * Brief 014 §2 — the gap Result 012 flagged: a deactivated member had no
 * way back in. Uses the SAME members_update RLS policy Deactivate
 * already relies on (migration 001, is_manager()-gated) — confirmed by
 * reading that policy directly rather than assumed (Brief 014 §0's own
 * "confirm state first"), so no migration was needed for this half of
 * the brief.
 */
export async function reactivateMember(
  _prevState: ReactivateMemberState,
  formData: FormData,
): Promise<ReactivateMemberState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to reactivate members.' }
  }

  const memberId = String(formData.get('memberId') ?? '')
  if (!memberId) {
    return { error: 'No member specified.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('members').update({ is_active: true }).eq('id', memberId)

  if (error) {
    return { error: 'Could not reactivate this member. Nothing was changed — try again.' }
  }

  revalidatePath('/users')
  revalidatePath('/')
  return { error: null }
}

export interface UnlinkMemberState {
  error: string | null
}

/**
 * Brief 014 §3 — an UNLINK, not a delete: removes the workflow.members
 * row so the underlying auth account returns to the unlinked-account
 * queue (list_unlinked_accounts, migration 009) and can be linked again,
 * possibly to a different team or role. The auth account itself is never
 * touched here.
 *
 * §3.1's dependency check (done in migration 010's own header, confirmed
 * against the live schema rather than assumed): workflow.progress_updates
 * .author_id and workflow.projects.pic_id both reference
 * public.user_profiles(id) directly, never workflow.members(id), and no
 * foreign key in this schema references workflow.members(id) at all — so
 * this delete orphans nothing. §3.2's Case A applies: Unlink is offered
 * generally, alongside Deactivate, with no history/PIC check required
 * here. The confirmation UI still names the PIC-count consequence before
 * calling this (UnlinkMemberControl), matching Deactivate's own pattern
 * — that is a UI-level warning, not a condition this action enforces.
 *
 * Relies on the members_delete RLS policy (migration 010, is_manager()
 * -gated, mirroring members_update/members_insert) — RLS is the real
 * enforcement, this check is belt-and-suspenders like every other Server
 * Function in this app.
 */
export async function unlinkMember(
  _prevState: UnlinkMemberState,
  formData: FormData,
): Promise<UnlinkMemberState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to unlink accounts.' }
  }

  const memberId = String(formData.get('memberId') ?? '')
  if (!memberId) {
    return { error: 'No member specified.' }
  }

  const supabase = await createClient()

  const { error } = await supabase.from('members').delete().eq('id', memberId)

  if (error) {
    return { error: 'Could not unlink this account. Nothing was changed — try again.' }
  }

  revalidatePath('/users')
  revalidatePath('/')
  return { error: null }
}
