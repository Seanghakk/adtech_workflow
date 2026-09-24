'use client'

/**
 * Brief 100 Part E — v7.2 §12.3-§12.5 and §12.8 on the phone.
 *
 * The five rows, their groups, the row states, the three-segment status
 * control, and QC's inspection form. The photo gate is deliberately NOT
 * here: §12.6 makes "no photo, no save" structural by NAVIGATING to a
 * capture screen that has no save control, so choosing "done" is a
 * route change, not a panel that opens.
 */
import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { formatDateICT } from '@/lib/format/datetime'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { SUB_STAGE_KEYS, type PhoneGroup, type PhoneRow } from '@/lib/floorScan/rows'
import type { SubStageDisplayState } from '@/lib/subStageDisplayState'
import { recordInspection, saveSubStageStatus } from './actions'
import { inspectionInitialState, scanSaveInitialState } from './scan-shared'

/** §12.5 names all five of these computed states in its own words. */
const TAG_KEY: Record<SubStageDisplayState, DictionaryKey> = {
  not_started: 'phoneFloorTagNotStarted',
  in_progress: 'phoneFloorTagInProgress',
  awaiting_qc: 'phoneFloorTagAwaitingQc',
  qc_passed: 'phoneFloorTagQcPassed',
  qc_failed: 'phoneFloorTagQcFailed',
}

function groupLabelKey(group: PhoneGroup): DictionaryKey {
  if (group.kind === 'qc_waiting') return 'phoneFloorGroupQcWaiting'
  if (group.kind === 'already_inspected') return 'phoneFloorGroupAlreadyInspected'
  if (group.kind === 'actionable') {
    return group.stage === 'tnc' ? 'phoneFloorGroupTncYours' : 'phoneFloorGroupInstallationYours'
  }
  return group.stage === 'tnc' ? 'phoneFloorGroupOwnedTnc' : 'phoneFloorGroupOwnedInstallation'
}

export function FloorScanRows({
  floorId,
  floorLabel,
  projectId,
  groups,
  showQcNothingWaiting,
}: {
  floorId: string
  floorLabel: string
  projectId: string
  groups: PhoneGroup[]
  showQcNothingWaiting: boolean
}) {
  const { t } = useLanguage()
  // §12.4: "opening one row closes any other — five stacked segmented
  // controls is a wall of buttons at 390px." One id, not a set.
  const [openRowId, setOpenRowId] = useState<string | null>(null)

  // Held HERE, not in the form that produced it. Recording an inspection
  // moves that row out of "Waiting for you on this floor" and into
  // "Already inspected", so its <section> changes, React unmounts the row
  // and any state inside it — including the action state carrying §12.7's
  // "no one to notify" line. Measured: the first build lost the whole
  // saved block this way. This component is never remounted, so the
  // outcome survives the row moving out from under it.
  // The ACTION STATE itself lives here, not in the form. Recording an
  // inspection moves that row from "Waiting for you on this floor" to
  // "Already inspected", so React unmounts the row — and it does so in
  // the same commit that delivers the result, which means a child
  // holding the state never even gets an effect to hand it upward.
  // Measured twice: first the saved block vanished, then a lifted copy
  // via useEffect vanished for the same reason. Owning it here is the
  // only version that survives the row moving out from under it.
  const [inspectState, inspectAction, inspectPending] = useActionState(
    recordInspection,
    inspectionInitialState,
  )
  const [dismissed, setDismissed] = useState(false)
  const outcome = !dismissed && inspectState.kind === 'saved' ? inspectState : null

  return (
    <div className="phone-rows">
      {/* §21.6 — in place of the actionable group, never an empty group. */}
      {showQcNothingWaiting && (
        <p className="phone-rows__nothing-waiting">
          {t('phoneFloorQcNothingWaitingPrefix')} {floorLabel}{' '}
          {t('phoneFloorQcNothingWaitingSuffix')}
        </p>
      )}

      {outcome?.kind === 'saved' && (
        <div className="phone-row__saved phone-rows__outcome" role="status">
          <div className="phone-row__saved-head">
            {t(
              outcome.result === 'pass'
                ? 'phoneFloorInspectionPass'
                : 'phoneFloorInspectionFail',
            )}
          </div>
          {/* §12.7's conditional line. "has been told on Telegram" appears
              only when a message actually went — lib/floorScan/notify.ts. */}
          {outcome.notify?.kind === 'nobody' && <p>{t('phoneFloorSavedNobodyToNotify')}</p>}
          {outcome.notify?.kind === 'told' && (
            <p>
              {outcome.notify.name} {t('phoneFloorSavedTelegramSuffix')}
            </p>
          )}
          <button type="button" className="phone-row__open" onClick={() => setDismissed(true)}>
            {t('phoneFloorCloseAction')}
          </button>
        </div>
      )}

      {groups.map((group) => (
        <section key={`${group.kind}:${group.stage ?? ''}`} className="phone-rows__group">
          <h2 className="phone-rows__group-label">{t(groupLabelKey(group))}</h2>
          {group.rows.map((row) => (
            <Row
              key={row.id}
              row={row}
              floorId={floorId}
              projectId={projectId}
              isOpen={openRowId === row.id}
              onToggle={() => setOpenRowId((current) => (current === row.id ? null : row.id))}
              inspectAction={inspectAction}
              inspectPending={inspectPending}
              inspectError={inspectState.kind === 'error' ? inspectState.message : null}
            />
          ))}
        </section>
      ))}
    </div>
  )
}

function Row({
  row,
  floorId,
  projectId,
  isOpen,
  onToggle,
  inspectAction,
  inspectPending,
  inspectError,
}: {
  row: PhoneRow
  floorId: string
  projectId: string
  isOpen: boolean
  onToggle: () => void
  inspectAction: (formData: FormData) => void
  inspectPending: boolean
  inspectError: string | null
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const [saveState, saveAction, savePending] = useActionState(
    saveSubStageStatus,
    scanSaveInitialState,
  )

  const label = t(SUB_STAGE_KEYS[row.subStage] ?? 'subStageFirstFix')
  const canOpen = row.canUpdateStatus || row.canInspect

  // §12.4's subline: what happened, who, when. On an untouched row
  // §21.6 replaces all three with one sentence.
  const subline =
    row.displayState === 'not_started'
      ? t('phoneFloorNobodyUpdated')
      : [
          row.updatedByName ? `${t('phoneFloorSublineBy')} ${row.updatedByName}` : null,
          row.updatedAt ? formatDateICT(row.updatedAt) : null,
        ]
          .filter(Boolean)
          .join(' · ')

  return (
    <div
      className={[
        'phone-row',
        `phone-row--${row.displayState}`,
        canOpen ? '' : 'phone-row--readonly',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="phone-row__main">
        <div className="phone-row__text">
          <div className="phone-row__label">{label}</div>
          <div className="phone-row__subline">
            {row.displayState === 'qc_failed' && row.latestInspection?.notes
              ? `${t('phoneFloorReasonLabel')}: ${row.latestInspection.notes} · ${formatDateICT(
                  row.latestInspection.date,
                )}`
              : subline}
          </div>
        </div>
        <div className="phone-row__tag-wrap">
          {/* §12.4 — QC failed carries the hatch swatch beside the words. */}
          {row.displayState === 'qc_failed' && (
            <span className="phone-row__hatch" aria-hidden="true" />
          )}
          <span className={`phone-row__tag phone-row__tag--${row.displayState}`}>
            {t(TAG_KEY[row.displayState])}
          </span>
        </div>
      </div>

      {/* §12.4 read-only: inactive field, muted label and status, no tap
          affordance, no lock icon, no disabled-looking button — so there
          is simply no control here at all. */}
      {canOpen && (
        <button type="button" className="phone-row__open" onClick={onToggle} aria-expanded={isOpen}>
          {isOpen ? t('phoneFloorCloseAction') : t('phoneFloorUpdateAction')}
        </button>
      )}

      {isOpen && row.canUpdateStatus && (
        <div className="phone-row__control">
          <form action={saveAction}>
            <input type="hidden" name="floorId" value={floorId} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="subStageId" value={row.id} />
            <input type="hidden" name="stage" value={row.stage} />
            <div className="phone-seg" role="group">
              {(['not_started', 'in_progress'] as const).map((s) => (
                <button
                  key={s}
                  type="submit"
                  name="status"
                  value={s}
                  disabled={savePending}
                  className={`phone-seg__btn ${row.status === s ? 'phone-seg__btn--on' : ''}`}
                >
                  {t(s === 'not_started' ? 'phoneFloorTagNotStarted' : 'phoneFloorTagInProgress')}
                </button>
              ))}
              {/* §12.6 — "done" is a NAVIGATION, not a submit: the capture
                  screen has no save control, which is what makes "no
                  photo, no save" structural rather than a guard. */}
              <button
                type="button"
                disabled={savePending}
                className={`phone-seg__btn ${row.status === 'done' ? 'phone-seg__btn--on' : ''}`}
                onClick={() => router.push(`/floors/${floorId}/scan/done/${row.id}`)}
              >
                {t('statusDone')}
              </button>
            </div>
          </form>
          {/* §12.5 — the gate is announced before it is hit. */}
          <p className="phone-row__note">{t('phoneFloorPhotoNotice')}</p>
          {saveState.kind === 'error' && (
            <p className="phone-row__error" role="alert">
              {saveState.message}
            </p>
          )}
        </div>
      )}

      {isOpen && row.canInspect && (
        <InspectionForm
          row={row}
          floorId={floorId}
          projectId={projectId}
          action={inspectAction}
          pending={inspectPending}
          error={inspectError}
        />
      )}
    </div>
  )
}

/**
 * §12.8. Parity with the desktop recorder and nothing more. Fail is not
 * red — a failed inspection is a finding, not a schedule state.
 */
function InspectionForm({
  row,
  floorId,
  projectId,
  action,
  pending,
  error,
}: {
  row: PhoneRow
  floorId: string
  projectId: string
  action: (formData: FormData) => void
  pending: boolean
  error: string | null
}) {
  const { t } = useLanguage()
  const [result, setResult] = useState<'pass' | 'fail' | null>(null)

  return (
    <form action={action} className="phone-row__control">
      <input type="hidden" name="floorId" value={floorId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="subStageId" value={row.id} />
      <input type="hidden" name="stage" value={row.stage} />
      <input type="hidden" name="result" value={result ?? ''} />

      <div className="phone-inspect__title">{t('phoneFloorInspectionTitle')}</div>
      <div className="phone-inspect__results">
        <button
          type="button"
          className={`phone-inspect__pass ${result === 'pass' ? 'phone-inspect__pass--on' : ''}`}
          onClick={() => setResult('pass')}
        >
          {t('phoneFloorInspectionPass')}
        </button>
        <button
          type="button"
          className={`phone-inspect__fail ${result === 'fail' ? 'phone-inspect__fail--on' : ''}`}
          onClick={() => setResult('fail')}
        >
          {t('phoneFloorInspectionFail')}
        </button>
      </div>

      {result === 'fail' && (
        <label className="phone-inspect__reason">
          <span>{t('phoneFloorReasonLabel')}</span>
          <textarea name="notes" required />
          <span className="phone-inspect__reason-note">
            {t('phoneFloorInspectionReasonRequired')}
          </span>
        </label>
      )}

      <p className="phone-row__note">{t('phoneFloorInspectionNoRewindNote')}</p>

      <button type="submit" className="phone-inspect__save" disabled={!result || pending}>
        {t('phoneFloorInspectionSave')}
      </button>

      {error && (
        <p className="phone-row__error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
