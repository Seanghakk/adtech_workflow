import type { DictionaryKey } from '@/lib/i18n/dictionary'

/**
 * Brief 070 (v5 §4.5/§8 step 3) — the small set of rail-level ancestor
 * crumbs every per-item breadcrumb reuses (Board, Execution, Admin,
 * Triage). Centralized here, keyed off the SAME DictionaryKeys the rail
 * itself renders (src/lib/nav.ts), so a crumb's label can never drift
 * from what the rail calls that same destination.
 *
 * DERIVATION, not invention (brief §2.2's own instruction) — every page
 * below was checked against nav.ts + actual route nesting before being
 * assigned an ancestor; see Brief 070's own Result doc for the full
 * page -> breadcrumb table and the reasoning behind each one. Short
 * version of the two judgment calls that aren't obvious from the code
 * alone:
 *
 * BOARD is not one of the seven rail items (nav.ts's own header already
 * says so) but IS the correct top ancestor for every project page, per
 * this brief's own expected shape ("Board / AD9001-26S / ..."). navBoard
 * was flagged UNUSED in the dictionary since Brief 064's rail rewrite
 * dropped the old flat nav's own Board entry — it is finally consumed
 * again here, for exactly the purpose that comment anticipated.
 *
 * EXECUTION and ADMIN are each a genuine multi-child category (Execution
 * has 9 subtree items; Admin has 8) — real parent/child relationships,
 * so their own sub-pages get "Execution / X" / "Admin / X" crumbs.
 * REQUEST/TRIAGE/SO (rail items 1-3) are NOT: each is a single deferred
 * item whose real page (/requests/new, /triage, /awaiting-so) simply IS
 * what that item means, not a category containing children — so those
 * three pages get ZERO ancestors (no bar), and are never used AS an
 * ancestor for anything else EXCEPT Triage, which the request detail
 * page (/requests/[requestId]) genuinely is reached from (triage's own
 * row links there) and links back to directly, not via a stub.
 *
 * Execution and Admin themselves have no real page of their own to be
 * "current" on — clicking either crumb lands on /soon/execution or
 * /soon/admin (the SAME shared stub mechanism every other undefined
 * rail destination already uses, not a new mechanism invented for
 * breadcrumbs specifically). Both of those stub pages are themselves
 * 0-ancestor (no bar) — they ARE the top of their own branch.
 */
export interface AncestorCrumb {
  label: DictionaryKey
  href: string
}

export const CRUMB_BOARD: AncestorCrumb = { label: 'navBoard', href: '/' }
export const CRUMB_EXECUTION: AncestorCrumb = { label: 'navJourneyExecution', href: '/soon/execution' }
export const CRUMB_ADMIN: AncestorCrumb = { label: 'navAdminRowLabel', href: '/soon/admin' }
export const CRUMB_TRIAGE: AncestorCrumb = { label: 'navJourneyTriage', href: '/triage' }
