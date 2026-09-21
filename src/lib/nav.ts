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
 *
 * ---------------------------------------------------------------------
 * BRIEF 067 — the Execution subtree, the two renames, and three Admin
 * additions (Brief 066's own findings). Superseding the "no home"
 * paragraph above for /catalogue and /sales/assign specifically — both
 * now have one, in Admin. /sales itself gets a placeholder Admin home
 * too (see ADMIN_ITEMS's own comment).
 *
 * RENAMES (v5 §3): /exceptions -> /delays-and-blockers, /load ->
 * /who-is-on-what. Old paths permanently redirect (next.config.ts).
 *
 * EXECUTION SUBTREE (v5 §2.3) — a GENUINE DESIGN GAP, reported not
 * papered over: the rail is global (no project in context), but most
 * subtree items name PER-PROJECT screens. v5's own §2.3 correction
 * (made the same day this rail shipped) gave "Floor progress" a
 * per-project route as if the global rail could link to it directly —
 * right that the matrix is live, wrong to imply a global link can reach
 * it. Classified all nine items below against the actual codebase, not
 * v5's own assumption, and reported the classification rather than
 * improvising a project-picker or a cross-project list view neither
 * this brief nor v5 asked for:
 *
 *   (A) HAS A REAL GLOBAL DESTINATION — linked directly:
 *       Delays & blockers (/delays-and-blockers), Who is on what
 *       (/who-is-on-what). Both confirmed cross-project by nature, not
 *       assumed from their names.
 *
 *   (B) PER-PROJECT ONLY — the screen is real, but only inside a
 *       project; stubbed (/soon/[key]), NOT linked to an arbitrary
 *       project, NOT given an invented project picker:
 *       Shop drawing (/projects/[projectId]/shop-drawing-boq),
 *       Procurement (/projects/[projectId]/procurement),
 *       Floor progress (/projects/[projectId]?view=matrix — kept below
 *       its own 1px dashed rule per v5 §2.3, styled as a normal live
 *       row, NOT muted/italic — v5 §10 already corrected that part;
 *       this brief only changes where the link goes, not how the row
 *       looks).
 *
 *   (C) NO SCREEN AT ALL — same stub treatment as (B):
 *       Overview (build step 7, blocked on v5 §9 open item 1 — case
 *       (C) by definition, per this brief's own §3),
 *       Installation, Testing & commissioning, QC inspections (all
 *       three: checked directly, no dedicated route exists anywhere,
 *       global or per-project — Installation/TNC sub-stage tracking
 *       and QC recording, Brief 063, all live only as SECTIONS inside
 *       /projects/[projectId]/update's own floor breakdown panel, never
 *       promoted to a route of their own).
 *
 * How a global rail should reach a per-project screen is explicitly a
 * design question for Claude Design (this brief's own §3), not decided
 * here — the (B)/(C) list above is the input that question needs.
 *
 * ADMIN ADDITIONS (Brief 066 §(a)/(b), decided by Seanghakk 20 Sep
 * 2026): "Parts catalogue" (/catalogue) — reference data, same kind of
 * thing as Lookup tables, confirmed NOT "Inventory" (rail item 7,
 * Brief 066 §(c) — no quantity/location/project-tie exists anywhere on
 * catalogue_items). "Client owners" (/sales/assign) — a real manager/
 * admin configuration action, exactly what Admin already holds. "Sales"
 * (/sales) — an imperfect fit (Brief 066 §(a): a maintenance-contract
 * monitoring view, not an admin/config screen), placed here anyway as
 * a placeholder home so it isn't permanently unreachable, explicitly
 * flagged for revisiting once the sales front end is built.
 *
 * Brief 067 §4 originally gated all three of the above behind this
 * list's OWN blanket 'manager' visibility rule ("follow whatever Admin
 * already does for its other entries") — correct instruction-following,
 * wrong outcome: it silently hid /sales from Sales Engineers (role
 * 'member', not manager) and /catalogue from every non-manager, both of
 * which were visible to those exact users in the pre-064 flat nav. Brief
 * 068 §2 fixed this: each ADMIN_ITEMS entry now carries its own `access`
 * restored from git history (see ADMIN_ITEMS's own comments below), and
 * the Admin section itself (AppSidebar.tsx) now renders whenever the
 * current member can see at least one entry, not only for a manager.
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

/** Brief 068 §2 — Admin is a HOME for these links, not an access policy:
 *  each entry's own visibility must match what it was BEFORE Brief 064
 *  removed the old flat nav, not a blanket rule inherited from whichever
 *  section it now sits in. 'manager' is the pre-existing rule every
 *  original Admin entry (lookups/notifications/users/floors/so-registers)
 *  already had and keeps unchanged. 'all' and 'sales-or-manager' exist
 *  ONLY because Brief 067 §4 wrongly gave catalogue/sales the SAME
 *  'manager' rule as everything else in the list they were dropped into
 *  — see ADMIN_ITEMS's own comments below for the evidence each rule
 *  is restored from. */
export type AdminAccess = 'all' | 'manager' | 'sales-or-manager'

export interface AdminItem {
  key: string
  labelKey: DictionaryKey
  href: string | null
  access: AdminAccess
}

export const ADMIN_ITEMS: AdminItem[] = [
  { key: 'lookups', labelKey: 'navLookups', href: '/lookups', access: 'manager' },
  { key: 'notifications', labelKey: 'navNotifications', href: '/notifications', access: 'manager' },
  { key: 'users', labelKey: 'navUsers', href: '/users', access: 'manager' },
  { key: 'floors', labelKey: 'navAdminFloors', href: null, access: 'manager' },
  { key: 'so-registers', labelKey: 'navAdminSoRegisters', href: null, access: 'manager' },
  // Brief 068 §2 — restored, not invented: git show <pre-064 commit>:
  // src/lib/nav.ts had `{ key: 'catalogue', ..., access: 'all' }` and
  // `{ key: 'sales', ..., access: 'sales' }` in the old flat NAV_ENTRIES
  // list (canSeeNavEntry there: 'all' -> true unconditionally, 'sales'
  // -> isSalesTeamMember). Brief 067 §4 put both behind this list's own
  // blanket 'manager' rule instead — a real regression it caused, not a
  // deliberate access change (route-level access to /catalogue and
  // /sales was never touched either brief, only whether the LINK shows).
  // 'sales-or-manager' extends the old 'sales' rule rather than
  // reproducing it exactly: a manager/admin who is not sales-team-tagged
  // could see this link before ONLY because the old nav had no
  // manager-only items at all above it forcing a choice — the pre-064
  // nav simply never hid ANY entry from a manager (see canSeeNavEntry:
  // 'sales' checked ONLY access.isSales, but every manager was ALSO
  // isManager-true and none of the other pre-064 entries required
  // isSales specifically) — so a manager who is not on the sales team
  // never actually lost this link before either. Extending 'sales' to
  // 'sales-or-manager' here preserves that same "managers keep every
  // link" outcome under the new per-item model instead of narrowing it.
  { key: 'catalogue', labelKey: 'navAdminCatalogue', href: '/catalogue', access: 'all' },
  { key: 'sales', labelKey: 'navAdminSales', href: '/sales', access: 'sales-or-manager' },
  // Client owners (/sales/assign) has NO pre-064 nav entry at all — it's
  // a genuinely new link (Brief 066's own finding), not a restoration.
  // canAssignClientOwners is role==='manager'||'admin' — identical in
  // substance to isManagerOrAdmin (src/lib/auth/roles.ts), confirmed by
  // reading both; 'manager' here matches that exactly, so this one was
  // already correct as built and needed no change.
  { key: 'client-owners', labelKey: 'navAdminClientOwners', href: '/sales/assign', access: 'manager' },
]

/** Brief 068 §2c — which per-item rule an AdminItem needs. `isManager`
 *  covers every 'manager'-gated entry (and, per the comment above, is
 *  ALSO the manager half of 'sales-or-manager'); `isSalesTeamMember`
 *  covers the sales half. */
export function canSeeAdminItem(item: AdminItem, access: { isManager: boolean; isSalesTeamMember: boolean }): boolean {
  if (item.access === 'all') return true
  if (item.access === 'sales-or-manager') return access.isSalesTeamMember || access.isManager
  return access.isManager
}

export type SubtreeCase = 'A' | 'B' | 'C'

export interface SubtreeItem {
  key: string
  labelKey: DictionaryKey
  /** null for case B/C — see this file's own header for the full A/B/C
   *  classification and why. */
  href: string | null
  case: SubtreeCase
  /** "Delays & blockers" only, v5 §2.3. */
  showBadge?: boolean
  /** "Floor progress" only — v5 §2.3's own 1px dashed rule sits above
   *  just this one item. */
  belowDashedRule?: boolean
}

/** v5 §2.3's own nine items, in its own order. See this file's header
 *  for the full (A)/(B)/(C) reasoning behind each href. */
export const EXECUTION_SUBTREE_ITEMS: SubtreeItem[] = [
  { key: 'overview', labelKey: 'navExecOverview', href: null, case: 'C' },
  { key: 'shop-drawing', labelKey: 'navExecShopDrawing', href: null, case: 'B' },
  { key: 'procurement', labelKey: 'navExecProcurement', href: null, case: 'B' },
  { key: 'installation', labelKey: 'navExecInstallation', href: null, case: 'C' },
  { key: 'testing-commissioning', labelKey: 'navExecTestingCommissioning', href: null, case: 'C' },
  { key: 'qc-inspections', labelKey: 'navExecQcInspections', href: null, case: 'C' },
  { key: 'delays-and-blockers', labelKey: 'navExceptions', href: '/delays-and-blockers', case: 'A', showBadge: true },
  { key: 'who-is-on-what', labelKey: 'navLoad', href: '/who-is-on-what', case: 'A' },
  { key: 'floor-progress', labelKey: 'navExecFloorProgress', href: null, case: 'B', belowDashedRule: true },
]

export function isSubtreeItemActive(item: SubtreeItem, pathname: string): boolean {
  if (!item.href) return false
  return isActiveHref(item.href, pathname)
}

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
