/**
 * Session-refresh helper for src/proxy.ts (Next.js 16 renamed the
 * `middleware` file convention to `proxy` — see node_modules/next/dist/
 * docs/01-app/03-api-reference/03-file-conventions/proxy.md. This is
 * still "middleware" in the Supabase-auth sense; only the Next.js file
 * name and export changed).
 *
 * This is deliberately its own client construction, separate from
 * lib/supabase/client.ts and server.ts: it needs the request/response
 * cookie-forwarding shape Proxy requires, not the `cookies()` API those
 * two use. It only ever calls supabase.auth.getUser(), never a
 * `workflow`-schema query, so it does not need the schema pin those two
 * carry — session refresh is an auth concern, not a workflow-data one.
 *
 * Brief 002 §5.1: "Middleware for session refresh on every request.
 * Result 001 flagged this as deferred to Brief 002; this is that brief."
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabasePublishableKey, getSupabaseUrl } from './env'
import { isSecurityOpenPath, securityGate, securityRedirectPath } from '@/lib/auth/security-gate'
import { readSessionFacts, SessionFactsUnavailable } from '@/lib/auth/session-facts'

const PUBLIC_PATHS = ['/login']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  // IMPORTANT (per @supabase/ssr): use getUser(), not getSession() — this
  // revalidates the token against the auth server rather than trusting an
  // unverified cookie, which is the whole point of running this in Proxy.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))

  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url)
    // Brief 028 §3 — deep-link cold start: carry the original destination
    // through login so a Telegram button opened signed-out still lands
    // where it was pointed, not always on the board. pathname+search
    // only, never request.url's own origin — login/actions.ts's
    // safeNextPath() is the actual trust boundary, this is just what
    // gets offered to it.
    loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`)
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // ADTECH_WF_Brief_107 Part A — the CMMS's second sign-in step and its
  // forced password change, applied to EVERY page, server action and API
  // route (the Workflow is almost all server actions; they POST to page
  // paths, so they pass through here first and never run when blocked).
  if (user && !isSecurityOpenPath(pathname)) {
    let gate
    try {
      gate = securityGate(await readSessionFacts(supabase, user.id))
    } catch (e) {
      if (!(e instanceof SessionFactsUnavailable)) throw e
      return blocked(request, 'account_check_unavailable', 503)
    }
    if (gate.kind !== 'allow') {
      if (isNonPageRequest(request)) return blocked(request, gate.kind, 403)
      return withCookies(
        NextResponse.redirect(new URL(securityRedirectPath(gate, `${pathname}${request.nextUrl.search}`), request.url)),
        response,
      )
    }
  }

  return response
}

/** A server action (Next sends the `next-action` header) or an API route: refuse plainly, never redirect. */
function isNonPageRequest(request: NextRequest): boolean {
  return request.headers.has('next-action') || request.nextUrl.pathname.startsWith('/api/')
}

function blocked(request: NextRequest, reason: string, status: number) {
  if (isNonPageRequest(request)) return NextResponse.json({ error: reason }, { status })
  return new NextResponse('Your account could not be checked just now. Please try again in a moment.', { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

/** Keep any refreshed session cookies when answering with a redirect. */
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((c) => target.cookies.set(c))
  return target
}
