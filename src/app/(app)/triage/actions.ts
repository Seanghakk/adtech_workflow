'use server'

/**
 * Screen 1c's write path (Brief 021 §2.3 — "route it to a team, one
 * decision, taken fast"). Migration 016 adds the only thing this needs: an
 * UPDATE policy on workflow.requests gated on workflow.is_member() — any
 * active member may triage (§1.1), so this checks only that a session
 * exists (same belt-and-suspenders level as postRequest, requests/new/
 * actions.ts), not a role. RLS is the real gate.
 *
 * NO request_handoffs row is written here. Routing to a TEAM sets
 * destination_team_id/destination_unsure only — request_handoffs.
 * to_owner_id is NOT NULL and references a PERSON (public.user_profiles),
 * so the first named owner is assigned on screen 1e's "hand it on" (§1.2/
 * §3.4), not here. See this round's Result doc §1 for the full reasoning
 * and exactly where this lives if discovery changes it.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { existsByColumn, verifyWriteAffectedRow, writeFailureMessage } from '@/lib/supabase/verified-write'

export interface RouteRequestState {
  error: string | null
}

export async function routeRequest(
  _prevState: RouteRequestState,
  formData: FormData,
): Promise<RouteRequestState> {
  const requestId = String(formData.get('requestId') ?? '').trim()
  const teamId = String(formData.get('teamId') ?? '').trim()

  if (!requestId || !teamId) {
    return { error: 'Choose a team before routing.' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in. Nothing was changed.' }
  }

  const { data, error } = await supabase
    .from('requests')
    .update({ destination_team_id: teamId, destination_unsure: false })
    .eq('id', requestId)
    .select('id')

  const verdict = await verifyWriteAffectedRow({ data, error }, existsByColumn(supabase, 'requests', 'id', requestId))
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return { error: writeFailureMessage(verdict, t, 'Could not route this request. Nothing was changed — try again.') }
  }

  revalidatePath('/triage')
  return { error: null }
}
