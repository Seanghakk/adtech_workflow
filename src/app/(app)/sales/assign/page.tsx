import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { canAssignClientOwners } from '@/lib/auth/sales-roles'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { AssignClientOwnerForm } from './AssignClientOwnerForm'

export const metadata: Metadata = {
  title: 'Assign client owners — ADTECH Workflow Tracker',
}

/**
 * ADTECH_WF_Brief_003_Sales_Roles §"WHAT TO DO" item 4 — the client-
 * ownership assignment mechanism, an admin/supervisor action per the
 * brief's own instruction. workflow.client_owners' RLS (is_manager(),
 * migration 004) is the real enforcement; this app-layer gate is the same
 * belt-and-suspenders every other route/action in this app already
 * applies (see AppLayout's own comment on why it re-checks on top of
 * src/proxy.ts) — reusing NoAccessScreen rather than a bespoke message,
 * consistent with how this app already handles every other access denial.
 */
export default async function AssignClientOwnersPage() {
  const { member } = await getCurrentMember()

  if (!member || !canAssignClientOwners(member)) {
    return <NoAccessScreen />
  }

  const supabase = await createClient()

  const [{ data: clients }, { data: owners }, { data: salesMembers }] = await Promise.all([
    supabase.from('clients').select('id, name').order('name'),
    supabase.from('client_owners').select('client_id, sales_engineer_id'),
    supabase
      .from('members')
      .select('user_id, role, teams!inner(code)')
      .eq('is_active', true)
      .eq('teams.code', 'sales'),
  ])

  const ownerByClientId = new Map((owners ?? []).map((o) => [o.client_id, o.sales_engineer_id]))

  const salesUserIds = (salesMembers ?? []).map((m) => m.user_id)
  const profiles = await getUserProfilesByIds(supabase, [
    ...salesUserIds,
    ...(owners ?? []).map((o) => o.sales_engineer_id),
  ])

  const salesEngineerOptions = salesUserIds.map((userId) => ({
    userId,
    label: profiles.get(userId)?.fullName ?? profiles.get(userId)?.username ?? userId,
  }))

  return (
    <div className="dashboard">
      <h1 className="dashboard__title">Assign client owners</h1>
      <p className="empty-state" style={{ marginBottom: '1rem' }}>
        Which Sales Engineer owns each client — drives who sees that
        client&apos;s maintenance contracts on the monitoring view.
      </p>

      {salesEngineerOptions.length === 0 ? (
        <p className="empty-state">
          No active members of the Sales team yet — add one via workflow.members before assigning
          ownership.
        </p>
      ) : (clients ?? []).length === 0 ? (
        <p className="empty-state">No clients exist yet.</p>
      ) : (
        <div className="assign-client-list">
          {(clients ?? []).map((client) => {
            const currentOwnerId = ownerByClientId.get(client.id)
            const currentOwnerLabel = currentOwnerId
              ? (profiles.get(currentOwnerId)?.fullName ?? profiles.get(currentOwnerId)?.username ?? '—')
              : 'Unassigned'

            return (
              <AssignClientOwnerForm
                key={client.id}
                clientId={client.id}
                clientName={client.name}
                currentOwnerLabel={currentOwnerLabel}
                salesEngineers={salesEngineerOptions}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
