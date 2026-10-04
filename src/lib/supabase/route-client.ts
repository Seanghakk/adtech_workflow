/**
 * ADTECH_WF_Brief_108 — a Supabase client for a Route Handler that answers
 * with its own redirect. Every cookie Supabase sets (the raised AAL2
 * session after a two-step verify, the cleared session after sign-out) is
 * collected here and written onto THAT response by applyCookies(), so the
 * browser receives it on the redirect itself — nothing depends on
 * cookies() being merged implicitly.
 */
import { createServerClient } from '@supabase/ssr'
import type { NextRequest, NextResponse } from 'next/server'
import { getSupabasePublishableKey, getSupabaseUrl } from './env'

type CookieToSet = { name: string; value: string; options?: Parameters<NextResponse['cookies']['set']>[2] }

export function createRouteClient(request: NextRequest) {
  const pending: CookieToSet[] = []
  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value)
          pending.push({ name, value, options })
        })
      },
    },
  })
  const applyCookies = (response: NextResponse) => {
    pending.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
    return response
  }
  return { supabase, applyCookies }
}

/** Refuse a form post from another site (the session cookie is SameSite=Lax already; this is belt and braces). */
export function isCrossSitePost(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  return !!origin && origin !== request.nextUrl.origin
}
