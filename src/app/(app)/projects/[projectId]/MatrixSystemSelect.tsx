'use client'

/**
 * Brief 106b — §11.5's 390px system selector.
 *
 * "390px: one system at a time behind a native select at 56px ('Access
 * control — GF–L26'), five columns, 16px cells; ?system=<id> carries the
 * choice. The only place in the app where a system selector replaces the
 * side-by-side view."
 *
 * That exception is stated in the design because a selector is otherwise
 * exactly what §11.5 rejects: above 390px it "hides three quarters of the
 * project and turns one pattern into four page views". On a phone there is
 * no room for the pattern at all, so the trade goes the other way.
 *
 * Both the select and every group are in the markup, and CSS shows one: a
 * media query cannot swap one element for another, and choosing in JS by
 * window width guesses wrong on the first paint.
 */
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export function MatrixSystemSelect({
  systems,
  selectedId,
}: {
  systems: { systemId: string; systemName: string; caption: string }[]
  selectedId: string
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()

  return (
    <label className="floor-matrix__system-select">
      <span className="wf-visually-hidden">{t('floorMatrixSystemSelectLabel')}</span>
      <select
        value={selectedId}
        onChange={(e) => {
          const next = new URLSearchParams(search.toString())
          next.set('system', e.target.value)
          // replace, not push: switching system is not a place to go back
          // to, and the matrix keeps its scroll position.
          router.replace(`${pathname}?${next.toString()}`)
        }}
      >
        {systems.map((s) => (
          <option key={s.systemId} value={s.systemId}>
            {s.systemName} — {s.caption}
          </option>
        ))}
      </select>
    </label>
  )
}
