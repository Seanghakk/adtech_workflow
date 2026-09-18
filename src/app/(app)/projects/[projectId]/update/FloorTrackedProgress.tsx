'use client'

import { useState, type ReactNode } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'

/**
 * Brief 024 §2.1-§2.3 — on a floor-tracked project, 6a's collapsed state
 * shows percent_calculated as read-only text plus an Override control.
 * Clicking Override reveals `children` — the SAME UpdateProgressForm
 * used everywhere else, unmodified — rather than a second mechanism.
 * Migration 008's bump_last_meaningful_movement() trigger already stamps
 * percent_override_at correctly for a project with floor rows the moment
 * that form's existing progress_updates insert lands, so no new server
 * action is needed here at all — this is UI state only.
 */
export function FloorTrackedProgress({
  percentCalculated,
  overrideActive,
  children,
}: {
  percentCalculated: number | null
  overrideActive: boolean
  children: ReactNode
}) {
  const { t } = useLanguage()
  const [overriding, setOverriding] = useState(false)

  if (overriding) {
    return (
      <div className="floor-tracked-progress">
        {children}
        <button type="button" className="btn btn--ghost" onClick={() => setOverriding(false)}>
          {t('floorBreakdownOverrideCancel')}
        </button>
      </div>
    )
  }

  return (
    <div className="update-card floor-tracked-progress__collapsed">
      <div className="update-card__figure">
        <div className="update-card__figure-label">
          {overrideActive ? t('floorBreakdownOverrideActive') : t('floorBreakdownCalculated')}
        </div>
        <div className="update-card__figure-value update-card__figure-value--muted">
          {percentCalculated ?? '—'}
          {percentCalculated != null && <span className="update-card__percent-sign">%</span>}
        </div>
      </div>
      <button type="button" className="btn btn--outline" onClick={() => setOverriding(true)}>
        {t('floorBreakdownOverride')}
      </button>
    </div>
  )
}
