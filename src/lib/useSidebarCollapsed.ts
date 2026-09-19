'use client'

import { useState } from 'react'

const STORAGE_KEY = 'wf_sidebar_collapsed'
/** Below this width, default to collapsed (icon rail) on a visitor's very
 *  first load — there is no separate mobile drawer in this app (see
 *  AppSidebar.tsx's own header for why), so a persistent 208px sidebar
 *  would otherwise eat most of a phone screen before anyone has a chance
 *  to collapse it themselves. Only affects the FIRST-EVER default; any
 *  stored preference (from either width) always wins after that. */
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

/**
 * Brief 039 §1 — mirrors the CMMS's own useSidebarCollapsed()/
 * usePersistedToggle() mechanism: a boolean, persisted per-device,
 * read synchronously during initial state (not a post-mount effect) so
 * there is at most one paint before it's correct, not a visible
 * after-the-fact snap.
 *
 * DELIBERATE GAP vs. the CMMS's own current version: no server-read
 * cookie / `serverValue` prop, so a full page navigation (every link
 * here is a plain `<a href>`, same as the CMMS's own sidebar links) can
 * still show a one-frame flash of the wrong state on first load, exactly
 * the residual gap the CMMS's Result 071 first named before its own
 * Brief 072 closed it with a cookie. Not carried over here — this app
 * has no equivalent server-side cookie-read plumbing for a UI-only
 * layout preference, and the brief's own instruction was to mirror
 * behavior, not necessarily this app's entire follow-on fix history.
 * Flagged in this brief's Result doc rather than silently matched or
 * silently skipped.
 */
export function useSidebarCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readInitial)

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Best-effort persistence only — the toggle still works for this
        // page view even if it can't be remembered for the next one.
      }
      return next
    })
  }

  return [collapsed, toggle]
}
