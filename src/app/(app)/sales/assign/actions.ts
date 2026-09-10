'use server'

/**
 * ADTECH_WF_Brief_003_Sales_Roles §"WHAT TO DO" item 4 — client-ownership
 * assignment as a manager/admin action, not self-service by the sales
 * engineer. workflow.client_owners' own RLS (client_owners_insert/update,
 * migration 004) is the REAL enforcement — is_manager() — so a direct
 * POST here from someone who isn't one still fails at the database, this
 * check is the same "don't trust the UI alone" belt-and-suspenders every
 * other Server Function in this app already applies (see
 * update/actions.ts's own comment on the same point).
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { canAssignClientOwners } from '@/lib/auth/sales-roles'

export interface AssignClientOwnerState {
  error: string | null
}

export async function assignClientOwner(
  _prevState: AssignClientOwnerState,
  formData: FormData,
): Promise<AssignClientOwnerState> {
  const { user, member } = await getCurrentMember()

  if (!user || !member || !canAssignClientOwners(member)) {
    // Deliberately the same generic message regardless of WHICH check
    // failed (no session vs no access vs wrong role) — this is an
    // authorization failure, not a form-validation one; no reason to hand
    // back which specific gate stopped the request.
    return { error: 'You do not have permission to assign client owners.' }
  }

  const clientId = String(formData.get('clientId') ?? '')
  const salesEngineerId = String(formData.get('salesEngineerId') ?? '')

  if (!clientId || !salesEngineerId) {
    return { error: 'Choose a client and a Sales Engineer.' }
  }

  const supabase = await createClient()

  // Reassignment is an UPDATE to a new owner, not a new historical row —
  // client_owners holds CURRENT state only (migration 004's own table
  // comment). upsert on the (org_id, client_id) unique constraint covers
  // both "first assignment" and "reassignment" with one statement.
  const { error: upsertError } = await supabase.from('client_owners').upsert(
    {
      client_id: clientId,
      sales_engineer_id: salesEngineerId,
      assigned_at: new Date().toISOString(),
      assigned_by: user.id,
    },
    // Matches the actual unique constraint (org_id, client_id) — migration
    // 004. org_id defaults, but the ON CONFLICT target must name the real
    // constraint's full column list, not just the column that varies.
    { onConflict: 'org_id,client_id' },
  )

  if (upsertError) {
    return { error: 'Could not save this assignment. Nothing was changed — try again.' }
  }

  revalidatePath('/sales/assign')
  revalidatePath('/sales')
  return { error: null }
}
