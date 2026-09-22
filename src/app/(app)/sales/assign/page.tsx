import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'

// Brief 013 §3 — this file has no translator (its own established
// convention — see its hardcoded English strings throughout); the shared
// "no profile row" text is hardcoded here for the same reason rather than
// pulled from the i18n dictionary other screens use.
const NO_PROFILE_TEXT = 'No profile on file'
import { canAssignClientOwners } from '@/lib/auth/sales-roles'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { RestrictedRoleNotice } from '@/components/RestrictedRoleNotice'
// Brief 090 fix 3 — this ONE string is the sole reason this file now
// touches the translator, deliberately: the brief's fix explicitly
// requires the restricted-role message to be bilingual (dictionary EN/KM
// keys) on all four affected routes, which overrides this file's own
// "no translator" convention for just this string. Everything else in
// this file stays hardcoded English exactly as before — not a broader
// refactor.
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_ADMIN } from '@/lib/breadcrumbs'
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
 * src/proxy.ts).
 *
 * Brief 090 fix 3 — the two restriction cases are told apart, per v7.1
 * §14.1/§14.4 (see users/page.tsx's own comment for the full reasoning):
 * no member row at all still gets NoAccessScreen (correct for that case);
 * a linked member who simply isn't a manager/admin now gets a different,
 * accurate notice instead of NoAccessScreen's "not linked" copy, which
 * was false for a linked member.
 */
export default async function AssignClientOwnersPage() {
  const { member } = await getCurrentMember()

  if (!member) {
    return <NoAccessScreen />
  }
  if (!canAssignClientOwners(member)) {
    const t = await getServerTranslator()
    return (
      <RestrictedRoleNotice kicker="Admin" title="Client owners" body={t('salesAssignRestrictedBody')} />
    )
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
    label: formatMemberName(profiles.get(userId), NO_PROFILE_TEXT),
  }))

  return (
    <>
      {/* Brief 070 — this file has no translator (see its own header
          comment on NO_PROFILE_TEXT above); "Admin" / "Client owners"
          are hardcoded here for the same reason, matching navAdminRowLabel
          / navAdminClientOwners's own EN values exactly rather than
          introducing a translator dependency into an otherwise-untranslated
          screen. */}
      <Breadcrumbs ancestors={[{ label: 'Admin', href: CRUMB_ADMIN.href }]} current="Client owners" />
      <div className="dashboard">
      <h1 className="dashboard__title">Assign client owners</h1>
      <p className="empty-state" style={{ marginBottom: 'var(--space-4)' }}>
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
              ? formatMemberName(profiles.get(currentOwnerId), NO_PROFILE_TEXT)
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
    </>
  )
}
