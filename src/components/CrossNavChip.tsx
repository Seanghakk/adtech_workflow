import Link from 'next/link'

/**
 * v5 §5 (Brief 070, build step 3) — "Any record that references another
 * stage's record links straight to it." ONE shared component, per the
 * brief's own explicit scope instruction, converting only links that
 * already exist today (a variation's own link to its project, currently)
 * — never used to build a new cross-link that isn't already there. See
 * Brief 070's own Result doc for the full inventory of what was
 * converted and what was found-but-not-built.
 *
 * --wf-blue-edge (v5's own border token for this chip) does not exist
 * anywhere in globals.css — checked directly, same gap class Brief 068
 * found for --wf-lh-mixed. Uses --navy-tint-border instead: the nearest
 * existing token, already paired with --wf-blue-tint everywhere else in
 * this file (.stream-tag's own identical tint-field-plus-border shape),
 * not an invented value.
 */
export function CrossNavChip({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="wf-cross-nav-chip">
      {label}
    </Link>
  )
}
