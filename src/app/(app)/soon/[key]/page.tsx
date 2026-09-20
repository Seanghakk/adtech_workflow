import Link from 'next/link'
import type { Metadata } from 'next'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { getServerTranslator } from '@/lib/i18n/server'

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
  floors: { headlineKey: 'comingSoonFloorsHeadline', bodyKey: 'comingSoonFloorsBody' },
  'so-registers': { headlineKey: 'comingSoonSoRegistersHeadline', bodyKey: 'comingSoonSoRegistersBody' },
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
          <Link href="/" className="btn btn--outline">
            {t('comingSoonBackToBoard')}
          </Link>
        </div>
      </div>
    </div>
  )
}
