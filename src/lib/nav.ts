import type { DictionaryKey } from '@/lib/i18n/dictionary'

/**
 * Brief 064 / v5 §2.1-§2.5 — the seven-item journey rail plus the Admin
 * collapsible, replacing Brief 039's flat NAV_ENTRIES list entirely (this
 * module's only consumer, AppSidebar.tsx, is being rewritten in the same
 * change — confirmed no other importer exists before restructuring this
 * file's whole shape).
 *
 * GAP INVENTORY (v5 §9.6 / brief §4's own instruction) — every judgment
 * call below is also written up in Brief 064's own Result doc; this
 * header states the short version so it travels with the code.
 *
 * Items 1-3 (Request/Triage/SO): v5 §2.2 marks these DEFERRED — present,
 * "Later"-tagged, landing on the shared empty state when clicked — even
 * though /requests/new, /triage and /awaiting-so are real, fully built,
 * currently-live screens (checked directly, not assumed: all three have
 * real Server Function write paths, not stubs). This is a DELIBERATE
 * product decision stated with unusual care in v5 (framed as fixing a
 * past defect, not describing missing functionality) — not a build gap
 * this file is failing to wire up. Those three routes remain reachable by
 * direct URL and via other existing in-app links untouched by this brief
 * (e.g. the SO record page's own "Awaiting SO" cross-link); they are just
 * no longer linked from the primary rail's own click target.
 *
 * Items 4/6/7 (Kickoff/Handover/Inventory) and item 5's own click target
 * (Execution, separate from its not-yet-built subtree — v5 §2.3, step 5,
 * a later brief): v5 marks these LIVE but names no destination page for
 * any of them, and none exists anywhere in this app today (checked
 * directly). JUDGMENT CALL: rather than invent a destination or a dead
 * link, all four route to the same shared empty-state page items 1-3 use
 * when clicked — matching this brief's own explicit permission to stub
 * Execution's expand affordance, extended by direct analogy to the other
 * three undefined "live" items. Row STYLING still matches "live" exactly
 * (ink-coloured, no "Later" tag, no muting) — only the destination is a
 * stub, not the row's own appearance.
 *
 * Board ("/"): not among the seven items at all (checked directly against
 * v5 §2.1 — it lists exactly seven, Board is not one of them). Reachable
 * via the rail's own brand block, which already linked home in
 * AppHeader.tsx before this brief (confirmed by reading that file) — kept
 * unchanged, not invented.
 *
 * Admin's five items (v5 §2.5): "Lookup tables"/"Telegram messages"/
 * "Users and members" map to this app's existing /lookups, /notifications,
 * /users exactly. "Floors and zones" and "SO registers" have NO existing
 * global route (checked directly: floor/zone config is per-project only,
 * /projects/[projectId]/floors, Brief 047; no so_registers admin screen
 * exists anywhere — /lookups covers only reason_codes/scope_types/stages,
 * confirmed by reading it). Both stub to the same shared empty state.
 *
 * Screens with NO home anywhere in the new structure (not deleted, not
 * hidden, not given an invented home, per brief §4): /sales (isSales-
 * gated monitoring screen) and /catalogue (+ /catalogue/[itemId]). Listed
 * here and in the Result doc; still reachable by direct URL.
 */

export type JourneyStatus = 'deferred' | 'live'

export interface JourneyItem {
  key: string
  numeral: number
  labelKey: DictionaryKey
  status: JourneyStatus
  /** null = lands on the shared "not built yet" page (soon/[key]) rather
   *  than a real route — see this file's own header for which items and
   *  why. */
  href: string | null
}

export const JOURNEY_ITEMS: JourneyItem[] = [
  { key: 'request', numeral: 1, labelKey: 'navJourneyRequest', status: 'deferred', href: null },
  { key: 'triage', numeral: 2, labelKey: 'navJourneyTriage', status: 'deferred', href: null },
  { key: 'so', numeral: 3, labelKey: 'navJourneySo', status: 'deferred', href: null },
  { key: 'kickoff', numeral: 4, labelKey: 'navJourneyKickoff', status: 'live', href: null },
  { key: 'execution', numeral: 5, labelKey: 'navJourneyExecution', status: 'live', href: null },
  { key: 'handover', numeral: 6, labelKey: 'navJourneyHandover', status: 'live', href: null },
  { key: 'inventory', numeral: 7, labelKey: 'navJourneyInventory', status: 'live', href: null },
]

export interface AdminItem {
  key: string
  labelKey: DictionaryKey
  href: string | null
}

export const ADMIN_ITEMS: AdminItem[] = [
  { key: 'lookups', labelKey: 'navLookups', href: '/lookups' },
  { key: 'notifications', labelKey: 'navNotifications', href: '/notifications' },
  { key: 'users', labelKey: 'navUsers', href: '/users' },
  { key: 'floors', labelKey: 'navAdminFloors', href: null },
  { key: 'so-registers', labelKey: 'navAdminSoRegisters', href: null },
]

/** Where a stubbed item (journey or Admin) lands — one shared route, one
 *  shared empty-state component, per-item copy looked up by key. */
export function comingSoonHref(key: string): string {
  return `/soon/${key}`
}

/** Exact match, or the entry's route being a path segment above the
 *  current one — same resolution this app's prior nav.ts used, and the
 *  CMMS's own hubNav.ts uses, for an identical active-state check. */
function isActiveHref(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function isJourneyItemActive(item: JourneyItem, pathname: string): boolean {
  if (!item.href) return false
  return isActiveHref(item.href, pathname)
}

export function isAdminItemActive(item: AdminItem, pathname: string): boolean {
  if (!item.href) return false
  return isActiveHref(item.href, pathname)
}
