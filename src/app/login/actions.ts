'use server'

/**
 * Brief 002 §5.1: email/password login against the SHARED Supabase auth
 * (same auth.users as the CMMS — one account signs into both apps). No
 * password reset, no MFA, no username login, no registration — the CMMS
 * owns the auth chain; this app only signs in against it.
 */
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export interface SignInState {
  error: string | null
}

/**
 * Brief 028 §3 — only a same-origin relative path is ever redirected to.
 * `next` comes from a URL search param, i.e. attacker-controllable input
 * (anyone can craft a link to this login page with any `next` value) —
 * a bare "starts with /" check is not enough, since `//evil.com` and
 * `/\evil.com` are both browser-interpreted as protocol-relative
 * external URLs, not app-internal paths. Requiring exactly one leading
 * slash and rejecting a second slash/backslash right after it closes
 * that off.
 */
function safeNextPath(next: FormDataEntryValue | null): string | null {
  const value = String(next ?? '')
  return /^\/(?!\/|\\)/.test(value) ? value : null
}

export async function signIn(_prevState: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return { error: 'Enter both an email and a password.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Generic message, deliberately — do not confirm/deny whether the
    // email exists (same discipline the CMMS applies to username login).
    return { error: 'Could not sign in with those details.' }
  }

  redirect(safeNextPath(formData.get('next')) ?? '/')
}
