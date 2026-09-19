'use client'

import { usePathname } from 'next/navigation'
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GitBranch,
  LayoutGrid,
  MessageSquare,
  Send,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { useSidebarCollapsed } from '@/lib/useSidebarCollapsed'
import { NAV_ENTRIES, canSeeNavEntry, isNavEntryActive } from '@/lib/nav'

const NAV_ICONS: Record<string, LucideIcon> = {
  board: LayoutGrid,
  requests: Send,
  triage: GitBranch,
  'awaiting-so': Clock,
  catalogue: BookOpen,
  sales: Building2,
  exceptions: AlertTriangle,
  load: BarChart3,
  users: Users,
  lookups: Settings,
  notifications: MessageSquare,
}

/**
 * Brief 039 — collapsible side navigation, replacing AppHeader.tsx's old
 * three <nav> blocks. Mirrors the CMMS's HubNav.tsx STRUCTURE and
 * BEHAVIOR (icon-only collapsed rail vs. full labels expanded, a toggle
 * pinned at the sidebar's own bottom, per-device persistence via
 * useSidebarCollapsed) without its visual system — no radius, no shadow,
 * no soft hover lift, reading this app's own flat/ruled tokens exactly
 * like every other class in globals.css does.
 *
 * DELIBERATE STRUCTURAL DEVIATIONS FROM THE CMMS's CURRENT SIDEBAR, both
 * flagged in this brief's Result doc rather than silently matched:
 *
 * 1. No expandable nested group (the CMMS's "Admin" entry with children).
 *    Nothing in this app's current nav has that shape — every entry here
 *    was a flat link in AppHeader.tsx before this brief — so there is
 *    nothing to nest.
 *
 * 2. No `<900px` hide-and-replace-with-a-drawer behavior. The CMMS drops
 *    its sidebar entirely below 900px because HubNavMobile's hamburger
 *    drawer replaces it there. This app has never had an equivalent
 *    mobile drawer, and at least one real screen
 *    (variations/[id]/approve, Screen 3c) is phone-first and lives under
 *    this same layout — hiding the sidebar with nothing to replace it
 *    would make every screen unreachable on a phone, directly violating
 *    this brief's own "nothing reachable before becomes unreachable
 *    after" requirement. The sidebar instead stays visible and
 *    collapsible at every width; useSidebarCollapsed() defaults a
 *    visitor's first-ever load to collapsed below 640px specifically so
 *    it doesn't eat the screen before anyone's had a chance to fold it.
 */
export function AppSidebar({
  isSales,
  isManager,
  initialCollapsed,
}: {
  isSales: boolean
  isManager: boolean
  /** Brief 043 item 1 — the sidebar-collapsed cookie value the caller (a
   *  Server Component) already read via `cookies()`. Undefined (no cookie
   *  yet) falls through to useSidebarCollapsed()'s own client-side
   *  default/localStorage handling — see that hook's own header. */
  initialCollapsed?: boolean
}) {
  const { t } = useLanguage()
  const pathname = usePathname()
  const [collapsed, toggleCollapsed] = useSidebarCollapsed(initialCollapsed)

  const entries = NAV_ENTRIES.filter((entry) => canSeeNavEntry(entry, { isSales, isManager }))

  return (
    <aside className={collapsed ? 'app-sidebar app-sidebar--collapsed' : 'app-sidebar'} aria-label="Main">
      <nav className="app-sidebar-nav">
        {entries.map((entry) => {
          const Icon = NAV_ICONS[entry.key]
          const label = t(entry.labelKey)
          const isCurrent = isNavEntryActive(entry, pathname)
          return (
            <a
              key={entry.key}
              href={entry.href}
              className="app-sidebar-link"
              aria-current={isCurrent ? 'page' : undefined}
              title={collapsed ? label : undefined}
            >
              <Icon size={17} strokeWidth={2} />
              <span className="app-sidebar-link-label">{label}</span>
            </a>
          )
        })}
      </nav>
      <button
        type="button"
        className="app-sidebar-toggle"
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
      >
        {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        <span className="app-sidebar-toggle-label">Collapse</span>
      </button>
    </aside>
  )
}
