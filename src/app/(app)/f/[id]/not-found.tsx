import Link from 'next/link'
import type { Metadata } from 'next'
import { getServerTranslator } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Label not found — ADTECH Workflow Tracker',
}

/**
 * Brief 100 route walk, finding 2 — the scanned-label case, which is the
 * one that happens to someone standing on a floor holding a phone.
 *
 * /f/[id] calls notFound() for a code that is not a uuid (a scuffed or
 * torn sticker, checked before the database is ever touched) and for a
 * uuid with no floor behind it (renamed, merged, removed, or not visible
 * to this person under RLS). Brief 058's own header set the standard —
 * "a worn/misread label must fail gracefully" — and it did not crash,
 * but the framework's "404 This page could not be found." told a site
 * worker nothing about what had happened or who could fix it.
 *
 * So this screen says the sticker is probably out of date, says it is
 * not their fault, suggests re-scanning if it looks damaged, and names
 * who to ask: the project's PIC, who runs Project setup, which is where
 * the floor list lives and where labels are printed.
 *
 * It does NOT try to name the project or the floor. Nothing was
 * resolved — that is the entire situation — and guessing at which
 * project a dead code belonged to is exactly the kind of invention this
 * brief exists to remove.
 */
export default async function FloorLabelNotFound() {
  const t = await getServerTranslator()

  return (
    <div className="wf-empty-state-page">
      <div className="wf-empty-state">
        <h1 className="wf-empty-state__headline">{t('floorLabelNotFoundHeadline')}</h1>
        <p className="wf-empty-state__body">{t('floorLabelNotFoundBody')}</p>
        <p className="wf-empty-state__body">{t('floorLabelNotFoundRetry')}</p>
        <p className="wf-empty-state__body">{t('floorLabelNotFoundAsk')}</p>
        <div className="wf-empty-state__actions">
          <Link href="/" className="btn btn--primary">
            {t('comingSoonBackToBoard')}
          </Link>
        </div>
      </div>
    </div>
  )
}
