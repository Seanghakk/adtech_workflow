import Link from 'next/link'
import type { ReactNode } from 'react'
import type { AgeBand } from '@/lib/age'
import type { Scope } from '@/lib/reporting/board'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

/**
 * Brief 080 — the one shared row/list shape for all six cross-project
 * Execution lists (addendum §2/§3/§5). A Server Component (no 'use
 * client': every prop is already resolved server-side; only the
 * scope tab links are interactive, and those are plain <Link>s, same
 * shape as the Board's own tabs).
 *
 * Split into a Header (title + scope tabs, rendered ONCE per page) and
 * Rows (the list itself, or the empty state) — split because QC
 * inspections (addendum §4) is the one track that renders TWO row
 * groups ("Waiting for inspection" / "Nothing waiting") under ONE
 * shared header, not two separate pages each with their own scope
 * control.
 *
 * AGE LEFT-RULE (addendum §3.1): a 5px left rule, four colours keyed off
 * the SAME four-band ladder every other screen uses (src/lib/age.ts) —
 * NOT the age-band-1..4 gradient the card ladder/exception board use
 * elsewhere; this is the addendum's own simpler four-value scheme
 * (transparent / rgba(32,30,29,.3) / #201e1d / #c62430), scoped to these
 * six lists via its own CSS classes (.cross-list__row--{band}) rather
 * than reusing --age-band-* (a different, already-spoken-for token set).
 */
export interface CrossListRow {
  projectId: string
  soLabel: string
  soIsPending: boolean
  projectName: string
  ageDays: number
  ageBand: AgeBand
  href: string
  /** The track-specific summary line(s) — each page renders its own. */
  summary: ReactNode
}

function scopeTabsFor(t: (key: DictionaryKey) => string): { value: Scope; label: string }[] {
  return [
    { value: 'mine', label: t('boardScopeMine') },
    { value: 'my-team', label: t('boardScopeMyTeam') },
    { value: 'everything', label: t('boardScopeEverything') },
  ]
}

export function scopeLabelFor(scope: Scope, t: (key: DictionaryKey) => string): string {
  return scopeTabsFor(t).find((s) => s.value === scope)!.label
}

export function CrossProjectListHeader({
  titleKey,
  scope,
  basePath,
  t,
}: {
  titleKey: DictionaryKey
  scope: Scope
  /** This route's own path (e.g. "/procurement") — scope tabs stay on
   *  this same page. */
  basePath: string
  t: (key: DictionaryKey) => string
}) {
  const scopeTabs = scopeTabsFor(t)
  return (
    <div className="cross-list__header">
      <h1 className="cross-list__title">{t(titleKey)}</h1>
      <div className="cross-list__scope">
        <span className="board__control-label">{t('boardScopeLabel')}</span>
        <div className="board__tabs">
          {scopeTabs.map((tab) => (
            <Link
              key={tab.value}
              href={`${basePath}?scope=${tab.value}`}
              className={tab.value === scope ? 'board__tab board__tab--active' : 'board__tab'}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export function CrossProjectListRows({
  scope,
  rows,
  t,
  emptyMineKey = 'crossListEmptyMine',
  loadError = false,
}: {
  scope: Scope
  rows: CrossListRow[]
  t: (key: DictionaryKey) => string
  emptyMineKey?: DictionaryKey
  /** Brief 094 §3.4 — set when the projects/members read behind `rows`
   *  failed. Without this, a failed read and a genuinely empty scope both
   *  render the exact same "No projects assigned to you" copy below —
   *  indistinguishable to whoever's looking at it. */
  loadError?: boolean
}) {
  const scopeLabel = scopeLabelFor(scope, t)

  if (loadError) {
    return (
      <div className="wf-empty-state-page">
        <div className="wf-empty-state">
          <p className="wf-empty-state__body" role="alert">
            {t('crossListLoadError')}
          </p>
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="wf-empty-state-page">
        <div className="wf-empty-state">
          {/* Addendum §5's two empty cases: (a) "No projects assigned to
              you" for Mine, (b) "Nothing in <scope>" naming what hasn't
              happened yet, for My team / Everything. No illustration, no
              advice copy — this app's shared v4 empty-state class, one
              sentence only. */}
          <p className="wf-empty-state__body">
            {scope === 'mine' ? t(emptyMineKey) : `${t('crossListEmptyScopePrefix')} ${scopeLabel}.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <ul className="cross-list__rows" aria-label={scopeLabel}>
      {rows.map((row) => (
        <li key={row.projectId} className={`cross-list__row cross-list__row--${row.ageBand}`}>
          <Link href={row.href} className="cross-list__row-link">
            <div className="cross-list__row-identity">
              <span className={row.soIsPending ? 'so-number so-number--pending' : 'so-number'}>{row.soLabel}</span>
              <span className="cross-list__row-project-name">{row.projectName}</span>
            </div>
            <div className="cross-list__row-summary">{row.summary}</div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** The common case (five of the six tracks): one header, one row list. */
export function CrossProjectList({
  titleKey,
  scope,
  basePath,
  rows,
  t,
  loadError = false,
}: {
  titleKey: DictionaryKey
  scope: Scope
  basePath: string
  rows: CrossListRow[]
  t: (key: DictionaryKey) => string
  loadError?: boolean
}) {
  return (
    <div className="cross-list">
      <CrossProjectListHeader titleKey={titleKey} scope={scope} basePath={basePath} t={t} />
      <CrossProjectListRows scope={scope} rows={rows} t={t} loadError={loadError} />
    </div>
  )
}
