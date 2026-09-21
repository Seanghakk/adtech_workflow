import Link from 'next/link'
import type { Metadata } from 'next'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_ADMIN, CRUMB_EXECUTION } from '@/lib/breadcrumbs'

export const metadata: Metadata = {
  title: 'Not built yet — ADTECH Workflow Tracker',
}

interface ComingSoonEntry {
  headlineKey: DictionaryKey
  bodyKey: DictionaryKey
  /** A second, real action alongside "Back to board" — only items 1-3
   *  get one, since their real screen actually exists (see nav.ts's own
   *  header for the full reasoning). */
  action?: { labelKey: DictionaryKey; href: string }
  /** Brief 070 §2.2/§2.3 — set ONLY for a page with a real ancestor
   *  (an Execution subtree item or an Admin item); `crumbLabel` is the
   *  short rail-style label (distinct from `headlineKey`'s longer
   *  sentence) used as the breadcrumb's own current-page text. Request/
   *  Triage/SO/Kickoff/Execution/Handover/Inventory/Admin themselves
   *  are each top-level (0 ancestors) and intentionally have neither —
   *  see src/lib/breadcrumbs.ts's own header for why. */
  breadcrumb?: { ancestor: typeof CRUMB_EXECUTION | typeof CRUMB_ADMIN; crumbLabel: DictionaryKey }
}

const ENTRIES: Record<string, ComingSoonEntry> = {
  request: {
    headlineKey: 'comingSoonRequestHeadline',
    bodyKey: 'comingSoonRequestBody',
    action: { labelKey: 'comingSoonRequestAction', href: '/requests/new' },
  },
  triage: {
    headlineKey: 'comingSoonTriageHeadline',
    bodyKey: 'comingSoonTriageBody',
    action: { labelKey: 'comingSoonTriageAction', href: '/triage' },
  },
  so: {
    headlineKey: 'comingSoonSoHeadline',
    bodyKey: 'comingSoonSoBody',
    action: { labelKey: 'comingSoonSoAction', href: '/awaiting-so' },
  },
  kickoff: { headlineKey: 'comingSoonKickoffHeadline', bodyKey: 'comingSoonKickoffBody' },
  execution: { headlineKey: 'comingSoonExecutionHeadline', bodyKey: 'comingSoonExecutionBody' },
  handover: { headlineKey: 'comingSoonHandoverHeadline', bodyKey: 'comingSoonHandoverBody' },
  inventory: { headlineKey: 'comingSoonInventoryHeadline', bodyKey: 'comingSoonInventoryBody' },
  floors: {
    headlineKey: 'comingSoonFloorsHeadline',
    bodyKey: 'comingSoonFloorsBody',
    breadcrumb: { ancestor: CRUMB_ADMIN, crumbLabel: 'navAdminFloors' },
  },
  'so-registers': {
    headlineKey: 'comingSoonSoRegistersHeadline',
    bodyKey: 'comingSoonSoRegistersBody',
    breadcrumb: { ancestor: CRUMB_ADMIN, crumbLabel: 'navAdminSoRegisters' },
  },
  // Brief 067 §3 — the Execution subtree's own case (B)/(C) items (see
  // nav.ts's own header for the full A/B/C classification). "execution"
  // itself (above) is UNREACHABLE from the rail as of this brief — item
  // 5's own row is now a subtree toggle, not a link (see AppSidebar.tsx)
  // — kept here regardless, harmless and still directly navigable.
  'shop-drawing': {
    headlineKey: 'comingSoonShopDrawingHeadline',
    bodyKey: 'comingSoonShopDrawingBody',
    breadcrumb: { ancestor: CRUMB_EXECUTION, crumbLabel: 'navExecShopDrawing' },
  },
  procurement: {
    headlineKey: 'comingSoonProcurementHeadline',
    bodyKey: 'comingSoonProcurementBody',
    breadcrumb: { ancestor: CRUMB_EXECUTION, crumbLabel: 'navExecProcurement' },
  },
  'floor-progress': {
    headlineKey: 'comingSoonFloorProgressHeadline',
    bodyKey: 'comingSoonFloorProgressBody',
    breadcrumb: { ancestor: CRUMB_EXECUTION, crumbLabel: 'navExecFloorProgress' },
  },
  overview: {
    headlineKey: 'comingSoonOverviewHeadline',
    bodyKey: 'comingSoonOverviewBody',
    breadcrumb: { ancestor: CRUMB_EXECUTION, crumbLabel: 'navExecOverview' },
  },
  installation: {
    headlineKey: 'comingSoonInstallationHeadline',
    bodyKey: 'comingSoonInstallationBody',
    breadcrumb: { ancestor: CRUMB_EXECUTION, crumbLabel: 'navExecInstallation' },
  },
  'testing-commissioning': {
    headlineKey: 'comingSoonTestingCommissioningHeadline',
    bodyKey: 'comingSoonTestingCommissioningBody',
    breadcrumb: { ancestor: CRUMB_EXECUTION, crumbLabel: 'navExecTestingCommissioning' },
  },
  'qc-inspections': {
    headlineKey: 'comingSoonQcInspectionsHeadline',
    bodyKey: 'comingSoonQcInspectionsBody',
    breadcrumb: { ancestor: CRUMB_EXECUTION, crumbLabel: 'navExecQcInspections' },
  },
  // Brief 070 §2.2 — "Admin" needed a real, honest destination to be a
  // valid breadcrumb ancestor link for its own 8 children (same
  // reasoning that already justifies every other key above); not
  // reachable from the rail itself (Admin is a collapsible, not a
  // link) but directly navigable, same as 'execution' above. No
  // `breadcrumb` of its own — it IS the top of that branch (0 ancestors).
  admin: { headlineKey: 'comingSoonAdminHeadline', bodyKey: 'comingSoonAdminBody' },
}

/**
 * Brief 064 §2 / v4's own empty-state vocabulary (part 5) — the shared
 * landing every deferred rail item (Request/Triage/SO) and every
 * undefined "live" item (Kickoff/Execution/Handover/Inventory, and
 * Admin's Floors-and-zones/SO-registers) lands on when clicked. One
 * component, one route, per-item copy — never a dead link, never a
 * disabled row, per v5 §2.2's own explicit requirement.
 *
 * An unrecognized key (a typo, or a future stub not yet added to
 * ENTRIES) falls back to a generic "nothing here yet" rather than a
 * 404 — this route's whole reason to exist is to never be a dead end.
 */
export default async function ComingSoonPage({ params }: PageProps<'/soon/[key]'>) {
  const { key } = await params
  const t = await getServerTranslator()
  const entry = ENTRIES[key]

  const headline = entry ? t(entry.headlineKey) : t('comingSoonFallbackHeadline')
  const body = entry ? t(entry.bodyKey) : t('comingSoonFallbackBody')

  return (
    <>
      {entry?.breadcrumb && (
        <Breadcrumbs
          ancestors={[{ label: t(entry.breadcrumb.ancestor.label), href: entry.breadcrumb.ancestor.href }]}
          current={t(entry.breadcrumb.crumbLabel)}
        />
      )}
      <div className="wf-empty-state-page">
        <div className="wf-empty-state">
          <h1 className="wf-empty-state__headline">{headline}</h1>
          <p className="wf-empty-state__body">{body}</p>
          <div className="wf-empty-state__actions">
            {entry?.action && (
              <Link href={entry.action.href} className="btn btn--primary">
                {t(entry.action.labelKey)}
              </Link>
            )}
            {/* Brief 070 §3 — "Back to board" is KEPT, not removed: for
                every key here, the breadcrumb (when there is one) only
                reaches as far as Execution or Admin, never Board itself —
                not an equivalent path, so this stays per the brief's own
                rule (c). See Brief 070's own Result doc. */}
            <Link href="/" className="btn btn--outline">
              {t('comingSoonBackToBoard')}
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
