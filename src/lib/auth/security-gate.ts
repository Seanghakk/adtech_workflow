/**
 * ADTECH_WF_Brief_107 Part A — the Workflow asks for exactly what the CMMS
 * asks for, for the same person: the second sign-in step, and a pending
 * password change.
 *
 * The CMMS owns the auth chain (enrolment, verification rules, recovery
 * codes, the forced password change, the two-step switch). This file only
 * mirrors its DECISION — src/lib/mfaPolicy.ts in adtech-cmms
 * (mfaRequiredFor / mfaGateDecision) — so a Workflow session can't skip
 * what a CMMS session can't. Keep the two in step until the platform's
 * shared sign-in replaces both (ADTECH_PLATFORM Migration Plan, Phase 4/5).
 *
 * Pure: no I/O. src/lib/supabase/proxy.ts (every page, server action and
 * API request) and src/lib/auth/current-member.ts (every layout and every
 * action's own check) feed it the session's facts.
 */

/** CMMS rule: these roles need an authenticator while security_settings.mfa_enforced is on. */
export const MFA_REQUIRED_ROLES: readonly string[] = ['admin', 'supervisor']
/** CMMS rule: these roles need one whatever the switch says. */
export const MFA_ALWAYS_REQUIRED_ROLES: readonly string[] = ['client']

export function mfaRequiredFor(cmmsRole: string | null, enforced: boolean): boolean {
  if (!cmmsRole) return false
  return MFA_ALWAYS_REQUIRED_ROLES.includes(cmmsRole) || (enforced && MFA_REQUIRED_ROLES.includes(cmmsRole))
}

/** Where a blocked person is sent. Everything under SECURITY_BASE stays reachable. */
export const SECURITY_BASE = '/security'
export const SECURITY_PATHS = {
  verify: '/security/two-step',
  enrol: '/security/set-up-two-step',
  change_password: '/security/change-password',
} as const

export type SecurityGate = { kind: 'allow' } | { kind: 'verify' } | { kind: 'enrol' } | { kind: 'change_password' }

export interface SessionFacts {
  /** From supabase.auth.mfa.getAuthenticatorAssuranceLevel(): nextLevel 'aal2' = a verified authenticator exists. */
  aal: { currentLevel: string | null; nextLevel: string | null } | null
  /** public.user_profiles.role (CMMS vocabulary) — read only to apply the CMMS's two-step rule. */
  cmmsRole: string | null
  /** public.user_profiles.must_change_password. */
  mustChangePassword: boolean
  /** public.security_settings.mfa_enforced (the CMMS's two-step switch). */
  enforced: boolean
}

/** Paths a signed-in but blocked person can still reach: the sign-in page, the security pages, Next's own assets. */
export function isSecurityOpenPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === SECURITY_BASE ||
    pathname.startsWith(`${SECURITY_BASE}/`) ||
    pathname.startsWith('/_next/')
  )
}

/**
 * The one decision, in the CMMS's order:
 *   1. a verified authenticator + a one-step (aal1) session → enter the code;
 *   2. a role the CMMS requires two-step for, with none set up → set it up in the CMMS;
 *   3. a pending password change → change it in the CMMS;
 *   otherwise allow.
 */
export function securityGate(facts: SessionFacts): SecurityGate {
  const owed = !!facts.aal && facts.aal.nextLevel === 'aal2' && facts.aal.currentLevel !== 'aal2'
  if (owed) return { kind: 'verify' }
  const hasFactor = facts.aal?.nextLevel === 'aal2'
  if (!hasFactor && mfaRequiredFor(facts.cmmsRole, facts.enforced)) return { kind: 'enrol' }
  if (facts.mustChangePassword) return { kind: 'change_password' }
  return { kind: 'allow' }
}

/** Only a same-origin relative path is ever carried through (same rule as login/actions.ts). */
export function safeNextPath(next: unknown): string | null {
  const value = typeof next === 'string' ? next : ''
  if (!/^\/(?!\/|\\)/.test(value)) return null
  return isSecurityOpenPath(value.split('?')[0]) ? null : value
}

/** The page a blocked person is sent to, carrying where they were going. */
export function securityRedirectPath(gate: Exclude<SecurityGate, { kind: 'allow' }>, next: string | null): string {
  const base = SECURITY_PATHS[gate.kind]
  const safe = safeNextPath(next)
  return safe ? `${base}?next=${encodeURIComponent(safe)}` : base
}
