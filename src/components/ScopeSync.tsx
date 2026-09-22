'use client'

import { useEffect } from 'react'
import { SCOPE_COOKIE } from '@/lib/scopeCookie'
import type { Scope } from '@/lib/reporting/board'

/**
 * Brief 080 §5 — persists the CURRENTLY RESOLVED scope (whatever the
 * server decided: an explicit `?scope=` param, or the fallback cookie,
 * or the role default) to both localStorage and a cookie, per device,
 * every time it renders with a scope. Mirrors useSidebarCollapsed.ts's
 * own hardened mechanism (cookie for SSR-safe reads on the NEXT
 * navigation, localStorage as the first-ever-visit fallback) — see
 * src/lib/scopeCookie.ts's own header for why this is a small
 * reimplementation rather than a literal reuse of that boolean-only hook.
 *
 * Rendered (invisibly — returns null) on the Board AND all six
 * cross-project lists, so any one of the seven pages picking a scope via
 * its own tab links makes that the shared default everywhere else too.
 */
export function ScopeSync({ scope }: { scope: Scope }) {
  useEffect(() => {
    try {
      localStorage.setItem(SCOPE_COOKIE, scope)
    } catch {
      // Private-browsing / storage-blocked — best-effort only, same as
      // useSidebarCollapsed.ts's own localStorage writes.
    }
    try {
      const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
      document.cookie = `${SCOPE_COOKIE}=${scope}; path=/; max-age=31536000; SameSite=Lax${secure}`
    } catch {
      // Best-effort only, same reasoning.
    }
  }, [scope])

  return null
}
