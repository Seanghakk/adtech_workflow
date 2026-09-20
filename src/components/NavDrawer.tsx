'use client'

import { useEffect, useRef, useState } from 'react'
import { AppSidebar } from './AppSidebar'

/**
 * Brief 065 — the narrow-viewport answer Brief 064 §5 flagged rather
 * than invented on its own initiative: below 640px (this app's own
 * existing narrow-viewport convention — same value .app-header's own
 * wrap rule and useSidebarCollapsed.ts's NARROW_DEFAULT_BREAKPOINT
 * already use; grepped globals.css for every existing breakpoint
 * before picking one, not invented fresh), the rail becomes an
 * off-canvas drawer opened from this trigger. At and above 640px this
 * renders nothing visible at all (CSS-hidden) — Brief 064's own rail
 * is completely unchanged there.
 *
 * MIRRORS THE CMMS's OWN PATTERN (~/Documents/adtech-cmms/src/
 * components/HubNavMobile.tsx, read directly before writing this —
 * same discipline Brief 058 applied to the QR pattern, Brief 064 to
 * the Admin toggle): a hamburger trigger, a fixed-position scrim +
 * slide-in panel, Escape-to-close, dismiss-on-link-click, and reusing
 * useAdminGroupExpanded's already-hardened persisted state for the
 * Admin group inside the drawer.
 *
 * ONE DELIBERATE DEPARTURE FROM THE CMMS's OWN IMPLEMENTATION, per
 * this brief's own explicit instruction over "mirror it" where the
 * two conflict: the CMMS's HubNavMobile hand-duplicates its whole nav
 * list into a second, separately-maintained JSX tree — a real fork,
 * not "one component, two presentations." This drawer instead mounts
 * the SAME AppSidebar component a second time, unmodified, inside a
 * wrapper that repositions it as an overlay via CSS alone (see
 * globals.css's own `.nav-drawer__panel .app-sidebar` override).
 * AppSidebar.tsx has no idea it is inside a drawer — there is exactly
 * one implementation of the rail's content anywhere in this codebase,
 * so steps 3-8 (which keep changing what's IN the rail) can never
 * drift between a desktop and a mobile copy, because there isn't one.
 *
 * Link-dismissal without touching AppSidebar.tsx: a single delegated
 * click listener on the drawer panel closes it whenever the click
 * target is (or is inside) an <a> — every real nav link, without
 * AppSidebar needing an onClick prop or any drawer-awareness at all.
 * The Admin group's own toggle is a <button>, not a link, so opening/
 * closing that section inside the drawer does not also close the
 * drawer — confirmed by reading AppSidebar.tsx's own markup before
 * relying on this.
 *
 * isOpen is plain, ephemeral useState — NOT run through
 * usePersistedToggle. A drawer's open/closed state is a moment-to-
 * moment interaction, not a per-device preference (the CMMS's own
 * HubNavMobile makes the identical choice, plain useState, not its
 * own usePersistedToggle) — persisting "the drawer was open" across a
 * full-page reload would reopen it unexpectedly on every navigation,
 * which is not what the accessibility requirements below want either
 * (focus should land in a JUST-opened drawer, not one that silently
 * reappeared from a stored preference).
 */
export function NavDrawer({
  isManager,
  initialAdminExpanded,
}: {
  isManager: boolean
  initialAdminExpanded?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Brief 065 §5 — Escape closes it, from anywhere on the page while open.
  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  // Brief 065 §5 — focus moves into the drawer when it opens, and back
  // to the trigger when it closes. Not a full focus TRAP (Tab is still
  // free to leave the drawer into the rest of the page) — the brief
  // asks for initial-focus-in and return-focus-out specifically, not a
  // trap, and a hand-rolled trap is exactly the kind of thing that's
  // easy to get subtly wrong; not built since it wasn't asked for.
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus()
    } else {
      triggerRef.current?.focus()
    }
  }, [isOpen])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="nav-drawer__trigger"
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="nav-drawer-panel"
        onClick={() => setIsOpen(true)}
      >
        <span className="nav-drawer__trigger-bar" />
        <span className="nav-drawer__trigger-bar" />
        <span className="nav-drawer__trigger-bar" />
      </button>

      {isOpen && (
        <>
          <div className="nav-drawer__scrim" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <div
            id="nav-drawer-panel"
            ref={panelRef}
            className="nav-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            tabIndex={-1}
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('a')) setIsOpen(false)
            }}
          >
            <button
              type="button"
              className="nav-drawer__close"
              aria-label="Close navigation menu"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
            <AppSidebar isManager={isManager} initialAdminExpanded={initialAdminExpanded} />
          </div>
        </>
      )}
    </>
  )
}
