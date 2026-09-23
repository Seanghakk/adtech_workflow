'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { addProjectSystem, updateSystemCadCode } from './actions'
import { setupInitialState } from './setup-shared'

export interface ProjectSystemRow {
  id: string
  name: string
  cadCode: string | null
  source: 'imported' | 'manual'
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
}: {
  projectId: string
  systems: ProjectSystemRow[]
  cadSystems: CadSystemChoice[]
  canEdit: boolean
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
        <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
          <span className="wf-data-table__head-cell">{t('setupSystemsNameLabel')}</span>
          <span className="wf-data-table__head-cell">{t('setupSystemsCadCodeLabel')}</span>
        </div>
        {systems.map((system) => (
          <SystemRow
            key={system.id}
            projectId={projectId}
            system={system}
            cadSystems={cadSystems}
            canEdit={canEdit}
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
}: {
  projectId: string
  system: ProjectSystemRow
  cadSystems: CadSystemChoice[]
  canEdit: boolean
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(updateSystemCadCode, setupInitialState)

  return (
    <div className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
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
    </div>
  )
}
