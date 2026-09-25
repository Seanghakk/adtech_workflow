'use client'

/**
 * Brief 102 §3 — "Add a shop drawing".
 *
 * §3.2 lists what it asks for and nothing more. Three of those four are
 * here; the fourth is deliberately absent:
 *
 *  - SCOPE, and the drawing TYPE, which follows from it. The two lists
 *    mirror migration 008's shape_check, so a person cannot pick a
 *    combination the database will refuse after they submit — and cannot
 *    create a typical / section drawing per floor, which is the accident
 *    the Sep 2026 decision exists to prevent.
 *  - The FLOOR, when the scope is a floor. With no floors, the option
 *    says so and points at Project setup; project level still works.
 *  - The TITLE, shown but not asked for: composed by the same function
 *    the AutoCAD export uses, so a person sees exactly the title the
 *    export will write.
 *  - The SYSTEM is NOT asked for. §3.2 wants one and there is nowhere to
 *    put it: shop_drawing_items has no system column and nothing links
 *    project_systems to a drawing. Asking for something that cannot be
 *    stored would be worse than not asking. Stopped and flagged.
 *
 * The drawing NUMBER is never typed — §3.2 leaves it to the numbering
 * rules already built.
 */
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { DRAWING_TYPE_KEYS } from '@/lib/shopDrawing/drawingTypes'
import { typesForScope, type DrawingScope } from '@/lib/shopDrawing/addDrawing'
import { composeDrawingTitle } from '@/lib/autocad/export'
import { addShopDrawing } from './drawer-actions'
import { drawerInitialState } from './drawer-shared'

export function AddDrawingForm({
  projectId,
  floors,
  canAdd,
  defaultScope = 'project',
  defaultFloorId = null,
  systems,
  systemsReadFailed,
}: {
  projectId: string
  floors: { id: string; label: string }[]
  canAdd: boolean
  defaultScope?: DrawingScope
  defaultFloorId?: string | null
  /** Brief 102 follow-up — the project's own systems (project_systems). */
  systems: { id: string; name: string; cadCode: string | null }[]
  systemsReadFailed: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<DrawingScope>(defaultScope)
  const [drawingType, setDrawingType] = useState<string>(typesForScope(defaultScope)[0])
  const [floorId, setFloorId] = useState<string>(defaultFloorId ?? '')
  const [systemId, setSystemId] = useState<string>('')
  const [state, action, pending] = useActionState(addShopDrawing, drawerInitialState)

  // A refusal is a sentence naming who can help, never a disabled button.
  if (!canAdd) {
    return <p className="floor-breakdown__note">{t('addDrawingRefusedNote')}</p>
  }

  if (!open) {
    return (
      <div className="add-drawing">
        <button type="button" className="btn btn--outline" onClick={() => setOpen(true)}>
          {t('addDrawingAction')}
        </button>
        {state.savedAt && (
          <p className="add-drawing__saved" role="status">
            {t('addDrawingSaved')}
          </p>
        )}
      </div>
    )
  }

  const noFloors = floors.length === 0
  const typeLabel = t(DRAWING_TYPE_KEYS[drawingType] ?? 'drawingTypeSchematic')
  const floorLabel = scope === 'floor' ? (floors.find((f) => f.id === floorId)?.label ?? null) : null

  function chooseScope(next: DrawingScope) {
    setScope(next)
    // The type list changes with the scope, so the current choice may no
    // longer be legal. Move to the first type that is.
    setDrawingType(typesForScope(next)[0])
  }

  return (
    <form action={action} className="add-drawing wf-form-row wf-form-row--stack">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="drawingType" value={drawingType} />
      <input type="hidden" name="floorId" value={scope === 'floor' ? floorId : ''} />
      <input type="hidden" name="systemId" value={systemId} />

      <h4 className="add-drawing__heading">{t('addDrawingHeading')}</h4>

      <fieldset className="add-drawing__group">
        <legend className="wf-form-row__label">{t('addDrawingScopeLabel')}</legend>
        <label className="add-drawing__choice">
          <input
            type="radio"
            name="scopeChoice"
            checked={scope === 'project'}
            onChange={() => chooseScope('project')}
          />
          {t('addDrawingScopeProject')}
        </label>
        <label className="add-drawing__choice">
          <input
            type="radio"
            name="scopeChoice"
            checked={scope === 'floor'}
            onChange={() => chooseScope('floor')}
            disabled={noFloors}
          />
          {t('addDrawingScopeFloor')}
        </label>
        {/* With no floors the floor option cannot mean anything, so the
            screen says why and points at the one action that changes it. */}
        {noFloors && (
          <p className="add-drawing__note">
            {t('addDrawingNoFloorsNote')}{' '}
            <Link href={`/projects/${projectId}/setup#structure`}>
              {t('addDrawingNoFloorsAction')}
            </Link>
          </p>
        )}
      </fieldset>

      {scope === 'floor' && !noFloors && (
        <label className="add-drawing__field">
          <span className="wf-form-row__label">{t('addDrawingFloorLabel')}</span>
          <select value={floorId} onChange={(e) => setFloorId(e.target.value)}>
            <option value="">{t('addDrawingFloorPlaceholder')}</option>
            {floors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="add-drawing__field">
        <span className="wf-form-row__label">{t('addDrawingTypeLabel')}</span>
        <select value={drawingType} onChange={(e) => setDrawingType(e.target.value)}>
          {typesForScope(scope).map((key) => (
            <option key={key} value={key}>
              {t(DRAWING_TYPE_KEYS[key] ?? 'drawingTypeSchematic')}
            </option>
          ))}
        </select>
      </label>

      {/* Brief 102 follow-up — the system, now that migration 040 gives
          it somewhere to live. OPTIONAL: a drawing can exist before
          anyone has decided which system it belongs to, and the floor
          trigger has always created them without one. It is the
          {SYSTEM} part of v7.2 §8.2's drawing-number format, via
          project_systems.cad_code. */}
      {systemsReadFailed ? (
        // Brief 094 — a failed read must never read as "no systems",
        // which would send someone to create ones that already exist.
        <p className="add-drawing__note">{t('addDrawingSystemsUnavailable')}</p>
      ) : systems.length === 0 ? (
        <p className="add-drawing__note">
          {t('addDrawingNoSystemsNote')}{' '}
          <Link href={`/projects/${projectId}/setup#systems`}>
            {t('addDrawingNoFloorsAction')}
          </Link>
        </p>
      ) : (
        <label className="add-drawing__field">
          <span className="wf-form-row__label">{t('addDrawingSystemLabel')}</span>
          <select value={systemId} onChange={(e) => setSystemId(e.target.value)}>
            <option value="">{t('addDrawingSystemNone')}</option>
            {systems.map((sys) => (
              <option key={sys.id} value={sys.id}>
                {sys.cadCode ? `${sys.name} · ${sys.cadCode}` : sys.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="add-drawing__note">
        {t('addDrawingTitlePreviewLabel')}: <strong>{composeDrawingTitle({ typeLabel, floorLabel })}</strong>
      </p>
      <p className="add-drawing__note">{t('addDrawingNumberNote')}</p>

      <div className="add-drawing__actions">
        <button
          type="submit"
          className="btn btn--primary"
          disabled={pending || (scope === 'floor' && !floorId)}
        >
          {t('addDrawingSubmit')}
        </button>
        <button type="button" className="btn btn--outline" onClick={() => setOpen(false)}>
          {t('addDrawingCancel')}
        </button>
      </div>

      {state.error && (
        <p className="add-drawing__error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  )
}
