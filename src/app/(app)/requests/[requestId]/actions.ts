'use server'

/**
 * Screen 1e's write paths (Brief 021 §3.4 — "hand it on and close it. Both
 * write. Nothing else changes a request in this round"). Migration 016's
 * UPDATE policy on workflow.requests (is_member()-gated) is what makes
 * both possible; request_handoffs_insert (migration 001) is what makes
 * handOff's history row possible.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface HandOffState {
  error: string | null
}

/**
 * §1.2 — "a team handed something that is not theirs hands it sideways...
 * re-routing is simply another handoff leg." This is ALSO how the very
 * first named person takes hold of a freshly triaged request — the brief
 * gives triage (screen 1c) only a team-level action (§2.3), and
 * request_handoffs.to_owner_id is NOT NULL/a person, so there is no other
 * point in this flow where a handoff leg could be created. One action
 * serves both cases; see this round's Result doc §1 for the full account.
 *
 * Writes exactly two things, per §3.4's own "nothing else changes a
 * request" instruction: a new request_handoffs row (the history), and
 * requests.current_owner_id (who holds it now). destination_team_id is
 * NOT touched here — it stays the record of triage's own routing decision;
 * which TEAM currently holds a request is read back through the current
 * owner's own team membership (workflow.members), the same pattern this
 * app already uses for a project's PIC (getTeamLabelsByUserIds).
 */
export async function handOffRequest(
  _prevState: HandOffState,
  formData: FormData,
): Promise<HandOffState> {
  const requestId = String(formData.get('requestId') ?? '').trim()
  const toOwnerId = String(formData.get('toOwnerId') ?? '').trim()

  if (!requestId || !toOwnerId) {
    return { error: 'Choose a person before handing this on.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in. Nothing was changed.' }
  }

  const { data: request } = await supabase
    .from('requests')
    .select('current_owner_id, closed_at')
    .eq('id', requestId)
    .maybeSingle()

  if (!request) {
    return { error: 'This request could not be found. Nothing was changed.' }
  }
  if (request.closed_at) {
    return { error: 'This request is already closed. Nothing was changed.' }
  }

  const { error: handoffError } = await supabase.from('request_handoffs').insert({
    request_id: requestId,
    from_owner_id: request.current_owner_id,
    to_owner_id: toOwnerId,
  })

  if (handoffError) {
    return { error: 'Could not hand this on. Nothing was changed — try again.' }
  }

  const { error: updateError } = await supabase
    .from('requests')
    .update({ current_owner_id: toOwnerId })
    .eq('id', requestId)

  if (updateError) {
    return { error: 'The handoff was logged, but the current owner could not be updated. Tell a manager.' }
  }

  revalidatePath(`/requests/${requestId}`)
  return { error: null }
}

export interface CloseRequestState {
  error: string | null
}

/**
 * §1.3 — "who closes: either the requester or the current owner," enforced
 * at the APPLICATION layer only. Migration 016's own policy is deliberately
 * NOT narrowed to this rule (§4.2: gated on is_member() alone) — see that
 * migration's own comment and this round's Result doc §1 for why, and for
 * the two risks the brief itself flags with this choice.
 */
export async function closeRequest(
  _prevState: CloseRequestState,
  formData: FormData,
): Promise<CloseRequestState> {
  const requestId = String(formData.get('requestId') ?? '').trim()
  if (!requestId) {
    return { error: 'Nothing was changed.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in. Nothing was changed.' }
  }

  const { data: request } = await supabase
    .from('requests')
    .select('requester_id, current_owner_id, closed_at')
    .eq('id', requestId)
    .maybeSingle()

  if (!request) {
    return { error: 'This request could not be found. Nothing was changed.' }
  }
  if (request.closed_at) {
    return { error: 'This request is already closed.' }
  }
  if (user.id !== request.requester_id && user.id !== request.current_owner_id) {
    return { error: 'Only the requester or the current owner can close this request.' }
  }

  const { error } = await supabase
    .from('requests')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', requestId)

  if (error) {
    return { error: 'Could not close this request. Nothing was changed — try again.' }
  }

  revalidatePath(`/requests/${requestId}`)
  // Brief 028 — the phone status frame (screen 3c) reuses this same
  // action via CloseRequestControl; without this the phone view could
  // keep showing "not closed" after a successful close from there.
  revalidatePath(`/requests/${requestId}/status`)
  return { error: null }
}
