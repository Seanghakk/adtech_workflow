import Link from 'next/link'

/**
 * v5 §4.5 (Brief 070, build step 3) — the breadcrumb bar, one shared
 * component for every page that gets one. Server Component — purely
 * presentational, every label already resolved by the caller (each page
 * already has the translator and its own already-loaded data — a
 * project's SO number, a catalogue item's part number — so this
 * component does no fetching and no translation lookups of its own).
 *
 * DEVIATION FROM "APP-WIDE" (brief §2.3, stated plainly per that
 * section's own instruction): a page with zero ancestors would render a
 * one-item bar naming only itself, which is noise, not navigation — so
 * this renders NOTHING when `ancestors` is empty, rather than a bare
 * current-page label. See Brief 070's own Result doc for the full list
 * of which pages get a bar and which don't, and why.
 */
export function Breadcrumbs({
  ancestors,
  current,
}: {
  /** Empty array = no bar (see the deviation note above). */
  ancestors: { label: string; href: string }[]
  /** The current page's own label — --wf-ink, never a link (v5 §4.5). */
  current: string
}) {
  if (ancestors.length === 0) return null

  return (
    <nav className="wf-breadcrumbs" aria-label="Breadcrumb">
      {ancestors.map((crumb) => (
        <span key={crumb.href} className="wf-breadcrumbs__crumb">
          <Link href={crumb.href} className="wf-breadcrumbs__link">
            {crumb.label}
          </Link>
          <span className="wf-breadcrumbs__separator" aria-hidden="true">
            /
          </span>
        </span>
      ))}
      <span className="wf-breadcrumbs__current" aria-current="page">
        {current}
      </span>
    </nav>
  )
}
