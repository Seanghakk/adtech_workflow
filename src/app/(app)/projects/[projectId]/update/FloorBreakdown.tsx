'use client'

/**
 * Brief 024 §2/§3 — the expandable floor breakdown that opens out of
 * screen 6a on a floor-tracked project, plus QC inspection recording.
 *
 * Migration 022 / Brief 050 §C — sub-stage status and the handover
 * checklist are NO LONGER PIC-keyed: sub-stage status is team-keyed,
 * STAGE-CONDITIONAL (Project team for installation rows, TNC team for
 * tnc rows), and handover is QC-team-keyed, mirroring the RLS policies'
 * own shape exactly. Shop-drawing status (still PIC-only, migration 009,
 * unchanged by migration 022) keeps the isPic gate it always had.
 * Every gate here is app-layer belt-and-suspenders only — RLS is the
 * real enforcement in every case.
 *
 * Brief 050 §B — this screen's own lightweight "Add floor" form
 * (add-only, no edit/delete/tower support) is REMOVED: the real floor/
 * tower configuration screen (/projects/[projectId]/floors, Brief 047)
 * now supersedes it. Floor DISPLAY and every sub-stage/drawing/handover
 * status control below are unchanged — only the add-a-floor path moved.
 */
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { compressImage, uploadProgressPhoto } from '@/lib/media/progressPhoto'
import { updateShopDrawingStatus, updateSubStageStatus, upsertHandoverItem } from './floor-actions'
import { ShopDrawingDrawer, type DrawerDrawing } from './ShopDrawingDrawer'
import { deriveLifecycle } from '@/lib/shopDrawing/lifecycle'
import type { DrawingActor } from '@/lib/shopDrawing/permissions'
import { DRAWING_TYPE_KEYS } from '@/lib/shopDrawing/drawingTypes'
import { recordMaterialInspection, recordSubStageInspection } from './qc-actions'
import type { SubStageDisplayState } from '@/lib/subStageDisplayState'

const STATUS_KEYS: Record<string, DictionaryKey> = {
  not_started: 'statusNotStarted',
  in_progress: 'statusInProgress',
  done: 'statusDone',
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
  /** Brief 081 — the v6 §7.1 shared derivation (src/lib/subStageDisplayState.ts),
   *  computed by the caller from this sub-stage's status and its LATEST
   *  pass/fail inspection (not "any pass ever" — that was the bug this
   *  brief fixes; see this file's own git history / Brief 081's Result
   *  doc). Replaces the old `hasPassedInspection: boolean`, which only
   *  ever recorded whether a pass had EVER happened, so a fail recorded
   *  after an old pass used to stay shown as passed forever. */
  qcDisplayState: SubStageDisplayState
  /** The single most recent qc_inspections row of ANY status for this
   *  sub-stage, INCLUDING 'pending' — a literal "what happened most
   *  recently" read, genuinely different from qcDisplayState above
   *  (which only ever considers pass/fail, per the shared rule's own
   *  contract) — not a second derivation of the same question. */
  lastInspectionStatus: string | null
  /** Migration 024 / Brief 059 §3 — Storage URL of the most recently
   *  uploaded completion photo, if any. */
  photoUrl: string | null
}

export interface DrawingRow {
  id: string
  drawingType: string
  status: string
  /** Brief 100 Part B — everything §9's drawer shows for this drawing. */
  drawer: DrawerDrawing
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
  isProjectTeamMember,
  isTncTeamMember,
  floors,
  projectShopDrawing,
  handoverItems,
  drawingActor,
}: {
  projectId: string
  isPic: boolean
  isQcMember: boolean
  /** Migration 022 / Brief 050 §C — gates installation-stage sub-stage
   *  status (workflow.teams.code = 'project_management'). */
  isProjectTeamMember: boolean
  /** Migration 022 / Brief 050 §C — gates tnc-stage sub-stage status
   *  (workflow.teams.code = 'tnc'). */
  isTncTeamMember: boolean
  floors: FloorRow[]
  projectShopDrawing: DrawingRow[]
  handoverItems: HandoverItem[]
  /** Brief 100 Part B — who the signed-in person is, for §9.5's gates. */
  drawingActor: DrawingActor
}) {
  // §9.1 — one drawer at a time across the whole screen, so opening a
  // second drawing closes the first rather than stacking panels.
  const [openDrawingId, setOpenDrawingId] = useState<string | null>(null)
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)

  // Brief 056 §6 — the matrix's drill-through target. This panel is
  // collapsed by default (above), so a bare #substage-<id> link from the
  // matrix would otherwise land on nothing visible. Reading
  // window.location.hash MUST start from `false` (matching SSR, which
  // has no window at all) and update after mount, not from a lazy
  // useState initializer that would read the hash during the CLIENT's
  // first render — that would disagree with the server-rendered `false`
  // and cause a real hydration mismatch, not just an eslint complaint.
  // This is exactly react-hooks/set-state-in-effect's own carve-out
  // ("subscribe for updates from an external system... calling setState
  // when external state changes"): window.location.hash is that external
  // system, unavailable at SSR time by definition, so there is no
  // non-effect way to read it once after mount.
  useEffect(() => {
    if (!window.location.hash.startsWith('#substage-')) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see comment above the effect
    setExpanded(true)
  }, [])

  useEffect(() => {
    if (!expanded) return
    const hash = window.location.hash
    if (!hash.startsWith('#substage-')) return
    const id = window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' })
    })
    return () => window.cancelAnimationFrame(id)
  }, [expanded])

  // Brief 081 — a done sub-stage is an exception whenever its shared
  // display state is anything OTHER than qc_passed: either no pass/fail
  // inspection exists yet (qcDisplayState stays 'done' — see below) or
  // the LATEST one failed (qc_failed). Previously this only checked
  // hasPassedInspection, so a fail recorded after an old pass silently
  // stopped being an exception — the exact bug this brief fixes.
  const exceptions = floors.flatMap((floor) =>
    floor.subStages
      .filter((s) => s.status === 'done' && s.qcDisplayState !== 'qc_passed')
      .map((s) => ({ floorLabel: floor.label, subStage: s.subStage, qcDisplayState: s.qcDisplayState })),
  )

  const handoverByDeliverable = new Map(handoverItems.map((h) => [h.deliverable, h.status]))

  return (
    <div className="floor-breakdown">
      <button type="button" className="btn btn--outline floor-breakdown__toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? t('floorBreakdownCollapse') : t('floorBreakdownExpand')}
      </button>

      {expanded && (
        <div className="floor-breakdown__body">
          {!isPic && !isQcMember && !isProjectTeamMember && !isTncTeamMember && (
            <p className="floor-breakdown__note">{t('floorBreakdownPicOnlyNote')}</p>
          )}

          <section className="floor-breakdown__section">
            <h3 className="floor-breakdown__section-title">{t('floorBreakdownProjectLevelTitle')}</h3>
            {projectShopDrawing.length === 0 && (
              <div className="wf-empty-state-card">
                <p className="wf-empty-state-card__headline">{t('drawerRegisterEmptyProjectHeadline')}</p>
                <p className="wf-empty-state-card__body">
                  {floors.length} {t('drawerRegisterEmptyProjectBodyPrefix')}
                </p>
                {/* Brief 100 Part B stopped here: §21.4 says "Add a shop
                    drawing" is the update screen's EXISTING add action and
                    to flag it if the screen has none. It has none, so this
                    says what is true instead of inventing a control. */}
                <p className="wf-empty-state-card__body">{t('drawerRegisterEmptyNoAddAction')}</p>
              </div>
            )}
            <div className="floor-breakdown__drawing-list">
              {projectShopDrawing.map((item) => (
                <DrawingRowView
                  key={item.id}
                  projectId={projectId}
                  item={item}
                  isPic={isPic}
                  actor={drawingActor}
                  isOpen={openDrawingId === item.id}
                  onOpen={() => setOpenDrawingId(item.id)}
                  onClose={() => setOpenDrawingId(null)}
                />
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
                    {/* Brief 081 — distinguish "never inspected" from "latest
                        inspection failed": "No passed inspection" reads wrong
                        for a sub-stage that WAS passed once and later failed a
                        re-inspection. Reuses the matrix's own exact wording
                        (floorMatrixLegendQcFailed, Brief 078) for the failed
                        case so the same state reads identically on both
                        screens, rather than inventing a second label. */}
                    <span className="floor-breakdown__exception-flag">
                      {e.qcDisplayState === 'qc_failed'
                        ? t('floorMatrixLegendQcFailed')
                        : t('floorBreakdownExceptionFlag')}
                    </span>
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
              <FloorCard
                key={floor.id}
                projectId={projectId}
                floor={floor}
                isPic={isPic}
                isQcMember={isQcMember}
                isProjectTeamMember={isProjectTeamMember}
                isTncTeamMember={isTncTeamMember}
                drawingActor={drawingActor}
                openDrawingId={openDrawingId}
                setOpenDrawingId={setOpenDrawingId}
              />
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
                  isQcMember={isQcMember}
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
  isProjectTeamMember,
  isTncTeamMember,
  drawingActor,
  openDrawingId,
  setOpenDrawingId,
}: {
  projectId: string
  floor: FloorRow
  drawingActor: DrawingActor
  openDrawingId: string | null
  setOpenDrawingId: (id: string | null) => void
  isPic: boolean
  isQcMember: boolean
  isProjectTeamMember: boolean
  isTncTeamMember: boolean
}) {
  const { t } = useLanguage()
  const installation = floor.subStages.filter((s) => s.stage === 'installation')
  const tnc = floor.subStages.filter((s) => s.stage === 'tnc')

  return (
    <section className="floor-breakdown__section floor-breakdown__floor-card">
      <h3 className="floor-breakdown__section-title">{floor.label}</h3>

      <div className="floor-breakdown__subsection">
        <h4 className="floor-breakdown__subsection-title">{t('floorBreakdownShopDrawingTitle')}</h4>
        {floor.shopDrawing.length === 0 && (
          <div className="wf-empty-state-card">
            <p className="wf-empty-state-card__headline">
              {t('drawerRegisterEmptyFloorPrefix')} {floor.label}
            </p>
            <p className="wf-empty-state-card__body">{t('drawerRegisterEmptyFloorBody')}</p>
            <p className="wf-empty-state-card__body">{t('drawerRegisterEmptyNoAddAction')}</p>
          </div>
        )}
        <div className="floor-breakdown__drawing-list">
          {floor.shopDrawing.map((item) => (
            <DrawingRowView
              key={item.id}
              projectId={projectId}
              item={item}
              isPic={isPic}
              actor={drawingActor}
              isOpen={openDrawingId === item.id}
              onOpen={() => setOpenDrawingId(item.id)}
              onClose={() => setOpenDrawingId(null)}
            />
          ))}
        </div>
      </div>

      <div className="floor-breakdown__subsection">
        <h4 className="floor-breakdown__subsection-title">{t('floorBreakdownInstallationTitle')}</h4>
        {installation.map((s) => (
          <SubStageRowView
            key={s.id}
            projectId={projectId}
            subStage={s}
            canWrite={isProjectTeamMember}
            isQcMember={isQcMember}
            inspectionType="installation"
          />
        ))}
      </div>

      <div className="floor-breakdown__subsection">
        <h4 className="floor-breakdown__subsection-title">{t('floorBreakdownTncTitle')}</h4>
        {tnc.map((s) => (
          <SubStageRowView
            key={s.id}
            projectId={projectId}
            subStage={s}
            canWrite={isTncTeamMember}
            isQcMember={isQcMember}
            inspectionType="commissioning"
          />
        ))}
      </div>
    </section>
  )
}

function DrawingRowView({
  projectId,
  item,
  isPic,
  actor,
  isOpen,
  onOpen,
  onClose,
}: {
  projectId: string
  item: DrawingRow
  isPic: boolean
  actor: DrawingActor
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()

  return (
    <>
    <div className={`floor-breakdown__row${isOpen ? ' floor-breakdown__row--drawer-open' : ''}`}>
      {/* §9.1 — clicking columns 1–2 opens the drawer. The status dropdown
          in column 3 is untouched and is not a drawer target. */}
      <button type="button" className="floor-breakdown__row-open" onClick={isOpen ? onClose : onOpen}>
        <span className="floor-breakdown__row-label">{t(DRAWING_TYPE_KEYS[item.drawingType] ?? 'drawingTypeSchematic')}</span>
        <PossessionChip drawing={item.drawer} />
      </button>
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
    {isOpen && (
      <ShopDrawingDrawer projectId={projectId} drawing={item.drawer} actor={actor} onClose={onClose} />
    )}
    </>
  )
}

/** §9.2 — the possession chip. Amber is possession, not blame; nothing
 *  here is red. Outlined for us, solid amber for a reviewer, solid ink
 *  once approved, dashed where it was marked done by hand. */
function PossessionChip({ drawing }: { drawing: DrawerDrawing }) {
  const { t } = useLanguage()
  const life = deriveLifecycle({
    status: drawing.status,
    preSubmissionStage: drawing.preSubmissionStage,
    draftingStartedAt: drawing.draftingStartedAt,
    legacyDoneNoHistory: drawing.legacyDoneNoHistory,
    submissions: drawing.submissions,
    checks: drawing.checks,
    now: new Date(),
  })

  if (life.possession === 'none') {
    return <span className="sd-chip-cell sd-chip-cell--none">—</span>
  }

  const org = life.openSubmission?.reviewerOrg ?? life.lastReturned?.reviewerOrg ?? null
  const withDays = life.clocks.withAdtechDays
  const reviewerDays = life.clocks.withReviewerDays

  let chipClass = 'sd-chip sd-chip--adtech'
  let chipText = t('drawerChipWithAdtech')
  let detail = ''

  if (life.possession === 'reviewer') {
    chipClass = 'sd-chip sd-chip--reviewer'
    chipText = `${t('drawerChipWithPrefix')} ${org ?? '—'}`
    detail = `${t('drawerDetailSubmittedPrefix')} ${reviewerDays ?? 0}d ${t('drawerDetailSubmittedSuffix')}`
  } else if (life.possession === 'approved') {
    chipClass = 'sd-chip sd-chip--approved'
    chipText = `${t('drawerChipApprovedPrefix')} ${life.lastReturned?.code ?? ''}`.trim()
    detail = `${org ?? '—'}${life.lastReturned?.returnedAt ? ` · ${new Date(life.lastReturned.returnedAt).toLocaleDateString()}` : ''}`
  } else if (life.possession === 'marked_done_by_hand') {
    chipClass = 'sd-chip sd-chip--by-hand'
    chipText = t('drawerChipMarkedByHand')
  } else {
    const word = life.stage === 'internal_check' || life.stage === 'checked'
      ? t('drawerDetailAwaitingCheck')
      : t('drawerDetailDrafting')
    detail = withDays === null ? t('drawerStartNotRecorded') : `${word}, ${withDays}d`
  }

  return (
    <span className="sd-chip-cell">
      <span className={chipClass}>{chipText}</span>
      {detail && <span className="sd-chip-detail">{detail}</span>}
    </span>
  )
}

function SubStageRowView({
  projectId,
  subStage,
  canWrite,
  isQcMember,
  inspectionType,
}: {
  projectId: string
  subStage: SubStageRow
  /** Migration 022 / Brief 050 §C — the Project or TNC team gate,
   *  resolved by the caller from subStage.stage (installation vs tnc). */
  canWrite: boolean
  isQcMember: boolean
  inspectionType: 'installation' | 'commissioning'
}) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()
  const [recording, setRecording] = useState(false)
  const showException = subStage.status === 'done' && subStage.qcDisplayState !== 'qc_passed'

  // Migration 024 / Brief 059 §3 — the required-on-completion photo gate,
  // mirroring UpdateProgressForm's own needsPhoto/hasPhoto/canSave shape
  // at row scale. `status` is optimistic local state so the select can
  // show 'done' the instant it's picked, without waiting on the photo;
  // `awaitingConfirm` is what actually gates the server write — selecting
  // any OTHER status still saves immediately, same as before this brief.
  const [status, setStatus] = useState(subStage.status)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  const canConfirm = Boolean(photoUrl) && !isPending && uploadStatus !== 'uploading'

  const submitStatus = (newStatus: string, photo: string | null) => {
    const formData = new FormData()
    formData.set('projectId', projectId)
    formData.set('subStageId', subStage.id)
    formData.set('status', newStatus)
    formData.set('stage', subStage.stage)
    formData.set('photoUrl', photo ?? '')
    startTransition(async () => {
      const result = await updateSubStageStatus(formData)
      if (result.error) {
        setSaveError(result.error)
        setStatus(subStage.status)
      } else {
        setSaveError(null)
      }
    })
  }

  const runUpload = async (file: File) => {
    pendingFileRef.current = file
    setUploadStatus('uploading')
    setUploadProgress(0)
    setUploadError(null)
    try {
      const dataUrl = await compressImage(file)
      setPhotoPreview(dataUrl)
      const { url } = await uploadProgressPhoto({
        projectId,
        dataUrl,
        stage: subStage.stage,
        onProgress: setUploadProgress,
      })
      setPhotoUrl(url)
      setUploadStatus('idle')
      pendingFileRef.current = null
    } catch (err) {
      setUploadStatus('error')
      setUploadError(err instanceof Error ? err.message : 'Upload failed.')
    }
  }

  const cancelDone = () => {
    setAwaitingConfirm(false)
    setStatus(subStage.status)
    setPhotoUrl(null)
    setPhotoPreview(null)
    setUploadStatus('idle')
    setUploadError(null)
  }

  return (
    // Brief 056 §6 — the matrix's drill-through anchor: `id` here is what
    // /projects/[projectId]/update#substage-<id> links land on, and
    // scroll-margin-top keeps it from tucking under any sticky header
    // this app later adds above the floor breakdown.
    <div id={`substage-${subStage.id}`} className="floor-breakdown__row floor-breakdown__row--anchor">
      <span className="floor-breakdown__row-label">
        {t(SUB_STAGE_KEYS[subStage.subStage] ?? 'subStageFirstFix')}
        {showException && (
          <span className="floor-breakdown__exception-flag">
            {subStage.qcDisplayState === 'qc_failed' ? t('floorMatrixLegendQcFailed') : t('floorBreakdownExceptionFlag')}
          </span>
        )}
      </span>
      <select
        className="floor-breakdown__status-select"
        value={status}
        disabled={!canWrite || isPending}
        onChange={(e) => {
          const newStatus = e.target.value
          if (newStatus === 'done') {
            setStatus('done')
            setAwaitingConfirm(true)
            setPhotoUrl(null)
            setPhotoPreview(null)
            setUploadStatus('idle')
            setUploadError(null)
          } else {
            setStatus(newStatus)
            setAwaitingConfirm(false)
            submitStatus(newStatus, null)
          }
        }}
      >
        {Object.entries(STATUS_KEYS).map(([value, key]) => (
          <option key={value} value={value}>
            {t(key)}
          </option>
        ))}
      </select>

      {!awaitingConfirm && subStage.photoUrl && (
        <button
          type="button"
          className="photo-thumb photo-thumb--small"
          onClick={() => setOverlayUrl(subStage.photoUrl)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- stored evidence photo, next/image is the wrong tool for an external Storage URL thumbnail */}
          <img src={subStage.photoUrl} alt={t('floorBreakdownSubStagePhotoAlt')} />
        </button>
      )}

      <span className="floor-breakdown__last-inspection">
        {t('floorBreakdownLastInspection')}:{' '}
        {subStage.lastInspectionStatus ? t(INSPECTION_STATUS_KEYS[subStage.lastInspectionStatus]) : t('floorBreakdownNoInspectionYet')}
      </span>

      {isQcMember && (
        <button type="button" className="btn btn--ghost" onClick={() => setRecording((v) => !v)}>
          {recording ? t('floorBreakdownRecordInspectionCancel') : t('floorBreakdownRecordInspection')}
        </button>
      )}

      {awaitingConfirm && (
        <div className="floor-breakdown__photo-panel">
          <div className="update-card__reason-head">
            <span className="update-card__reason-label">{t('photoLabel')}</span>
            <span className="required-badge">{t('updateRequired')}</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="photo-input"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void runUpload(file)
            }}
          />

          <div className="photo-picker">
            {photoPreview ? (
              <button type="button" className="photo-thumb" onClick={() => setOverlayUrl(photoUrl ?? photoPreview)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- local/compressed preview data URL, next/image doesn't take data: URLs */}
                <img src={photoPreview} alt={t('floorBreakdownSubStagePhotoAlt')} />
                {uploadStatus === 'uploading' ? (
                  <span className="photo-thumb__progress">
                    <span className="photo-thumb__progress-bar" style={{ width: `${uploadProgress}%` }} />
                  </span>
                ) : null}
              </button>
            ) : null}

            <div className="photo-picker__actions">
              <button
                type="button"
                className="btn btn--outline"
                disabled={uploadStatus === 'uploading'}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadStatus === 'uploading'
                  ? `${t('photoUploading')} ${uploadProgress}%`
                  : photoPreview
                    ? t('photoRetake')
                    : t('photoAdd')}
              </button>
            </div>
          </div>

          {uploadStatus === 'error' ? (
            <div className="floor-breakdown__error" role="alert">
              {uploadError}{' '}
              <button
                type="button"
                className="photo-retry"
                onClick={() => pendingFileRef.current && void runUpload(pendingFileRef.current)}
              >
                {t('photoRetry')}
              </button>
            </div>
          ) : null}

          <div className="floor-breakdown__photo-actions">
            <button type="button" className="btn btn--primary" disabled={!canConfirm} onClick={() => submitStatus('done', photoUrl)}>
              {t('floorBreakdownSubStagePhotoConfirm')}
            </button>
            <button type="button" className="btn btn--ghost" onClick={cancelDone}>
              {t('floorBreakdownRecordInspectionCancel')}
            </button>
          </div>

          {saveError && (
            <div className="floor-breakdown__error" role="alert">
              {saveError}
            </div>
          )}
        </div>
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

      {overlayUrl && (
        <div className="photo-overlay" onClick={() => setOverlayUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size stored evidence photo */}
          <img src={overlayUrl} alt={t('floorBreakdownSubStagePhotoAlt')} />
        </div>
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
  isQcMember,
}: {
  projectId: string
  deliverable: string
  status: string
  /** Migration 022 / Brief 050 §C — QC team, not PIC. */
  isQcMember: boolean
}) {
  const { t } = useLanguage()
  const [isPending, startTransition] = useTransition()

  return (
    <div className="floor-breakdown__row">
      <span className="floor-breakdown__row-label">{t(HANDOVER_KEYS[deliverable])}</span>
      <select
        className="floor-breakdown__status-select"
        defaultValue={status}
        disabled={!isQcMember || isPending}
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
