import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath, securityGate, securityRedirectPath, type SecurityGate } from '@/lib/auth/security-gate'
import { readSessionFacts } from '@/lib/auth/session-facts'

/**
 * ADTECH_WF_Brief_107 — each security page shows only while its own gate
 * applies: done (allow) → on to where the person was going; a different
 * gate → that gate's page. Signed out → the proxy already sent them to /login.
 */
export async function requireGate(kind: Exclude<SecurityGate['kind'], 'allow'>, next: string | null): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const gate = securityGate(await readSessionFacts(supabase, user.id))
  if (gate.kind === 'allow') redirect(safeNextPath(next) ?? '/')
  if (gate.kind !== kind) redirect(securityRedirectPath(gate, next))
}

export const firstParam = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null
