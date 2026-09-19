import type { DictionaryKey } from '@/lib/i18n/dictionary'

/**
 * Brief 039 §1 — the sidebar's own link list, same "hardcoded is fine
 * here" allowance the CMMS's own hubNav.ts relies on (the standing
 * lookup-table rule is about DOMAIN data — stages, reasons, statuses —
 * never the navigation shell itself). Every entry here mirrors a link
 * AppHeader.tsx rendered directly before this brief; the access grouping
 * (all / sales / manager) is exactly the three <nav> blocks it used to
 * split them into.
 */
export type NavAccess = 'all' | 'sales' | 'manager'

export interface NavEntry {
  key: string
  href: string
  labelKey: DictionaryKey
  access: NavAccess
}

export const NAV_ENTRIES: NavEntry[] = [
  { key: 'board', href: '/', labelKey: 'navBoard', access: 'all' },
  { key: 'requests', href: '/requests/new', labelKey: 'navRequests', access: 'all' },
  { key: 'triage', href: '/triage', labelKey: 'navTriage', access: 'all' },
  { key: 'awaiting-so', href: '/awaiting-so', labelKey: 'navAwaitingSo', access: 'all' },
  { key: 'catalogue', href: '/catalogue', labelKey: 'navCatalogue', access: 'all' },
  { key: 'sales', href: '/sales', labelKey: 'navSales', access: 'sales' },
  { key: 'exceptions', href: '/exceptions', labelKey: 'navExceptions', access: 'manager' },
  { key: 'load', href: '/load', labelKey: 'navLoad', access: 'manager' },
  { key: 'users', href: '/users', labelKey: 'navUsers', access: 'manager' },
  { key: 'lookups', href: '/lookups', labelKey: 'navLookups', access: 'manager' },
  { key: 'notifications', href: '/notifications', labelKey: 'navNotifications', access: 'manager' },
]

/** Mirrors the exact gates AppHeader.tsx applied per <nav> block before
 *  this brief (isSalesTeamMember / isManagerOrAdmin) — a navigation-level
 *  judgment call, same as those were; the real access boundary is always
 *  the underlying RLS policy or, for /users and /lookups, the app-layer
 *  checks those pages already run independently of this. */
export function canSeeNavEntry(entry: NavEntry, access: { isSales: boolean; isManager: boolean }): boolean {
  if (entry.access === 'all') return true
  if (entry.access === 'sales') return access.isSales
  return access.isManager
}

/** Exact match, or the entry's route being a path segment above the
 *  current one (e.g. "/requests/new" stays active on nothing further
 *  today, but "/catalogue" should stay active on "/catalogue/123") —
 *  same resolution CMMS's hubNav.ts uses for its own active-state check.
 *  "/" only matches "/" exactly, never as a prefix of every other route. */
export function isNavEntryActive(entry: NavEntry, pathname: string): boolean {
  if (entry.href === '/') return pathname === '/'
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`)
}
