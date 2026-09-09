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
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

const PUBLIC_PATHS = ['/login']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
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
    return NextResponse.redirect(loginUrl)
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}
