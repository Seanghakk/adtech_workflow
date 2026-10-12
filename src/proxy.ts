/**
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` —
 * `middleware.ts` is deprecated and no longer picked up. See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * proxy.md, "Migration to Proxy". Defaults to the Node.js runtime.
 *
 * ADTECH_PLATFORM_Brief_013e (Phase 5) — the Workflow lives in the platform
 * now. When WORKFLOW_MOVED_TO is set (the platform's origin, a Vercel setting,
 * so no address is written in code), pages answer a temporary (307) redirect
 * to the same page there, query kept. Pages only: GET/HEAD, never /api/…,
 * never /_next/…, never a server action. Everything else answers as before.
 * Unset, nothing changes.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/** The platform's origin from WORKFLOW_MOVED_TO, or null when unset or not an https origin. */
export function movedTo(value: string | undefined): string | null {
  if (!value) return null
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:' && u.pathname === '/' && !u.search ? u.origin : null
  } catch {
    return null
  }
}

/** Where an old page lives in the platform. */
export function newPath(pathname: string): string {
  if (pathname === '/') return '/workflow'
  if (/^\/f\/[^/]+\/?$/.test(pathname)) return pathname // printed floor labels: the platform's short /f/<id>
  if (pathname === '/login' || pathname === '/security' || pathname.startsWith('/security/')) return '/login'
  return `/workflow${pathname}`
}

function isPageRequest(request: NextRequest): boolean {
  const { pathname } = request.nextUrl
  return (
    (request.method === 'GET' || request.method === 'HEAD') &&
    pathname !== '/api' &&
    !pathname.startsWith('/api/') &&
    !pathname.startsWith('/_next/') &&
    !request.headers.has('next-action')
  )
}

export function proxy(request: NextRequest) {
  const origin = movedTo(process.env.WORKFLOW_MOVED_TO)
  if (origin && isPageRequest(request)) {
    const { pathname, search } = request.nextUrl
    return NextResponse.redirect(`${origin}${newPath(pathname)}${search}`, 307)
  }
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Run on every route except static assets and image optimization —
     * an auth redirect must never accidentally block CSS/JS/images.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
