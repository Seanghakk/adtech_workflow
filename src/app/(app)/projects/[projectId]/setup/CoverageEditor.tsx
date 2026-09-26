'use client'

/**
 * Brief 106b — §6.5's "Floors covered" cell and its inline editor
 * (mockups 18g, 18h).
 *
 * Coverage decides what the app can record at all: a progress cell cannot
 * exist outside it. So this screen has one job beyond editing — it has to
 * make the consequence of REMOVING a floor visible before it happens, which
 * is what the amber warning is for. It warns and does not block, per §6.2
 * item 2, because the person doing this knows something the app does not.
 *
 * The vocabulary is §6.1's administration one, deliberately: ink and white,
 * no blue, no age. Coverage is configuration, not work, and colouring it
 * like work would put it in the same visual language as a stalled floor.
 */
import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { coverageShape, removalWarnings, type CoverageFloor } from '@/lib/progressPerSystem/coverage'
import { saveSystemCoverage } from './coverage-actions'
import { coverageInitialState } from './coverage-state'

export interface CoverageFloorRow extends CoverageFloor {
  towerLabel: string | null
}

/** §6.5's cell: "All 30 floors" / "27 of 30 · GF to L26" / "3 of 30 · B3, B2, B1". */
export function CoverageSummary({
  floors,
  coveredIds,
}: {
  floors: CoverageFloorRow[]
  coveredIds: string[]
}) {
  const { t } = useLanguage()
  const shape = coverageShape(floors, coveredIds)

  switch (shape.kind) {
    case 'none':
      return <span className="setup-coverage__none">{t('setupCoverageNoFloors')}</span>
    case 'all':
      return (
        <span>
          {t('setupCoverageAllPrefix')} {shape.total} {t('setupCoverageAllSuffix')}
        </span>
      )
    case 'range':
      return (
        <span>
          {shape.covered} {t('setupCoverageOf')} {shape.total}
          {' · '}
          {shape.from} {t('setupCoverageRangeTo')} {shape.to}
        </span>
      )
    case 'named':
      return (
        <span>
          {shape.covered} {t('setupCoverageOf')} {shape.total}
          {' · '}
          {shape.labels.join(', ')}
        </span>
      )
    case 'count':
      // §6.5 gives no wording for scattered coverage above five. A bare
      // count is stated rather than a fourth sentence invented; flagged.
      return (
        <span>
          {shape.covered} {t('setupCoverageOf')} {shape.total}
        </span>
      )
  }
}

export function CoverageEditor({
  projectId,
  systemId,
  systemName,
  floors,
  coveredIds,
  recordedByFloor,
  onDone,
}: {
  projectId: string
  systemId: string
  systemName: string
  floors: CoverageFloorRow[]
  coveredIds: string[]
  /** How many sub-stages have MOVED on each floor, for this system. */
  recordedByFloor: Map<string, number>
  onDone: () => void
}) {
  const { t } = useLanguage()
  const [selected, setSelected] = useState<string[]>(coveredIds)
  const [lastIndex, setLastIndex] = useState<number | null>(null)
  const [state, action, pending] = useActionState(saveSystemCoverage, coverageInitialState)

  if (state.savedAt) onDone()

  // §6.5 — grouped by tower in §6.2 building order. The floors arrive in
  // that order already; grouping preserves it rather than re-sorting.
  const towers = [...new Set(floors.map((f) => f.towerLabel))]

  function toggle(floorId: string, index: number, shiftKey: boolean) {
    // §6.5 — "shift-click selects a range". On a thirty-floor tower this is
    // the difference between one gesture and twenty-seven.
    if (shiftKey && lastIndex !== null) {
      const [from, to] = lastIndex < index ? [lastIndex, index] : [index, lastIndex]
      const span = floors.slice(from, to + 1).map((f) => f.id)
      const turningOn = !selected.includes(floorId)
      setSelected((prev) =>
        turningOn ? [...new Set([...prev, ...span])] : prev.filter((id) => !span.includes(id)),
      )
    } else {
      setSelected((prev) =>
        prev.includes(floorId) ? prev.filter((id) => id !== floorId) : [...prev, floorId],
      )
    }
    setLastIndex(index)
  }

  const removed = coveredIds.filter((id) => !selected.includes(id))
  const warnings = removalWarnings(removed, floors, systemName, recordedByFloor)

  return (
    <form action={action} className="setup-coverage__editor">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="systemId" value={systemId} />
      {selected.map((id) => (
        <input key={id} type="hidden" name="floorId" value={id} />
      ))}

      <div className="setup-coverage__editor-head">
        <span className="setup-coverage__editor-title">{systemName}</span>
        <span className="setup-coverage__bulk">
          <button type="button" onClick={() => setSelected(floors.map((f) => f.id))}>
            {t('setupCoverageAllFloors')}
          </button>
          {' · '}
          <button type="button" onClick={() => setSelected([])}>
            {t('setupCoverageNone')}
          </button>
        </span>
      </div>

      {towers.map((tower) => (
        <div key={tower ?? '—'} className="setup-coverage__tower">
          {tower && <div className="setup-coverage__tower-label">{tower}</div>}
          <div className="setup-coverage__grid">
            {floors
              .filter((f) => f.towerLabel === tower)
              .map((f) => {
                const index = floors.findIndex((x) => x.id === f.id)
                const on = selected.includes(f.id)
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`setup-coverage__toggle${on ? ' setup-coverage__toggle--on' : ''}`}
                    aria-pressed={on}
                    onClick={(e) => toggle(f.id, index, e.shiftKey)}
                  >
                    {f.label}
                  </button>
                )
              })}
          </div>
        </div>
      ))}

      {/* §6.5 — states the consequence, names the floor and the system, and
          does NOT block. The person removing it may know the system was
          never on that floor; the app only knows what was recorded. */}
      {warnings.map((w) => (
        <p key={w.floorLabel} className="setup-coverage__warn">
          <strong>{w.floorLabel}</strong> {t('setupCoverageRemovalWarnMiddle')} {w.systemName} —{' '}
          {w.recordedSubStages} {t('setupCoverageRemovalWarnCountSuffix')}{' '}
          {t('setupCoverageRemovalWarnBody')}
        </p>
      ))}

      {state.error && <p className="setup-coverage__error">{state.error}</p>}

      <div className="setup-coverage__editor-actions">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {t('setupCoverageSavePrefix')} {selected.length} {t('setupCoverageSaveSuffix')}
        </button>
        <button type="button" className="btn" onClick={onDone} disabled={pending}>
          {t('setupCoverageCancel')}
        </button>
      </div>
    </form>
  )
}
