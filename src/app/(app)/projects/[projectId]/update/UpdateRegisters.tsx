'use client'

/**
 * Brief 103 — v7.4 §22.1/§22.3/§22.4/§22.5/§22.6, the two registers.
 *
 * This replaces the old flat floor list and the page-level QC chip
 * strip. What it does NOT replace is the machinery inside a row: the
 * status dropdown and its save, the photo gate, the inspection recorder
 * and the shop drawing drawer are imported unchanged from
 * FloorBreakdown, exactly as §22 requires ("This is a layout and
 * presentation change").
 *
 * Open/closed state lives in the URL, not in storage (§22.5): ?floor=
 * carries it, toggles use replaceState so a refresh keeps the view and
 * Back does not step through every toggle, and the same parameter is
 * what the jump grid, the Needs attention lines and every incoming link
 * from Delays & blockers, the QC list, the Floor progress list and a
 * matrix cell all use.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { SUB_STAGE_KEYS } from '@/lib/floorScan/rows'
import {
  defaultOpenFloorIds,
  deriveNeedsAttention,
  countCellStates,
  completeBasis,
  floorBand,
  floorHasOpenWork,
  floorOption,
  type FloorSummary,
} from '@/lib/updatePage/summary'
import { UpdateSummary } from './UpdateSummary'
import {
  SubStageRowView,
  DrawingRowView,
  MaterialInspectionRecorder,
  type DrawingRow,
  type FloorRow,
  type HandoverItem,
  HandoverRowView,
  HANDOVER_ORDER,
} from './FloorBreakdown'
import { AddDrawingForm } from './AddDrawingForm'
import { canAddDrawing } from '@/lib/shopDrawing/addDrawing'
import type { DrawingActor } from '@/lib/shopDrawing/permissions'
import type { MatrixCellState } from '../floor-matrix'

export interface UpdateFloor extends FloorRow {
  towerLabel: string | null
  /** Per sub-stage, the matrix cell state and its age clock. */
  cellBySubStageId: Record<string, { state: MatrixCellState; clockDate: string | null; holderName: string | null; updatedAt: string | null }>
  doneCount: number
  applicableCount: number
}

export function UpdateRegisters({
  projectId,
  soLabel,
  soIsPending,
  projectName,
  picName,
  stream,
  percentCalculated,
  floors,
  projectShopDrawing,
  isPic,
  isQcMember,
  isProjectTeamMember,
  isTncTeamMember,
  drawingActor,
  systems,
  systemsReadFailed,
  ageOfIso,
  handoverItems,
}: {
  projectId: string
  soLabel: string
  soIsPending: boolean
  projectName: string
  picName: string | null
  stream: string
  percentCalculated: number | null
  floors: UpdateFloor[]
  projectShopDrawing: DrawingRow[]
  isPic: boolean
  isQcMember: boolean
  isProjectTeamMember: boolean
  isTncTeamMember: boolean
  drawingActor: DrawingActor
  systems: { id: string; name: string; cadCode: string | null }[]
  systemsReadFailed: boolean
  /** Brief 103 §4 — the handover checklist. v7.4 §22 does not mention
   *  it anywhere: it lists project-level drawings and the floors, and
   *  nothing else. Rather than drop a working feature on the strength of
   *  an omission, it is kept at the end of the project-level section and
   *  flagged in the Result doc for §22 to say what it wants. */
  handoverItems: HandoverItem[]
  /** Age in days for a clock date, computed server-side in ICT so the
   *  client never re-derives it in the browser's own timezone. */
  ageOfIso: Record<string, number>
}) {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const floorFromUrl = searchParams.get('floor')
  const headerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [openDrawingId, setOpenDrawingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'open'>('all')

  const floorIds = useMemo(() => floors.map((f) => f.id), [floors])
  const [openIds, setOpenIds] = useState<string[]>(() =>
    defaultOpenFloorIds(floorIds, floorFromUrl),
  )

  const ageOf = useCallback((iso: string | null) => (iso ? (ageOfIso[iso] ?? 0) : 0), [ageOfIso])

  const summaries: FloorSummary[] = useMemo(
    () =>
      floors.map((f) => ({
        floorId: f.id,
        label: f.label,
        towerLabel: f.towerLabel,
        cells: f.subStages.map((s) => ({
          subStageId: s.id,
          stage: s.stage,
          subStage: s.subStage,
          state: f.cellBySubStageId[s.id]?.state ?? 'not_started',
          clockDate: f.cellBySubStageId[s.id]?.clockDate ?? null,
          holderName: f.cellBySubStageId[s.id]?.holderName ?? null,
        })),
      })),
    [floors],
  )

  const counts = useMemo(
    () => countCellStates(summaries.flatMap((f) => f.cells.map((c) => c.state))),
    [summaries],
  )
  const needs = useMemo(() => deriveNeedsAttention(summaries, ageOf), [summaries, ageOf])
  const basis = useMemo(
    () =>
      completeBasis(
        summaries,
        projectShopDrawing.length,
        floors.reduce((n, f) => n + f.shopDrawing.length, 0),
      ),
    [summaries, projectShopDrawing.length, floors],
  )

  /** §22.5 — replaceState, never a push: Back must not step through
   *  every toggle, and a refresh must keep the view. */
  const writeUrl = useCallback((floorId: string | null) => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (floorId) url.searchParams.set('floor', floorId)
    else url.searchParams.delete('floor')
    window.history.replaceState(null, '', url.toString())
  }, [])

  const goToFloor = useCallback(
    (floorId: string) => {
      setOpenIds((prev) => (prev.includes(floorId) ? prev : [...prev, floorId]))
      writeUrl(floorId)
      // §22.5 — arriving at a floor scrolls its header to the top of the
      // work register.
      requestAnimationFrame(() => {
        headerRefs.current[floorId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    },
    [writeUrl],
  )

  // An incoming ?floor= (Delays & blockers, the QC list, Floor progress,
  // a matrix cell) scrolls to that floor on arrival. It does NOT need to
  // open it here: arriving is a navigation, so this component mounts
  // fresh and defaultOpenFloorIds has already opened it from the same
  // parameter. Opening from an effect would be setting state during
  // render-commit for something the initial state already knows.
  useEffect(() => {
    if (!floorFromUrl || !floorIds.includes(floorFromUrl)) return
    const el = headerRefs.current[floorFromUrl]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // only on the arriving value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorFromUrl])

  function toggleFloor(floorId: string) {
    setOpenIds((prev) => {
      const next = prev.includes(floorId) ? prev.filter((id) => id !== floorId) : [...prev, floorId]
      writeUrl(next.includes(floorId) ? floorId : null)
      return next
    })
  }

  const visibleFloors = filter === 'all' ? floors : floors.filter((f, i) => floorHasOpenWork(summaries[i]))
  const openWorkCount = summaries.filter(floorHasOpenWork).length

  return (
    <div className="update-registers">
      <UpdateSummary
        soLabel={soLabel}
        soIsPending={soIsPending}
        projectName={projectName}
        picName={picName}
        stream={stream}
        percent={percentCalculated}
        counts={counts}
        basis={basis}
        needs={needs}
        hasFloors={floors.length > 0}
        qcListHref="/qc-inspections"
        onGoToFloor={goToFloor}
        floors={summaries.map((s) => ({
          ...s,
          band: floorBand(s, ageOf),
          isOpen: openIds.includes(s.floorId),
          option: floorOption(s, ageOf),
        }))}
      />

      <div className="update-work">
        {/* ---- §22.3 toolbar ---- */}
        {floors.length > 0 && (
          <div className="update-work__toolbar">
            <div className="update-work__filter" role="group">
              <button
                type="button"
                className={`update-work__seg${filter === 'all' ? ' update-work__seg--on' : ''}`}
                onClick={() => setFilter('all')}
              >
                {t('updateFilterAll')} {floors.length}
              </button>
              <button
                type="button"
                className={`update-work__seg${filter === 'open' ? ' update-work__seg--on' : ''}`}
                onClick={() => setFilter('open')}
              >
                {t('updateFilterOpen')} {openWorkCount}
              </button>
            </div>
            <div className="update-work__bulk">
              <button type="button" onClick={() => setOpenIds(floorIds)}>
                {t('updateOpenAll')}
              </button>
              <span aria-hidden="true"> · </span>
              <button type="button" onClick={() => { setOpenIds([]); writeUrl(null) }}>
                {t('updateCloseAll')}
              </button>
            </div>
          </div>
        )}

        {/* ---- §22.3 project level ---- */}
        <section className="update-work__section">
          <h2 className="update-work__heading">{t('updateProjectLevelHeading')}</h2>
          <p className="update-work__subline">{t('updateProjectLevelSubline')}</p>
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
          {/* Brief 102's add action. §22.6 keeps the drawing tables in
              both places, and three links (PR #74) now point at this page
              specifically to reach this control — losing it here would
              undo all of that. */}
          <AddDrawingForm
            projectId={projectId}
            floors={floors.map((f) => ({ id: f.id, label: f.label }))}
            canAdd={canAddDrawing(drawingActor)}
            defaultScope="project"
            systems={systems}
            systemsReadFailed={systemsReadFailed}
          />

          {handoverItems.length > 0 && (
            <div className="update-work__handover">
              {[...handoverItems]
                .sort((a, b) => HANDOVER_ORDER.indexOf(a.deliverable) - HANDOVER_ORDER.indexOf(b.deliverable))
                .map((h) => (
                <HandoverRowView
                  key={h.deliverable}
                  projectId={projectId}
                  deliverable={h.deliverable}
                  status={h.status}
                  isQcMember={isQcMember}
                />
                ))}
            </div>
          )}
          {isQcMember && (
            <MaterialInspectionRecorder
              projectId={projectId}
              floors={floors.map((f) => ({ id: f.id, label: f.label }))}
            />
          )}
        </section>

        {/* ---- §22.3 floors ---- */}
        {floors.length === 0 ? null : (
          <section className="update-work__section">
            <h2 className="update-work__heading">{t('updateFloorsHeading')}</h2>
            <p className="update-work__subline">
              {floors.length} {t('updateFloorsSublineSuffix')}
            </p>

            {visibleFloors.length === 0 ? (
              // §22.9 — the filter with nothing open is an empty state,
              // never a blank list.
              <div className="wf-empty-state-card">
                <p className="wf-empty-state-card__headline">
                  {t('updateEmptyNoOpenPrefix')} {soLabel} {t('updateEmptyNoOpenSuffix')}
                </p>
                <p className="wf-empty-state-card__body">{t('updateEmptyNoOpenBody')}</p>
                <div className="wf-empty-state-card__actions">
                  <button type="button" className="btn btn--primary" onClick={() => setFilter('all')}>
                    {t('updateEmptyNoOpenAction')}
                  </button>
                </div>
              </div>
            ) : (
              visibleFloors.map((floor) => {
                const summary = summaries.find((s) => s.floorId === floor.id)!
                const isOpen = openIds.includes(floor.id)
                const band = floorBand(summary, ageOf)
                return (
                  <FloorRowView
                    key={floor.id}
                    floor={floor}
                    summary={summary}
                    band={band}
                    isOpen={isOpen}
                    ageOf={ageOf}
                    onToggle={() => toggleFloor(floor.id)}
                    headerRef={(el) => {
                      headerRefs.current[floor.id] = el
                    }}
                    projectId={projectId}
                    isPic={isPic}
                    isQcMember={isQcMember}
                    isProjectTeamMember={isProjectTeamMember}
                    isTncTeamMember={isTncTeamMember}
                    drawingActor={drawingActor}
                    systems={systems}
                    systemsReadFailed={systemsReadFailed}
                    openDrawingId={openDrawingId}
                    setOpenDrawingId={setOpenDrawingId}
                  />
                )
              })
            )}
          </section>
        )}
      </div>
    </div>
  )
}

/** §22.4 closed, §22.6 open. */
function FloorRowView({
  floor,
  summary,
  band,
  isOpen,
  ageOf,
  onToggle,
  headerRef,
  projectId,
  isPic,
  isQcMember,
  isProjectTeamMember,
  isTncTeamMember,
  drawingActor,
  systems,
  systemsReadFailed,
  openDrawingId,
  setOpenDrawingId,
}: {
  floor: UpdateFloor
  summary: FloorSummary
  band: MatrixCellState | null
  isOpen: boolean
  ageOf: (iso: string | null) => number
  onToggle: () => void
  headerRef: (el: HTMLButtonElement | null) => void
  projectId: string
  isPic: boolean
  isQcMember: boolean
  isProjectTeamMember: boolean
  isTncTeamMember: boolean
  drawingActor: DrawingActor
  systems: { id: string; name: string; cadCode: string | null }[]
  systemsReadFailed: boolean
  openDrawingId: string | null
  setOpenDrawingId: (id: string | null) => void
}) {
  const { t } = useLanguage()

  const failedCount = summary.cells.filter((c) => c.state === 'qc_failed').length
  const awaitingCount = summary.cells.filter((c) => c.state === 'awaiting_qc').length
  const allPassed =
    summary.cells.length > 0 && summary.cells.every((c) => c.state === 'qc_passed' || c.state === 'not_applicable')
  const nothingStarted = summary.cells.every((c) => c.state === 'not_started' || c.state === 'not_applicable')

  // §22.4's holder line — of the OLDEST OPEN cell (open item 20: the
  // member who last changed that sub-stage's status).
  const openCells = summary.cells.filter((c) =>
    ['in_progress', 'awaiting_qc', 'qc_failed', 'stalled'].includes(c.state),
  )
  let oldest = openCells[0] ?? null
  for (const c of openCells) if (ageOf(c.clockDate) > ageOf(oldest?.clockDate ?? null)) oldest = c
  const oldestAge = oldest ? ageOf(oldest.clockDate) : 0

  const installation = floor.subStages.filter((s) => s.stage === 'installation')
  const tnc = floor.subStages.filter((s) => s.stage === 'tnc')

  return (
    <div
      className={`update-floor${isOpen ? ' update-floor--open' : ''}`}
      style={band ? undefined : { borderLeftColor: 'transparent' }}
      data-band={band ?? 'none'}
    >
      <button
        ref={headerRef}
        type="button"
        className="update-floor__head"
        onClick={onToggle}
        aria-expanded={isOpen}
        id={`floor-${floor.id}`}
      >
        <span className="update-floor__chevron" aria-hidden="true">
          {isOpen ? '▾' : '▸'}
        </span>
        <span className="update-floor__label">
          {floor.label}
          {floor.towerLabel && <span className="update-floor__tower">{floor.towerLabel}</span>}
        </span>
        <span className="update-floor__holder">
          {allPassed ? (
            <>
              <span className="update-floor__holder-name">
                {t('updateFloorAllPassedPrefix')} {summary.cells.length}
              </span>{' '}
              {t('updateFloorAllPassedSuffix')}
            </>
          ) : nothingStarted ? (
            <span className="update-floor__nothing">{t('updateFloorNotStarted')}</span>
          ) : oldest ? (
            <>
              {oldest.holderName && (
                <span className="update-floor__holder-name">{oldest.holderName}</span>
              )}
              <span className={`update-floor__age${oldestAge >= 16 ? ' update-floor__age--stalled' : ''}`}>
                {oldestAge}d
              </span>
              <span className="update-floor__on">
                {t('updateFloorOnPrefix')} {t(SUB_STAGE_KEYS[oldest.subStage] ?? 'subStageFirstFix')}
              </span>
            </>
          ) : null}
        </span>
        <span className="update-floor__flags">
          {failedCount > 0 && (
            <span className="update-floor__flag">
              <span className="update-floor__hatch" aria-hidden="true" />
              {failedCount} {t('updateFloorFlagFailed')}
            </span>
          )}
          {awaitingCount > 0 && (
            <span className="update-floor__flag update-floor__flag--awaiting">
              <span className="update-floor__amber" aria-hidden="true" />
              {awaitingCount} {t('updateFloorFlagAwaiting')}
            </span>
          )}
        </span>
        <span className="update-floor__done">
          {floor.doneCount} {t('updateFloorDoneCountMiddle')} {floor.applicableCount}{' '}
          {t('updateFloorDoneCountSuffix')}
        </span>
      </button>

      {isOpen && (
        <div className="update-floor__body">
          <div className="update-floor__kicker">{t('updateFloorDrawingsKicker')}</div>
          {floor.shopDrawing.length === 0 ? (
            <p className="update-floor__no-drawings">
              {t('updateFloorNoDrawingsPrefix')} {floor.label}.
            </p>
          ) : (
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
          )}

          <AddDrawingForm
            projectId={projectId}
            floors={[{ id: floor.id, label: floor.label }]}
            canAdd={canAddDrawing(drawingActor)}
            defaultScope="floor"
            defaultFloorId={floor.id}
            systems={systems}
            systemsReadFailed={systemsReadFailed}
          />

          <SubStageGroup
            title={t('floorBreakdownInstallationTitle')}
            rows={installation}
            canWrite={isProjectTeamMember}
            teamName="Project Management"
            projectId={projectId}
            isQcMember={isQcMember}
            inspectionType="installation"
          />
          <SubStageGroup
            title={t('floorBreakdownTncTitle')}
            rows={tnc}
            canWrite={isTncTeamMember}
            teamName="TNC"
            projectId={projectId}
            isQcMember={isQcMember}
            inspectionType="commissioning"
          />
        </div>
      )}
    </div>
  )
}

/** §22.6's two groups, each with the shared data-table header. */
function SubStageGroup({
  title,
  rows,
  canWrite,
  teamName,
  projectId,
  isQcMember,
  inspectionType,
}: {
  title: string
  rows: FloorRow['subStages']
  canWrite: boolean
  teamName: string
  projectId: string
  isQcMember: boolean
  inspectionType: 'installation' | 'commissioning'
}) {
  const { t } = useLanguage()
  if (rows.length === 0) return null

  return (
    <div className="update-group">
      <h4 className="update-group__title">{title}</h4>
      {/* §22.6 / §22.9 — a sentence naming who can, never a disabled
          control. The controls themselves stay enabled-or-absent inside
          SubStageRowView, which is unchanged. */}
      {!canWrite && (
        <p className="update-group__refused">
          {t('updateGroupRefusedPrefix')} {teamName} {t('updateGroupRefusedSuffix')}
        </p>
      )}
      <div className="update-group__head">
        <span>{t('updateColSubStage')}</span>
        <span>{t('updateColStatus')}</span>
        <span>{t('updateColPhoto')}</span>
        <span>{t('updateColQc')}</span>
      </div>
      {rows.map((s) => (
        <SubStageRowView
          key={s.id}
          projectId={projectId}
          subStage={s}
          canWrite={canWrite}
          isQcMember={isQcMember}
          inspectionType={inspectionType}
        />
      ))}
    </div>
  )
}
