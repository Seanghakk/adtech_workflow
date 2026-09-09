/**
 * Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` —
 * `middleware.ts` is deprecated and no longer picked up. See
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * proxy.md, "Migration to Proxy". Defaults to the Node.js runtime.
 */
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export function proxy(request: NextRequest) {
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
