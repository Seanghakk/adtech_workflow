/**
 * ADTECH_WF_Brief_003_Sales_Roles — Sales Engineer and Sales Supervisor are
 * NOT new values in workflow.members.role (that column carries a real
 * database CHECK constraint — member/manager/admin only — confirmed
 * before building anything here, and deliberately left untouched). They
 * are the EXISTING (team_id, role) shape, read together:
 *
 *   Sales Engineer   = active member, team = 'sales', role = 'member'
 *   Sales Supervisor = active member, team = 'sales', role = 'manager'
 *
 * These three predicates are the single source of truth for that mapping
 * on the client/UI side — mirrors workflow.can_view_project()'s own SQL
 * exactly (migration 004), so the two can never quietly disagree about
 * who counts as "sales."  An 'admin' role member tagged team = sales is
 * NOT a Sales Supervisor — admins stay unrestricted/ungated everywhere in
 * this app, matching workflow.is_manager()'s own existing treatment of
 * admin as a global, not team-scoped, privilege.
 */
import type { CurrentMember } from './current-member'

const SALES_TEAM_CODE = 'sales'

export function isSalesEngineer(member: CurrentMember): boolean {
  return member.teamCode === SALES_TEAM_CODE && member.role === 'member'
}

export function isSalesSupervisor(member: CurrentMember): boolean {
  return member.teamCode === SALES_TEAM_CODE && member.role === 'manager'
}

/** Either tier of the sales team — the pair the read-only monitoring view
 *  is for. Excludes an admin tagged team = sales, same reasoning as above. */
export function isSalesTeamMember(member: CurrentMember): boolean {
  return isSalesEngineer(member) || isSalesSupervisor(member)
}

/** Client-ownership assignment is a manager/admin action (ADTECH_WF_Brief_003
 *  §"WHAT TO DO" item 4), matching workflow.client_owners' own RLS
 *  (is_manager() — global, not sales-team-scoped: any org manager/admin
 *  can assign ownership, not only a Sales Supervisor specifically). */
export function canAssignClientOwners(member: CurrentMember): boolean {
  return member.role === 'manager' || member.role === 'admin'
}
