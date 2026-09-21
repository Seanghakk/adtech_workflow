'use client'

import { useState } from 'react'
import { ADMIN_GROUP_EXPANDED_COOKIE, EXECUTION_SUBTREE_EXPANDED_COOKIE, SIDEBAR_COLLAPSED_COOKIE } from './sidebarCookieNames'

/** Below this width, default to collapsed (icon rail) on a visitor's very
 *  first load — there is no separate mobile drawer in this app (see
 *  AppSidebar.tsx's own header for why), so a persistent 208px sidebar
 *  would otherwise eat most of a phone screen before anyone has a chance
 *  to collapse it themselves. Only affects the FIRST-EVER default (no
 *  cookie AND no localStorage yet); any stored preference always wins
 *  after that. */
const NARROW_DEFAULT_BREAKPOINT = '(max-width: 640px)'

function readPersisted(key: string, defaultValue: boolean): boolean {
  if (typeof window === 'undefined') return defaultValue
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) return stored === '1'
  } catch {
    // Private-browsing / storage-blocked — falls through to defaultValue.
  }
  return defaultValue
}

/** Best-effort — some sandboxed/embedded contexts throw on `document.cookie`
 *  writes the same way private-browsing can throw on localStorage. Not
 *  `Secure`-only-locked: local `next dev` is plain http, and this cookie
 *  holds no sensitive data, only a UI layout preference. */
function writeCookie(key: string, value: boolean) {
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${key}=${value ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax${secure}`
  } catch {
    // Best-effort only, same as the localStorage write below.
  }
}

/**
 * Brief 039 §1 — mirrors the CMMS's own useSidebarCollapsed()/
 * usePersistedToggle() mechanism: a boolean, persisted per-device, read
 * synchronously during initial state (not a post-mount effect).
 *
 * Brief 043 item 1 — CLOSES the gap Result 039 §3.3 had flagged and
 * under-estimated as "a one-frame flash." Real-device hand-verification
 * found it is not a flash: it is a PERMANENT stuck-expanded state after
 * every full-page navigation. Root cause, confirmed via the browser
 * console, not guessed: React 19 does not patch a hydration mismatch
 * caused by a client-only useState initializer differing from the SSR
 * output — "This won't be patched up," verbatim, in its own hydration
 * warning. Since SSR always rendered `collapsed=false` (no server-side
 * knowledge of the client's localStorage) and readPersisted() could
 * return true, EVERY reload where the stored preference was "collapsed"
 * hit this mismatch, and the DOM stayed on the server's wrong value
 * forever — not just a visible flash, a genuinely broken toggle.
 *
 * FIX: the same cookie mechanism the CMMS's own Brief 072 already
 * validated for exactly this problem. `serverValue` — read from the
 * relevant cookie by a Server Component via `cookies()` and passed down
 * as a prop — IS the initial state when present, full stop, so the
 * client's first render already matches what SSR produced (the server
 * read the same cookie). `toggle()` now writes the SAME value to both
 * localStorage (kept as the fallback/cache a first-ever visitor's
 * SSR-less initial client render still needs) and this cookie (new), so
 * the very next full navigation's SERVER render already reflects it too.
 *
 * SECOND bug found while verifying the above fix, also real, also
 * confirmed (not guessed): the cookie name constant cannot live in THIS
 * file. This file is `'use client'`; React Server Components replaces
 * every export of a `'use client'` module — including a plain string
 * constant, not just components — with an opaque client reference when a
 * Server Component imports it. A `console.log` in (app)/layout.tsx
 * proved it directly: the cookie name printed as `[Function (anonymous)]`
 * server-side, so `cookieStore.get(...)` never matched the real cookie
 * and `initialCollapsed` was silently always `undefined` — the actual
 * reason item 1 still failed even after the cookie mechanism above was
 * written. The cookie name constants now live in sidebarCookieNames.ts, a
 * plain module with no client directive, importable safely from both
 * sides — same split the CMMS's own codebase already uses, for this
 * exact reason.
 *
 * Brief 064 §2.5 — GENERALIZED into `usePersistedToggle(key, default,
 * serverValue)`, mirroring the CMMS's own identical generalization (its
 * Brief 064, a same-named but different-repo brief — coincidence, not a
 * cross-reference) once a second persisted-boolean consumer
 * (useAdminGroupExpanded, below) needed the exact same shape. Every
 * hardening fix above (the hydration-mismatch fix, the client-module-
 * export-opacity fix) is preserved verbatim in the shared function, so
 * neither of those bugs can reappear independently in the two callers.
 *
 * NOT currently called anywhere: this app's brief 064 rail (v5 §2.1) is
 * a single fixed-width rail with no icon-collapsed state — v5 gives no
 * responsive/mobile treatment for it at all (flagged in that brief's own
 * Result doc). Kept, not deleted: this is a real, previously hardened
 * mechanism (three prior briefs' worth of real-device bug fixes), and a
 * collapse toggle remains a plausible answer to that flagged gap later —
 * removing working, tested code on the strength of "nothing calls it
 * this round" would be destroying it on a guess, not a confirmed reason.
 */
export function usePersistedToggle(key: string, defaultValue: boolean, serverValue?: boolean): [boolean, () => void] {
  const [value, setValue] = useState(() => (serverValue !== undefined ? serverValue : readPersisted(key, defaultValue)))

  const toggle = () => {
    setValue((current) => {
      const next = !current
      try {
        localStorage.setItem(key, next ? '1' : '0')
      } catch {
        // Best-effort persistence only — the toggle still works for this
        // page view even if it can't be remembered for the next one.
      }
      writeCookie(key, next)
      return next
    })
  }

  return [value, toggle]
}

function narrowViewportDefault(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.matchMedia(NARROW_DEFAULT_BREAKPOINT).matches
  } catch {
    return false
  }
}

/** Whole-sidebar collapse (icon rail). See this file's own header for
 *  the full history and why it has no current caller. The narrow-
 *  viewport default (see NARROW_DEFAULT_BREAKPOINT above) is passed as
 *  usePersistedToggle's own `defaultValue` — reached only when NEITHER a
 *  server cookie nor a stored localStorage preference exists yet,
 *  exactly the fallback order the original readInitial() used. */
export function useSidebarCollapsed(serverValue?: boolean): [boolean, () => void] {
  return usePersistedToggle(SIDEBAR_COLLAPSED_COOKIE, narrowViewportDefault(), serverValue)
}

/** Brief 064 §2.5 — the Admin collapsible's own expand/fold state.
 *  Independent of any whole-sidebar collapse; a different cookie key,
 *  same mechanism. Defaults to COLLAPSED (false) — v5 §2.5's own words:
 *  "a single collapsible row, collapsed by default." (The CMMS's own
 *  equivalent defaults to expanded/true, for its own reason stated in
 *  its own hook — deliberately NOT copied here since v5 states the
 *  opposite default explicitly for this app.) */
export function useAdminGroupExpanded(serverValue?: boolean): [boolean, () => void] {
  return usePersistedToggle(ADMIN_GROUP_EXPANDED_COOKIE, false, serverValue)
}

/** Brief 067 §3 — the Execution subtree's own expand/fold state.
 *  DEFAULTS TO EXPANDED (true) — a JUDGMENT CALL, flagged rather than
 *  silently picked: v5 §2.5 says "collapsed by default" explicitly for
 *  Admin, but §2.3 never says either way for the Execution subtree.
 *  That asymmetry is read as meaningful, not an oversight to fill in
 *  the same way: Execution is this app's own main working area (v5
 *  §2.1 marks it "live, expandable" alongside the other live items,
 *  none of which start hidden), unlike Admin, which v5 is explicit
 *  about de-emphasising. Reconsider if that reading turns out wrong. */
export function useExecutionSubtreeExpanded(serverValue?: boolean): [boolean, () => void] {
  return usePersistedToggle(EXECUTION_SUBTREE_EXPANDED_COOKIE, true, serverValue)
}
