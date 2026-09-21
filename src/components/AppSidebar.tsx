'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { useAdminGroupExpanded, useExecutionSubtreeExpanded } from '@/lib/useSidebarCollapsed'
import {
  ADMIN_ITEMS,
  EXECUTION_SUBTREE_ITEMS,
  JOURNEY_ITEMS,
  comingSoonHref,
  isAdminItemActive,
  isJourneyItemActive,
  isSubtreeItemActive,
} from '@/lib/nav'

/**
 * Brief 064 / v5 §2.1-§2.5 — the seven-item journey rail, replacing
 * Brief 039's flat link-list sidebar entirely. Structure, measurements,
 * and the deferred/active/Admin treatments all come from that handoff;
 * see src/lib/nav.ts's own header for every place this brief had to
 * make a judgment call the handoff didn't fully specify (item 4/5/6/7's
 * destinations, Admin's two unmapped items, Board's own placement).
 *
 * KEPT UNCHANGED from Brief 039/043/044/045's own hard-won mechanism:
 * the outer .app-sidebar box (class name and its CSS both kept as-is —
 * see globals.css's own comment there) — its sticky/height/scroll fix
 * closed three separate real bugs across those briefs and has nothing
 * to do with this brief's own content change, so it is not touched.
 *
 * DROPPED: the icon-only collapsed state (useSidebarCollapsed) that
 * mechanism served. v5 §2.1 specifies a single FIXED 268px rail with no
 * collapse toggle anywhere in its spec, and "Replace the current...
 * sidebar" is this brief's own literal instruction — built exactly that
 * way. FLAGGED, not silently dropped (see Brief 064's own Result doc):
 * removing that toggle also removes the one thing that kept this app's
 * nav usable on a narrow/phone viewport (AppSidebar.tsx's own prior
 * header explained why — at least one real screen, Screen 3c, is
 * phone-first). v5 gives no responsive treatment for the new rail at
 * all. Not resolved here — this brief's own scope is the rail's
 * structure, not a redesign v5 never specified — but real enough to
 * need Seanghakk's own confirmation before this ships broadly. The old
 * hook (useSidebarCollapsed) is kept, not deleted, specifically so a
 * follow-up can reuse it rather than re-derive it.
 */
export function AppSidebar({
  isManager,
  initialAdminExpanded,
  initialExecutionExpanded,
  delaysAndBlockersCount,
}: {
  isManager: boolean
  /** Brief 064 §2.5 — the Admin-group-expanded cookie value the caller
   *  (a Server Component) already read via `cookies()`. Undefined (no
   *  cookie yet) falls through to useAdminGroupExpanded()'s own
   *  client-side default (collapsed) / localStorage handling. */
  initialAdminExpanded?: boolean
  /** Brief 067 §3 — same cookie-read pattern, for the Execution
   *  subtree's own expand state (default EXPANDED — see
   *  useExecutionSubtreeExpanded's own header for why that default
   *  differs from Admin's). */
  initialExecutionExpanded?: boolean
  /** Brief 067 §3 — the "Delays & blockers" subtree item's own count
   *  badge (v5 §2.3), computed once by (app)/layout.tsx from the same
   *  shared helper that page itself uses. */
  delaysAndBlockersCount: number
}) {
  const { t } = useLanguage()
  const pathname = usePathname()
  const [adminExpanded, toggleAdminExpanded] = useAdminGroupExpanded(initialAdminExpanded)
  const [executionExpanded, toggleExecutionExpanded] = useExecutionSubtreeExpanded(initialExecutionExpanded)
  const isExecutionActive = EXECUTION_SUBTREE_ITEMS.some((item) => isSubtreeItemActive(item, pathname))

  return (
    <aside className="app-sidebar" aria-label="Main">
      <Link href="/" className="brand-mark brand-mark--rail nav-rail__brand">
        <span className="brand-mark__blocks" aria-hidden="true">
          <span className="brand-mark__block brand-mark__block--blue" />
          <span className="brand-mark__block brand-mark__block--ink" />
        </span>
        <span className="brand-mark__text">
          <span className="brand-mark__name">ADTECH</span>
          <span className="brand-mark__app">Workflow</span>
        </span>
      </Link>

      <nav className="nav-rail__nav">
        <div className="nav-rail__section-label">{t('navJourneySectionLabel')}</div>

        {JOURNEY_ITEMS.map((item) => {
          const label = t(item.labelKey)

          if (item.status === 'deferred') {
            return (
              <Link key={item.key} href={comingSoonHref(item.key)} className="nav-rail__item nav-rail__item--deferred">
                <span className="nav-rail__numeral">{item.numeral}</span>
                <span className="nav-rail__label">{label}</span>
                <span className="nav-rail__later-tag">{t('navJourneyLaterTag')}</span>
              </Link>
            )
          }

          // Brief 067 §3 — item 5 (Execution) now has a real subtree, so
          // its own row becomes an expand/collapse TOGGLE (a <button>,
          // matching the Admin group's own already-established pattern
          // below) rather than a link — it has no destination of its own
          // (case C, see nav.ts's own header), so a link never made
          // sense for it once a subtree existed to expand instead.
          // /soon/execution (Brief 064's own stub for this row) is now
          // unreachable from the rail — kept, not deleted, still
          // directly navigable.
          if (item.key === 'execution') {
            return (
              <div key={item.key}>
                <button
                  type="button"
                  className={
                    isExecutionActive ? 'nav-rail__item nav-rail__item--active nav-rail__item--toggle' : 'nav-rail__item nav-rail__item--toggle'
                  }
                  aria-expanded={executionExpanded}
                  aria-current={isExecutionActive ? 'page' : undefined}
                  onClick={toggleExecutionExpanded}
                >
                  <span className="nav-rail__numeral">{item.numeral}</span>
                  <span className="nav-rail__label">{label}</span>
                </button>
                {executionExpanded && (
                  <div className="nav-rail__subtree">
                    {EXECUTION_SUBTREE_ITEMS.map((subItem, i) => {
                      const subHref = subItem.href ?? comingSoonHref(subItem.key)
                      const subActive = isSubtreeItemActive(subItem, pathname)
                      // v5 §2.3 — "Floor progress" sits below its own
                      // 1px dashed rule, 6px above. Placement only —
                      // Brief 067 keeps its row styled exactly like
                      // every other live subtree item (not muted, not
                      // italic; v5 §10 already corrected that part).
                      const needsDashedRuleAbove = subItem.belowDashedRule && i > 0
                      return (
                        <div key={subItem.key}>
                          {needsDashedRuleAbove && <div className="nav-rail__subtree-dashed-rule" />}
                          <Link
                            href={subHref}
                            className={
                              subActive ? 'nav-rail__subtree-item nav-rail__subtree-item--active' : 'nav-rail__subtree-item'
                            }
                            aria-current={subActive ? 'page' : undefined}
                          >
                            <span>{t(subItem.labelKey)}</span>
                            {subItem.showBadge && delaysAndBlockersCount > 0 && (
                              <span className="nav-rail__subtree-badge">{delaysAndBlockersCount}</span>
                            )}
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

          const href = item.href ?? comingSoonHref(item.key)
          const isActive = isJourneyItemActive(item, pathname)
          return (
            <Link
              key={item.key}
              href={href}
              className={isActive ? 'nav-rail__item nav-rail__item--active' : 'nav-rail__item'}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="nav-rail__numeral">{item.numeral}</span>
              <span className="nav-rail__label">{label}</span>
            </Link>
          )
        })}
      </nav>

      {isManager && (
        <div className="nav-rail__admin">
          <button
            type="button"
            className="nav-rail__admin-toggle"
            aria-expanded={adminExpanded}
            onClick={toggleAdminExpanded}
          >
            <span>{t('navAdminRowLabel')}</span>
            {/* v5 §2.5's own literal spec: "'+' glyph at margin-left
                auto" — a plain character, not an icon. Flips to "−"
                expanded so the affordance still reads correctly open;
                v5 doesn't specify this half, a small, low-risk addition
                for legibility, not a deviation from what it DOES say. */}
            <span className="nav-rail__admin-glyph" aria-hidden="true">
              {adminExpanded ? '−' : '+'}
            </span>
          </button>
          {adminExpanded && (
            <div className="nav-rail__admin-list">
              {ADMIN_ITEMS.map((item) => {
                const href = item.href ?? comingSoonHref(item.key)
                const isActive = isAdminItemActive(item, pathname)
                return (
                  <Link
                    key={item.key}
                    href={href}
                    className={isActive ? 'nav-rail__admin-item nav-rail__admin-item--active' : 'nav-rail__admin-item'}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {t(item.labelKey)}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
