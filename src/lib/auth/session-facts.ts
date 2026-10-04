/**
 * ADTECH_WF_Brief_107 Part A — reads the facts securityGate() decides on,
 * for the signed-in session. Read only, and only these across the schema
 * boundary into `public` (the CMMS's): the person's own user_profiles row
 * (role, must_change_password — readable under its "Users read own
 * profile" policy) and the CMMS's two-step switch
 * (security_settings.mfa_enforced, service role, cached 30 s exactly as the
 * CMMS caches it). Nothing here writes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import type { SessionFacts } from './security-gate'

/** Thrown when the profile can't be read: callers fail closed, never open. */
export class SessionFactsUnavailable extends Error {}

/** Any Supabase client with a session: the proxy's (unpinned) or server.ts's (pinned to workflow). */
type AnyClient = { auth: SupabaseClient['auth'] }

const CACHE_MS = 30_000
let cached: { value: boolean; at: number } | null = null

/** The CMMS's switch. A read failure counts as "off", as in the CMMS — never lock anyone out on a read error. */
export async function isMfaEnforced(now = Date.now(), svc?: SupabaseClient): Promise<boolean> {
  if (cached && now - cached.at < CACHE_MS) return cached.value
  const client = svc ?? (createServiceClient() as unknown as SupabaseClient)
  const { data, error } = await (client as unknown as { schema: (s: 'public') => SupabaseClient })
    .schema('public')
    .from('security_settings')
    .select('mfa_enforced')
    .eq('id', true)
    .maybeSingle()
  const value = !error && (data as { mfa_enforced?: boolean } | null)?.mfa_enforced === true
  cached = { value, at: now }
  return value
}

/** Tests only. */
export function forgetMfaEnforcedCache(): void {
  cached = null
}

/**
 * `client` may be pinned to the workflow schema (server.ts) or unpinned
 * (the proxy's); the profile read goes through .schema('public') when the
 * client has it. A missing profile row is not an error (no Workflow
 * access is possible without one — members.user_id references it).
 */
export async function readSessionFacts(client: AnyClient, userId: string, opts: { enforced?: () => Promise<boolean> } = {}): Promise<SessionFacts> {
  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel()
  const c = client as unknown as { schema?: (s: 'public') => SupabaseClient }
  const db = typeof c.schema === 'function' ? c.schema('public') : (client as unknown as SupabaseClient)
  const { data: profile, error } = await db.from('user_profiles').select('role, must_change_password').eq('id', userId).maybeSingle()
  if (error) throw new SessionFactsUnavailable(error.message)
  const p = profile as { role: string | null; must_change_password: boolean | null } | null
  return {
    aal: aal ? { currentLevel: aal.currentLevel ?? null, nextLevel: aal.nextLevel ?? null } : null,
    cmmsRole: p?.role ?? null,
    mustChangePassword: p?.must_change_password === true,
    enforced: await (opts.enforced ?? (() => isMfaEnforced()))(),
  }
}
