import { NextResponse, type NextRequest } from 'next/server'
import { createRouteClient, isCrossSitePost } from '@/lib/supabase/route-client'
import { safeNextPath, SECURITY_PATHS } from '@/lib/auth/security-gate'

export const dynamic = 'force-dynamic'

/**
 * ADTECH_WF_Brief_108 — the two-step code submit, as a plain form POST to
 * this fixed address (always under /security, which the proxy leaves open).
 *
 * Brief 107 used a Server Action here. A Server Action posts to whatever
 * URL the browser shows; after sign-in the proxy's redirect to the code
 * page happened during a client navigation, so the browser still showed
 * "/" and the code was posted to "/". The proxy (correctly) refuses a
 * server action on a gated page with 403, verify never ran, and Next
 * showed "This page couldn't load" — the loop Seanghakk saw (Result 108).
 *
 * Success: the same Supabase call the CMMS's code step makes (challenge +
 * verify on the verified TOTP factor) raises the session to aal2; the new
 * session cookie is written onto the 303 redirect to `next`. Failure: back
 * to the code page with ?error=1.
 */
export async function POST(request: NextRequest) {
  if (isCrossSitePost(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const form = await request.formData()
  const next = safeNextPath(form.get('next'))
  const code = String(form.get('code') ?? '').replace(/\s+/g, '')
  const to = (path: string) => new URL(path, request.url)
  const back = () => to(`${SECURITY_PATHS.verify}?${new URLSearchParams({ ...(next ? { next } : {}), error: '1' })}`)

  const { supabase, applyCookies } = createRouteClient(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return applyCookies(NextResponse.redirect(to('/login'), 303))
  if (!/^\d{6}$/.test(code)) return applyCookies(NextResponse.redirect(back(), 303))

  const { data: factors } = await supabase.auth.mfa.listFactors()
  const factor = (factors?.totp ?? []).find((f) => f.status === 'verified')
  // Nothing left to verify: carry on; the proxy decides what applies now.
  if (!factor) return applyCookies(NextResponse.redirect(to(next ?? '/'), 303))

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code })
  if (error) return applyCookies(NextResponse.redirect(back(), 303))
  return applyCookies(NextResponse.redirect(to(next ?? '/'), 303))
}
