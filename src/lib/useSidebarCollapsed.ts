'use client'

import { useState } from 'react'
import { SIDEBAR_COLLAPSED_COOKIE } from './sidebarCookieNames'

const STORAGE_KEY = SIDEBAR_COLLAPSED_COOKIE

/** Below this width, default to collapsed (icon rail) on a visitor's very
 *  first load — there is no separate mobile drawer in this app (see
 *  AppSidebar.tsx's own header for why), so a persistent 208px sidebar
 *  would otherwise eat most of a phone screen before anyone has a chance
 *  to collapse it themselves. Only affects the FIRST-EVER default (no
 *  cookie AND no localStorage yet); any stored preference always wins
 *  after that. */
const NARROW_DEFAULT_BREAKPOINT = '(max-width: 640px)'

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored !== null) return stored === '1'
  } catch {
    // Private-browsing / storage-blocked — falls through to the width check.
  }
  try {
    return window.matchMedia(NARROW_DEFAULT_BREAKPOINT).matches
  } catch {
    return false
  }
}

/** Best-effort — some sandboxed/embedded contexts throw on `document.cookie`
 *  writes the same way private-browsing can throw on localStorage. Not
 *  `Secure`-only-locked: local `next dev` is plain http, and this cookie
 *  holds no sensitive data, only a UI layout preference. */
function writeCookie(value: boolean) {
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${SIDEBAR_COLLAPSED_COOKIE}=${value ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax${secure}`
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
 * knowledge of the client's localStorage) and readInitial() could return
 * true, EVERY reload where the stored preference was "collapsed" hit
 * this mismatch, and the DOM stayed on the server's wrong value forever
 * — not just a visible flash, a genuinely broken toggle.
 *
 * FIX: the same cookie mechanism the CMMS's own Brief 072 already
 * validated for exactly this problem. `serverValue` — read from
 * SIDEBAR_COLLAPSED_COOKIE by (app)/layout.tsx via `cookies()` and passed
 * down as AppSidebar's `initialCollapsed` prop — IS the initial state
 * when present, full stop, so the client's first render already matches
 * what SSR produced (the server read the same cookie). `toggle()` now
 * writes the SAME value to both localStorage (kept as the fallback/cache
 * a first-ever visitor's SSR-less initial client render still needs) and
 * this cookie (new), so the very next full navigation's SERVER render
 * already reflects it too.
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
 * written. SIDEBAR_COLLAPSED_COOKIE now lives in sidebarCookieNames.ts, a
 * plain module with no client directive, importable safely from both
 * sides — same split the CMMS's own codebase already uses, for this
 * exact reason.
 *
 * Residual, smaller gap, noted rather than silently hidden: a visitor's
 * very FIRST-EVER load on a narrow (<640px) viewport, before any cookie
 * or localStorage exists at all, can still mismatch once — the server
 * has no cookie to read yet, so it renders the `false` default, while
 * the client's `readInitial()` may compute `true` from the width check
 * (`matchMedia`, server-unavailable). That one-time case hits the same
 * unpatched-mismatch behavior described above, self-resolving the moment
 * the visitor toggles once (which sets the cookie for every load after).
 * Not the bug items 1-4 reported (those were about an ALREADY-toggled
 * preference not holding), and not fixable without a second, separate
 * server-side width signal this app has no source for (a cookie can't
 * report screen width) — worth a future brief only if it turns out to
 * matter in practice.
 */
export function useSidebarCollapsed(serverValue?: boolean): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() =>
    serverValue !== undefined ? serverValue : readInitial(),
  )

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Best-effort persistence only — the toggle still works for this
        // page view even if it can't be remembered for the next one.
      }
      writeCookie(next)
      return next
    })
  }

  return [collapsed, toggle]
}
