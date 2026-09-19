'use client'

/**
 * Brief 024 §2/§3 — the expandable floor breakdown that opens out of
 * screen 6a on a floor-tracked project, plus QC inspection recording.
 *
 * Every status edit here (sub-stage status, shop-drawing status,
 * handover checklist) relies entirely on migration 009's existing
 * PIC-keyed write policies (Brief §2.2/§5 — sub-stage write access does
 * not change this round); every inspection insert relies on migration
 * 017's new QC-team-keyed policy (Brief §4). The isPic/isQcMember props
 * gate which controls even render, mirroring UpdateProgressForm's own
 * belt-and-suspenders convention — RLS is the real enforcement in both
 * cases.
 *
 * Brief 050 §B — this screen's own lightweight "Add floor" form
 * (add-only, no edit/delete/tower support) is REMOVED: the real floor/
 * tower configuration screen (/projects/[projectId]/floors, Brief 047)
 * now supersedes it. Floor DISPLAY and every sub-stage/drawing/handover
 * status control below are unchanged — only the add-a-floor path moved.
 */
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { updateShopDrawingStatus, updateSubStageStatus, upsertHandoverItem } from './floor-actions'
import { recordMaterialInspection, recordSubStageInspection } from './qc-actions'

const STATUS_KEYS: Record<string, DictionaryKey> = {
  not_started: 'statusNotStarted',
  in_progress: 'statusInProgress',
  done: 'statusDone',
}

const DRAWING_TYPE_KEYS: Record<string, DictionaryKey> = {
  schematic: 'drawingTypeSchematic',
  typical_section: 'drawingTypeTypicalSection',
  layout: 'drawingTypeLayout',
  detail_connection: 'drawingTypeDetailConnection',
}

const SUB_STAGE_KEYS: Record<string, DictionaryKey> = {
  first_fix: 'subStageFirstFix',
  second_fix: 'subStageSecondFix',
  third_fix: 'subStageThirdFix',
  pre_commissioning: 'subStagePreCommissioning',
  commissioning: 'subStageCommissioning',
}

const HANDOVER_KEYS: Record<string, DictionaryKey> = {
  material_approval: 'handoverMaterialApproval',
  final_bom_spares: 'handoverFinalBomSpares',
  tc_document: 'handoverTcDocument',
  as_built_drawing: 'handoverAsBuiltDrawing',
  training_om_manual: 'handoverTrainingOmManual',
  warranty_documents: 'handoverWarrantyDocuments',
}

const HANDOVER_ORDER = Object.keys(HANDOVER_KEYS)

const INSPECTION_STATUS_KEYS: Record<string, DictionaryKey> = {
  pass: 'inspectionStatusPass',
  fail: 'inspectionStatusFail',
  pending: 'inspectionStatusPending',
}

export interface SubStageRow {
  id: string
  stage: 'installation' | 'tnc'
  subStage: string
  status: string
  hasPassedInspection: boolean
  lastInspectionStatus: string | null
}

export interface DrawingRow {
  id: string
  drawingType: string
  status: string
}

export interface FloorRow {
  id: string
  label: string
  shopDrawing: DrawingRow[]
  subStages: SubStageRow[]
}

export interface HandoverItem {
  deliverable: string
  status: string
}

export function FloorBreakdown({
  projectId,
  isPic,
  isQcMember,
  floors,
  projectShopDrawing,
  handoverItems,
}: {
  projectId: string
  isPic: boolean
  isQcMember: boolean
  floors: FloorRow[]
  projectShopDrawing: DrawingRow[]
  handoverItems: HandoverItem[]
}) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  const exceptions = floors.flatMap((floor) =>
    floor.subStages
      .filter((s) => s.status === 'done' && !s.hasPassedInspection)
      .map((s) => ({ floorLabel: floor.label, subStage: s.subStage })),
  )

  const handoverByDeliverable = new Map(handoverItems.map((h) => [h.deliverable, h.status]))

  return (
    <div className="floor-breakdown">
      <button type="button" className="btn btn--outline floor-breakdown__toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? t('floorBreakdownCollapse') : t('floorBreakdownExpand')}
      </button>

      {expanded && (
        <div className="floor-breakdown__body">
          {!isPic && <p className="floor-breakdown__note">{t('floorBreakdownPicOnlyNote')}</p>}

          <section className="floor-breakdown__section">
            <h3 className="floor-breakdown__section-title">{t('floorBreakdownProjectLevelTitle')}</h3>
            <div className="floor-breakdown__drawing-list">
              {projectShopDrawing.map((item) => (
                <DrawingRowView key={item.id} projectId={projectId} item={item} isPic={isPic} />
              ))}
            </div>
            {isQcMember && (
              <MaterialInspectionRecorder projectId={projectId} floors={floors.map((f) => ({ id: f.id, label: f.label }))} />
            )}
          </section>

          <section className="floor-breakdown__section">
            <h3 className="floor-breakdown__section-title">{t('floorBreakdownExceptionsTitle')}</h3>
            {exceptions.length === 0 ? (
              <p className="empty-state">{t('floorBreakdownExceptionsEmpty')}</p>
            ) : (
              <ul className="floor-breakdown__exception-list">
                {exceptions.map((e, i) => (
                  <li key={i} className="floor-breakdown__exception-item">
                    <span className="floor-breakdown__exception-flag">{t('floorBreakdownExceptionFlag')}</span>
                    {e.floorLabel} — {t(SUB_STAGE_KEYS[e.subStage] ?? 'subStageFirstFix')}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {floors.length === 0 ? (
            <p className="empty-state">{t('floorBreakdownNoFloors')}</p>
          ) : (
            floors.map((floor) => (
              <FloorCard key={floor.id} projectId={projectId} floor={floor} isPic={isPic} isQcMember={isQcMember} />
            ))
          )}

          {isPic && (
            <p className="floor-breakdown__note">
              <Link href={`/projects/${projectId}/floors`}>{t('floorBreakdownGoToFloorConfig')}</Link>
            </p>
          )}

          <section className="floor-breakdown__section">
            <h3 className="floor-breakdown__section-title">{t('floorBreakdownHandoverTitle')}</h3>
            <div className="floor-breakdown__handover-list">
              {HANDOVER_ORDER.map((deliverable) => (
                <HandoverRowView
                  key={deliverable}
                  projectId={projectId}
                  deliverable={deliverable}
                  status={handoverByDeliverable.get(deliverable) ?? 'not_started'}
                  isPic={isPic}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function FloorCard({
  projectId,
  floor,
  isPic,
  isQcMember,
}: {
  projectId: string
  floor: FloorRow
  isPic: boolean
  isQcMember: boolean
}) {
  const { t } = useLanguage()
  const installation = floor.subStages.filter((s) => s.stage === 'installation')
  const tnc = floor.subStages.filter((s) => s.stage === 'tnc')

  return (
    <section className="floor-breakdown__section floor-breakdown__floor-card">
      <h3 className="floor-breakdown__section-title">{floor.label}</h3>

      <div className="floor-breakdown__subsection">
        <h4 className="floor-breakdown__subsection-title">{t('floorBreakdownShopDrawingTitle')}</h4>
        <div className="floor-breakdown__drawing-list">
          {floor.shopDrawing.map((item) => (
            <DrawingRowView key={item.id} projectId={projectId} item={item} isPic={isPic} />
          ))}
        </div>
      </div>

      <div className="floor-breakdown__subsection">
        <h4 className="floor-breakdown__subsection-title">{t('floorBreakdownInstallationTitle')}</h4>
        {installation.map((s) => (
          <SubStageRowView key={s.id} projectId={projectId} subStage={s} isPic={isPic} isQcMember={isQcMember} inspectionType="installation" />
        ))}
      </div>

      <div className="floor-breakdown__subsection">
        <h4 className="floor-breakdown__subsection-title">{t('floorBreakdownTncTitle')}</h4>
        {tnc.map((s) => (
          <SubStageRowView key={s.id} projectId={projectId} subStage={s} isPic={isPic} isQcMember={isQcMember} inspectionType="commissioning" />
        ))}
      </div>
    </section>
  )
}

function DrawingRowView({ projectId, item, isPic }: { projectId: string; item: DrawingRow; isPic: boolean }) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="floor-breakdown__row">
      <span className="floor-breakdown__row-label">{t(DRAWING_TYPE_KEYS[item.drawingType] ?? 'drawingTypeSchematic')}</span>
      <select
        className="floor-breakdown__status-select"
        defaultValue={item.status}
        disabled={!isPic || isPending}
        onChange={(e) => {
          const formData = new FormData()
          formData.set('projectId', projectId)
          formData.set('itemId', item.id)
          formData.set('status', e.target.value)
          startTransition(() => {
            updateShopDrawingStatus(formData)
          })
        }}
      >
        {Object.entries(STATUS_KEYS).map(([value, key]) => (
          <option key={value} value={value}>
            {t(key)}
          </option>
        ))}
      </select>
    </div>
  )
}

function SubStageRowView({
  projectId,
  subStage,
  isPic,
  isQcMember,
  inspectionType,
}: {
  projectId: string
  subStage: SubStageRow
  isPic: boolean
  isQcMember: boolean
  inspectionType: 'installation' | 'commissioning'
}) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()
  const [recording, setRecording] = useState(false)
  const showException = subStage.status === 'done' && !subStage.hasPassedInspection

  return (
    <div className="floor-breakdown__row">
      <span className="floor-breakdown__row-label">
        {t(SUB_STAGE_KEYS[subStage.subStage] ?? 'subStageFirstFix')}
        {showException && <span className="floor-breakdown__exception-flag">{t('floorBreakdownExceptionFlag')}</span>}
      </span>
      <select
        className="floor-breakdown__status-select"
        defaultValue={subStage.status}
        disabled={!isPic || isPending}
        onChange={(e) => {
          const formData = new FormData()
          formData.set('projectId', projectId)
          formData.set('subStageId', subStage.id)
          formData.set('status', e.target.value)
          startTransition(() => {
            updateSubStageStatus(formData)
          })
        }}
      >
        {Object.entries(STATUS_KEYS).map(([value, key]) => (
          <option key={value} value={value}>
            {t(key)}
          </option>
        ))}
      </select>

      <span className="floor-breakdown__last-inspection">
        {t('floorBreakdownLastInspection')}:{' '}
        {subStage.lastInspectionStatus ? t(INSPECTION_STATUS_KEYS[subStage.lastInspectionStatus]) : t('floorBreakdownNoInspectionYet')}
      </span>

      {isQcMember && (
        <button type="button" className="btn btn--ghost" onClick={() => setRecording((v) => !v)}>
          {recording ? t('floorBreakdownRecordInspectionCancel') : t('floorBreakdownRecordInspection')}
        </button>
      )}

      {recording && (
        <InspectionForm
          onSubmit={(formData) => {
            formData.set('projectId', projectId)
            formData.set('floorSubStageId', subStage.id)
            formData.set('inspectionType', inspectionType)
            return recordSubStageInspection(formData)
          }}
          onDone={() => setRecording(false)}
        />
      )}
    </div>
  )
}

function InspectionForm({
  onSubmit,
  onDone,
}: {
  onSubmit: (formData: FormData) => Promise<{ error: string | null }>
  onDone: () => void
}) {
  const { t } = useLanguage()
  const [status, setStatus] = useState('pass')
  const [notes, setNotes] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="floor-breakdown__inspection-form">
      <label className="field">
        <span className="field__label">{t('floorBreakdownInspectionStatus')}</span>
        <select className="field__input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {Object.entries(INSPECTION_STATUS_KEYS).map(([value, key]) => (
            <option key={value} value={value}>
              {t(key)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field__label">
          {t('floorBreakdownInspectionNotes')} <span className="field__label-optional">{t('floorBreakdownInspectionNotesOptional')}</span>
        </span>
        <textarea className="field__textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
      </label>
      <button
        type="button"
        className="btn btn--primary"
        disabled={isPending}
        onClick={() => {
          const formData = new FormData()
          formData.set('status', status)
          formData.set('notes', notes)
          startTransition(async () => {
            const result = await onSubmit(formData)
            if (result.error) {
              setError(result.error)
            } else {
              onDone()
            }
          })
        }}
      >
        {t('floorBreakdownInspectionSave')}
      </button>
      {error && <span className="floor-breakdown__error">{error}</span>}
    </div>
  )
}

function MaterialInspectionRecorder({ projectId, floors }: { projectId: string; floors: { id: string; label: string }[] }) {
  const { t } = useLanguage()
  const [recording, setRecording] = useState(false)
  const [selectedFloors, setSelectedFloors] = useState<string[]>([])

  return (
    <div className="floor-breakdown__material-inspection">
      <button type="button" className="btn btn--ghost" onClick={() => setRecording((v) => !v)}>
        {recording ? t('floorBreakdownRecordInspectionCancel') : `${t('floorBreakdownRecordInspection')} — ${t('floorBreakdownMaterialInspectionTitle')}`}
      </button>
      {recording && (
        <>
          {floors.length > 0 && (
            <fieldset className="floor-breakdown__floor-select">
              <legend>{t('floorBreakdownMaterialInspectionFloors')}</legend>
              {floors.map((floor) => (
                <label key={floor.id} className="floor-breakdown__floor-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedFloors.includes(floor.id)}
                    onChange={(e) => {
                      setSelectedFloors((prev) =>
                        e.target.checked ? [...prev, floor.id] : prev.filter((id) => id !== floor.id),
                      )
                    }}
                  />
                  {floor.label}
                </label>
              ))}
            </fieldset>
          )}
          <InspectionForm
            onSubmit={(formData) => {
              formData.set('projectId', projectId)
              selectedFloors.forEach((id) => formData.append('floorIds', id))
              return recordMaterialInspection(formData)
            }}
            onDone={() => {
              setRecording(false)
              setSelectedFloors([])
            }}
          />
        </>
      )}
    </div>
  )
}

function HandoverRowView({
  projectId,
  deliverable,
  status,
  isPic,
}: {
  projectId: string
  deliverable: string
  status: string
  isPic: boolean
}) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="floor-breakdown__row">
      <span className="floor-breakdown__row-label">{t(HANDOVER_KEYS[deliverable])}</span>
      <select
        className="floor-breakdown__status-select"
        defaultValue={status}
        disabled={!isPic || isPending}
        onChange={(e) => {
          const formData = new FormData()
          formData.set('projectId', projectId)
          formData.set('deliverable', deliverable)
          formData.set('status', e.target.value)
          startTransition(() => {
            upsertHandoverItem(formData)
          })
        }}
      >
        {Object.entries(STATUS_KEYS).map(([value, key]) => (
          <option key={value} value={value}>
            {t(key)}
          </option>
        ))}
      </select>
    </div>
  )
}

