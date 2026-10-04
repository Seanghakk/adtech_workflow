import { NextResponse, type NextRequest } from 'next/server'
import { createRouteClient, isCrossSitePost } from '@/lib/supabase/route-client'

export const dynamic = 'force-dynamic'

/**
 * ADTECH_WF_Brief_108 — sign-out from the security pages, as a plain form
 * POST to this fixed address (the Server Action it replaced posted to the
 * browser's URL and was refused by the proxy on a gated path, like the
 * code submit). Cleared session cookies go onto the 303 to /login.
 */
export async function POST(request: NextRequest) {
  if (isCrossSitePost(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { supabase, applyCookies } = createRouteClient(request)
  await supabase.auth.signOut()
  return applyCookies(NextResponse.redirect(new URL('/login', request.url), 303))
}

/** Opened as a page: nothing to do here but sign in. */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/login', request.url), 303)
}
