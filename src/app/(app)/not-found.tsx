import Link from 'next/link'
import type { Metadata } from 'next'
import { getServerTranslator } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Not found — ADTECH Workflow Tracker',
}

/**
 * Brief 100 route walk, finding 2 — the app's own not-found screen.
 *
 * Every project-scoped route in this app calls next/navigation's plain
 * notFound() for "missing, or not visible under RLS, and this route is
 * not trying to tell those apart". That convention is right and is not
 * changed here. What was missing was a screen for it: the person read
 * the framework's default, "404 This page could not be found." — a
 * string in no particular voice, offering nothing to do next.
 *
 * Living at the (app) route group's root means this renders INSIDE the
 * app shell, so the rail and every other route stay one click away. It
 * covers notFound() thrown anywhere under (app) that has no more
 * specific not-found of its own — /f/[id] has one, because a scanned
 * label is a different situation from a stale link.
 */
export default async function AppNotFound() {
  const t = await getServerTranslator()

  return (
    <div className="wf-empty-state-page">
      <div className="wf-empty-state">
        <h1 className="wf-empty-state__headline">{t('notFoundHeadline')}</h1>
        <p className="wf-empty-state__body">{t('notFoundBody')}</p>
        <div className="wf-empty-state__actions">
          <Link href="/" className="btn btn--primary">
            {t('comingSoonBackToBoard')}
          </Link>
        </div>
      </div>
    </div>
  )
}
