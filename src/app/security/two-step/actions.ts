'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { safeNextPath } from '@/lib/auth/security-gate'

export interface TwoStepState {
  error: boolean
}

/**
 * ADTECH_WF_Brief_107 Part A — finish the second step for THIS app's
 * session. Same Supabase call the CMMS's /login code step makes
 * (challenge + verify on the person's verified TOTP factor), which raises
 * the session to aal2. No enrolment and no recovery codes here: those stay
 * in the CMMS.
 */
export async function verifyTwoStep(_prev: TwoStepState, formData: FormData): Promise<TwoStepState> {
  const code = String(formData.get('code') ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(code)) return { error: true }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = (factors?.totp ?? []).find((f) => f.status === 'verified')
  if (!factor) redirect('/') // nothing to verify any more; the gate decides what's next

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  if (error) return { error: true }

  redirect(safeNextPath(formData.get('next')) ?? '/')
}
