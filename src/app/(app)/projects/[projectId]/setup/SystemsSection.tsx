'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { addProjectSystem, updateSystemCadCode } from './actions'
import { CoverageSummary, CoverageEditor, type CoverageFloorRow } from './CoverageEditor'
import { setupInitialState } from './setup-shared'

export interface ProjectSystemRow {
  id: string
  name: string
  cadCode: string | null
  source: 'imported' | 'manual'
  /** Brief 106b / §6.5 — the floors this system covers, and how much work
   *  has moved on each, for the removal warning. */
  coveredFloorIds: string[]
  coverageSource: 'import' | 'manual' | null
  recordedByFloor: Map<string, number>
}

export interface CadSystemChoice {
  code: string
  labelEn: string
}

/**
 * Brief 098 §2 — the Systems section, now that systems are stored
 * (migration 037). v7.2 §6.2 item 3: bordered chips with an "+ Add a
 * system" dashed chip; each system carries a CAD system code picked from
 * the Part 1 lookup, never hardcoded. Where a system has no code, that is
 * said in words, in amber — it does not block anything.
 */
export function SystemsSection({
  projectId,
  systems,
  cadSystems,
  canEdit,
  floors,
}: {
  projectId: string
  systems: ProjectSystemRow[]
  cadSystems: CadSystemChoice[]
  canEdit: boolean
  /** Every floor of the project, in §6.2 building order. */
  floors: CoverageFloorRow[]
}) {
  const { t } = useLanguage()
  const [adding, setAdding] = useState(false)
  const [addState, addAction, addPending] = useActionState(addProjectSystem, setupInitialState)
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  if (addState.savedAt && addState.savedAt !== handledSavedAt) {
    setHandledSavedAt(addState.savedAt)
    setAdding(false)
  }

  const importedCount = systems.filter((s) => s.source === 'imported').length

  return (
    <>
      {systems.length > 0 && (
      <div className="wf-data-table">
        <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '1fr 1.1fr 1.4fr .7fr .8fr' }}>
          <span className="wf-data-table__head-cell">{t('setupSystemsNameLabel')}</span>
          <span className="wf-data-table__head-cell">{t('setupSystemsCadCodeLabel')}</span>
          <span className="wf-data-table__head-cell">{t('setupCoverageColumn')}</span>
          <span className="wf-data-table__head-cell">{t('setupCoverageSetBy')}</span>
          <span className="wf-data-table__head-cell" />
        </div>
        {systems.map((system) => (
          <SystemRow
            key={system.id}
            projectId={projectId}
            system={system}
            cadSystems={cadSystems}
            canEdit={canEdit}
            floors={floors}
          />
        ))}
      </div>
      )}

      {importedCount > 0 && (
        <p className="boq-import__note">
          {importedCount} {t('setupSystemsFromImportPrefix')}
        </p>
      )}

      {canEdit &&
        (adding ? (
          <form action={addAction} className="wf-form-row">
            <input type="hidden" name="projectId" value={projectId} />
            <label className="wf-form-row__field">
              <span className="wf-form-row__label">{t('setupSystemsNameLabel')}</span>
              <input className="wf-form-row__input" name="name" required autoFocus />
            </label>
            <label className="wf-form-row__field">
              <span className="wf-form-row__label">{t('setupSystemsCadCodeLabel')}</span>
              <select className="wf-form-row__input" name="cadCode" defaultValue="">
                <option value="">{t('setupSystemsCadCodeNone')}</option>
                {cadSystems.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.labelEn}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="wf-form-row__submit" disabled={addPending}>
              {t('setupSystemsSave')}
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setAdding(false)}
              disabled={addPending}
            >
              {t('floorConfigCancel')}
            </button>
            {addState.error && <span className="wf-admin-row__confirm-error">{addState.error}</span>}
          </form>
        ) : (
          <button type="button" className="wf-setup-add-chip" onClick={() => setAdding(true)}>
            {t('setupSystemsAdd')}
          </button>
        ))}
    </>
  )
}

function SystemRow({
  projectId,
  system,
  cadSystems,
  canEdit,
  floors,
}: {
  projectId: string
  system: ProjectSystemRow
  cadSystems: CadSystemChoice[]
  canEdit: boolean
  floors: CoverageFloorRow[]
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(updateSystemCadCode, setupInitialState)
  const [editingFloors, setEditingFloors] = useState(false)

  return (
    <div className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '1fr 1.1fr 1.4fr .7fr .8fr' }}>
      <span>
        {system.name}{' '}
        {system.source === 'imported' && (
          <span className="wf-status-tag wf-status-tag--imported">{t('boqTagImported')}</span>
        )}
      </span>
      {canEdit ? (
        <form action={formAction} className="wf-form-row wf-form-row--inline">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="systemId" value={system.id} />
          <select className="wf-form-row__input" name="cadCode" defaultValue={system.cadCode ?? ''}>
            <option value="">{t('setupSystemsCadCodeNone')}</option>
            {cadSystems.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.labelEn}
              </option>
            ))}
          </select>
          <button type="submit" className="wf-form-row__submit" disabled={pending}>
            {t('setupSystemsSave')}
          </button>
          {!system.cadCode && (
            <span className="wf-admin-row__confirm-error">{t('setupSystemsNoCadCode')}</span>
          )}
          {state.error && <span className="wf-admin-row__confirm-error">{state.error}</span>}
        </form>
      ) : (
        <span>
          {system.cadCode ?? (
            <span className="wf-admin-row__confirm-error">{t('setupSystemsNoCadCode')}</span>
          )}
        </span>
      )}

      {/* §6.5 — Floors covered */}
      <span>
        <CoverageSummary floors={floors} coveredIds={system.coveredFloorIds} />
        {system.coveredFloorIds.length === 0 && (
          <span className="setup-coverage__none-body">
            {t('setupCoverageNoFloorsBodyPrefix')} {system.name}{' '}
            {t('setupCoverageNoFloorsBodySuffix')}
          </span>
        )}
      </span>

      {/* §6.5 — Set by. Blank until coverage exists: "by hand" would be a
          claim about something nobody has done yet. */}
      <span className="setup-coverage__set-by">
        {system.coveredFloorIds.length === 0
          ? '—'
          : system.coverageSource === 'import'
            ? t('setupCoverageSourceImport')
            : t('setupCoverageSourceManual')}
      </span>

      {/* §6.4 — where a person cannot edit, a sentence stands in place of the
          control, never a disabled button. Here the control is simply absent
          and the row stays readable. */}
      <span>
        {canEdit && (
          <button
            type="button"
            className="wf-admin-row__link"
            onClick={() => setEditingFloors((v) => !v)}
          >
            {system.coveredFloorIds.length === 0
              ? t('setupCoverageSetFloors')
              : t('setupCoverageEdit')}
          </button>
        )}
      </span>

      {editingFloors && canEdit && (
        <div className="setup-coverage__editor-wrap">
          <CoverageEditor
            projectId={projectId}
            systemId={system.id}
            systemName={system.name}
            floors={floors}
            coveredIds={system.coveredFloorIds}
            recordedByFloor={system.recordedByFloor}
            onDone={() => setEditingFloors(false)}
          />
        </div>
      )}
    </div>
  )
}
