/**
 * The access gate (Brief 002 §5.1): a valid Supabase session is NOT
 * access to this app. Access requires an ACTIVE row in workflow.members.
 * This is the one place that check happens — every authenticated route
 * goes through src/app/(app)/layout.tsx, which calls this and renders the
 * "no access" screen (not a crash, not a redirect loop, not an empty
 * dashboard) when it returns null with a signed-in user.
 */
import { createClient } from '@/lib/supabase/server'

export interface CurrentMember {
  userId: string
  fullName: string | null
  email: string | null
  memberId: string
  role: 'member' | 'manager' | 'admin'
  teamId: string
  teamLabelEn: string
}

export interface CurrentMemberResult {
  /** null when there is no signed-in Supabase session at all — should not
   *  normally happen inside (app)/layout.tsx, since src/proxy.ts already
   *  redirects unauthenticated requests to /login, but checked again here
   *  rather than trusting Proxy alone (Next.js's own guidance: "Always
   *  verify authentication ... inside each Server Function rather than
   *  relying on Proxy alone"). */
  user: { id: string } | null
  /** null when the user is signed in but has no ACTIVE workflow.members
   *  row — this is the "no access" case, and is the expected state for
   *  every current ADTECH CMMS user today. */
  member: CurrentMember | null
}

export async function getCurrentMember(): Promise<CurrentMemberResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, member: null }
  }

  // public.user_profiles read for identity ONLY (id, full_name, email) —
  // never .role, which is CMMS role vocabulary and means nothing here
  // (Brief 001 §3). This is a cross-schema query (workflow client pinned
  // to schema `workflow`), so it goes through Postgres's normal
  // cross-schema qualification rather than PostgREST's schema switch.
  const { data: memberRow } = await supabase
    .from('members')
    .select('id, role, team_id, teams(label_en)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!memberRow) {
    return { user: { id: user.id }, member: null }
  }

  const { data: profile } = await supabase
    .schema('public')
    .from('user_profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const team = Array.isArray(memberRow.teams) ? memberRow.teams[0] : memberRow.teams

  return {
    user: { id: user.id },
    member: {
      userId: user.id,
      fullName: profile?.full_name ?? null,
      email: profile?.email ?? null,
      memberId: memberRow.id,
      role: memberRow.role as CurrentMember['role'],
      teamId: memberRow.team_id,
      teamLabelEn: team?.label_en ?? '',
    },
  }
}
