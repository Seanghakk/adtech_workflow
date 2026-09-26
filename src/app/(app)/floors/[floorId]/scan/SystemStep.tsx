'use client'

/**
 * Brief 106b — §12.2a, the system step (mockup 18c).
 *
 * Two constraints from Brief 106 §4 shape every line of this:
 *   §4.1 THE PRINTED QR LABELS ARE PER FLOOR AND ALREADY IN THE FIELD.
 *        The label, the /f/[id] route and the scan are unchanged. The scan
 *        resolves the FLOOR; this resolves the system.
 *   §4.2 CREWS SWITCH SYSTEMS DURING ONE VISIT, so "Change system" is a
 *        control on the page and NEVER a rescan.
 *
 * §4.3 is why this sits BELOW the floor header: the first question after a
 * scan is "did I scan the right label" — B1 beside B2 on a core wall is
 * exactly where that goes wrong. The system is named clearly, and second.
 */
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

export interface PhoneSystemRow {
  id: string
  name: string
  coversThisFloor: boolean
  coversLabels: string[]
  /** §12.2a — "its state in words": "1 of 5 done · Vuthy Long · 3d on
   *  second fix", or "Not started". */
  stateLine: string
  awaitingQc: number
}

/** Remembered for the session only — §12.2a. Not a stored preference: a
 *  crew's system is a fact about this visit, not about them. */
const SESSION_KEY = 'wf.phone.system'

export function SystemStep({
  floorLabel,
  systems,
  chosenId,
  picName,
  isQcMember,
  wrongFloor,
}: {
  floorLabel: string
  systems: PhoneSystemRow[]
  chosenId: string | null
  picName: string | null
  isQcMember: boolean
  /** §12.2a — a remembered system that does not cover this floor. */
  wrongFloor: { systemName: string; coversLabels: string[] } | null
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const covering = systems.filter((s) => s.coversThisFloor)
  const notOnFloor = systems.filter((s) => !s.coversThisFloor && s.coversLabels.length > 0)

  const [open, setOpen] = useState(chosenId === null)
  const chosen = covering.find((s) => s.id === chosenId) ?? null

  // §12.2a — "?system= with replaceState and remembered for the session."
  // replaceState, not push: changing system is not a place you go back to,
  // and a back button that walked through four systems would be noise.
  useEffect(() => {
    if (!chosenId) return
    try {
      sessionStorage.setItem(SESSION_KEY, chosenId)
    } catch {
      // Private mode or blocked storage. The URL still carries the choice,
      // so this is a convenience, never the source of truth.
    }
  }, [chosenId])

  function choose(id: string) {
    try {
      sessionStorage.setItem(SESSION_KEY, id)
    } catch {
      /* see above */
    }
    setOpen(false)
    // router.replace, not push: changing system is not a place you go back
    // to, and a back button that walked through four systems would be
    // noise. It re-renders the server component so the rows below follow
    // the new system — which is a re-render, NOT a rescan (§4.2).
    const next = new URLSearchParams(search.toString())
    next.set('system', id)
    router.replace(`${pathname}?${next.toString()}`)
  }

  // §12.2a — no system covers this floor at all.
  if (covering.length === 0) {
    return (
      <div className="wf-empty-state-card phone-system__empty">
        <div className="wf-empty-state-card__headline">
          {t('phoneSystemNoneHeadlinePrefix')} {floorLabel} {t('phoneSystemNoneHeadlineSuffix')}
        </div>
        <p className="wf-empty-state-card__body">
          {t('phoneSystemNoneBodyPrefix')} {picName ?? ''} {t('phoneSystemNoneBodySuffix')}
        </p>
      </div>
    )
  }

  // §12.2a — a one-system project shows the band without "Change system".
  const onlySystem = systems.length === 1

  if (!open && chosen) {
    return (
      <div className="phone-system-band">
        <div>
          <div className="phone-system-band__kicker">{t('phoneSystemBandKicker')}</div>
          <div className="phone-system-band__name">{chosen.name}</div>
          <div className="phone-system-band__count">
            {onlySystem
              ? t('phoneSystemOnlyOnProject')
              : `${covering.findIndex((s) => s.id === chosen.id) + 1} ${t('phoneSystemOfPrefix')} ${covering.length} ${t('phoneSystemOnFloorSuffix')} ${floorLabel}`}
          </div>
        </div>
        {/* §12.2a — present whenever the floor has more than one system. It
            reopens the picker and never needs a rescan. */}
        {covering.length > 1 && (
          <button type="button" className="phone-system-band__change" onClick={() => setOpen(true)}>
            {t('phoneSystemChange')}
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="phone-system-picker">
      {/* §12.2a — a remembered system that is not on this floor is EXPLAINED,
          not silently reset. Not amber and not red: nothing is late. */}
      {wrongFloor && (
        <div className="phone-system-picker__wrong-floor">
          <strong>{wrongFloor.systemName}</strong> {t('phoneSystemWrongFloorMiddle')} {floorLabel}.{' '}
          {t('phoneSystemWrongFloorCovers')} {wrongFloor.coversLabels.join(', ')}.{' '}
          {t('phoneSystemWrongFloorChoose')}
        </div>
      )}

      <div className="phone-system-picker__kicker">{t('phoneSystemPickerKicker')}</div>
      <p className="phone-system-picker__intro">
        {floorLabel} {t('phoneSystemPickerHasPrefix')} {covering.length}{' '}
        {t('phoneSystemPickerHasSuffix')}
      </p>

      <ul className="phone-system-picker__list">
        {covering.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`phone-system-picker__row${
                isQcMember && s.awaitingQc > 0 ? ' phone-system-picker__row--awaiting' : ''
              }`}
              onClick={() => choose(s.id)}
            >
              <span className="phone-system-picker__name">{s.name}</span>
              <span className="phone-system-picker__state">{s.stateLine}</span>
              <span className="phone-system-picker__chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* §12.2a — read-only, never tappable. A crew looking for a system
          that is not here needs to know it exists and where it is, not a
          dead control. */}
      {notOnFloor.length > 0 && (
        <div className="phone-system-picker__not-on">
          <div className="phone-system-picker__not-on-kicker">
            {t('phoneSystemNotOnPrefix')} {floorLabel}
          </div>
          {notOnFloor.map((s) => (
            <div key={s.id} className="phone-system-picker__not-on-row">
              {s.name} — {t('phoneSystemNotOnCovers')} {s.coversLabels.join(', ')}
            </div>
          ))}
          {picName && (
            <p className="phone-system-picker__pic-line">
              {t('phoneSystemPicLinePrefix')} {picName} {t('phoneSystemPicLineSuffix')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
