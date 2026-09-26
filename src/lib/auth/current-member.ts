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
  /** From the auth session (auth.getUser()), NOT a public.user_profiles
   *  query — that table has no email column (Fable Brief 002 §4). Real
   *  only for the CURRENT user; there is no equivalent for looking up
   *  someone else's email (see getUserProfilesByIds, which uses username
   *  instead for that case). */
  email: string | null
  username: string | null
  memberId: string
  role: 'member' | 'manager' | 'admin'
  /** workflow.members.is_superadmin — a column of its own, NOT the `role`
   *  enum above. This is what workflow.is_superadmin() reads, so anything
   *  mirroring a SQL policy in app code must compare against this and not
   *  against role === 'admin' (Brief 099). */
  isSuperadmin: boolean
  teamId: string
  /** Stable team code (workflow.teams.code, e.g. 'sales') — compare
   *  against this, never teamLabelEn, which is a display string
   *  (ADTECH_WF_Brief_003_Sales_Roles). */
  teamCode: string
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

  // public.user_profiles read for identity ONLY (id, full_name, username)
  // — never .role, which is CMMS role vocabulary and means nothing here
  // (Brief 001 §3). This is a cross-schema query (workflow client pinned
  // to schema `workflow`), so it goes through Postgres's normal
  // cross-schema qualification rather than PostgREST's schema switch.
  //
  // CORRECTED (Fable Brief 002 §4): this used to select `email`, a column
  // that does not exist on public.user_profiles — PostgREST fails the
  // whole query when an unknown column is requested, so `profile` was
  // silently null for every signed-in user, not just missing an email.
  // full_name came back null as a result too, which is why the app header
  // has been showing "—" instead of a real name. email below now comes
  // from the auth session object already fetched above (real for the
  // CURRENT user only), not from this table.
  const { data: memberRow } = await supabase
    .from('members')
    .select('id, role, is_superadmin, team_id, teams(code, label_en)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!memberRow) {
    return { user: { id: user.id }, member: null }
  }

  // THE ONE CROSS-SCHEMA CALL IN THE APP, and the reason database.types.ts is
  // generated for `workflow` only. user_profiles lives in `public`; every
  // client here is pinned to `workflow`, so this is the single place that
  // steps outside it.
  //
  // The cast is deliberate and narrow. Generating the types with
  // `--schema public` as well would type this call — and would also make
  // `public` the DEFAULT schema, so every other .from() in the app would
  // resolve against public's empty table list: 1,624 errors instead of 137,
  // measured on 26 Sep 2026. One cast here is the cheaper truth. See the
  // header of src/lib/supabase/database.types.ts before changing either.
  const { data: profile } = await (supabase as unknown as {
    schema: (s: 'public') => {
      from: (t: 'user_profiles') => {
        select: (c: string) => {
          eq: (col: string, v: string) => {
            maybeSingle: () => Promise<{ data: { full_name: string | null; username: string | null } | null }>
          }
        }
      }
    }
  })
    .schema('public')
    .from('user_profiles')
    .select('full_name, username')
    .eq('id', user.id)
    .maybeSingle()

  const team = Array.isArray(memberRow.teams) ? memberRow.teams[0] : memberRow.teams

  return {
    user: { id: user.id },
    member: {
      userId: user.id,
      fullName: profile?.full_name ?? null,
      email: user.email ?? null,
      username: profile?.username ?? null,
      memberId: memberRow.id,
      role: memberRow.role as CurrentMember['role'],
      isSuperadmin: Boolean(memberRow.is_superadmin),
      teamId: memberRow.team_id,
      teamCode: team?.code ?? '',
      teamLabelEn: team?.label_en ?? '',
    },
  }
}
