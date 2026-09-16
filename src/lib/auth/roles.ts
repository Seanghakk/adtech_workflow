import type { CurrentMember } from './current-member'

/**
 * Mirrors workflow.is_manager() exactly (migration 001) — manager and
 * admin, global, not team-scoped. Gates User Management (Brief 012
 * §2.7 — "Managers and admins") and board-side PIC assignment (Brief 012
 * §3.1 — "visible to managers and admins only"). The real enforcement is
 * always the matching SQL check (workflow.is_manager(), called inside
 * workflow.assign_project_pic() / workflow.list_unlinked_accounts(), and
 * inside members_insert/members_update's own policies) — this is the
 * same belt-and-suspenders app-layer gate every other role check in this
 * app already applies (see canAssignClientOwners).
 */
export function isManagerOrAdmin(member: CurrentMember): boolean {
  return member.role === 'manager' || member.role === 'admin'
}
