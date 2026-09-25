'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { formatDateICT } from '@/lib/format/datetime'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import {
  deriveLifecycle,
  originLine,
  type SubmissionRecord,
  type CheckRecord,
  type Stage,
} from '@/lib/shopDrawing/lifecycle'
import { canDraft, canRecordCheck, canSubmitOrReturn, type DrawingActor } from '@/lib/shopDrawing/permissions'
import { setPreSubmissionStage, recordInternalCheck, submitRevision, recordReturn } from './drawer-actions'
import { drawerInitialState } from './drawer-shared'

export interface DrawerSubmission extends SubmissionRecord {
  submittedByName: string | null
  checkedByName: string | null
  checkedAt: string | null
}

export interface DrawerDrawing {
  id: string
  typeLabel: string
  floorLabel: string | null
  createdAt: string
  /** Brief 102 — NULL for trigger-seeded rows and anything predating
   *  migration 039. Rendered as an explicit sentence, never "unknown". */
  createdByName: string | null
  status: 'not_started' | 'in_progress' | 'done'
  preSubmissionStage: 'drafting' | 'internal_check' | null
  draftingStartedAt: string | null
  legacyDoneNoHistory: boolean
  submissions: DrawerSubmission[]
  checks: (CheckRecord & { checkedByName: string | null })[]
}

const STAGE_CELLS: { stage: Stage[]; key: DictionaryKey }[] = [
  { stage: ['drafting'], key: 'drawerStageDrafting' },
  { stage: ['internal_check', 'checked'], key: 'drawerStageInternalCheck' },
  { stage: ['submitted'], key: 'drawerStageSubmitted' },
  { stage: ['approved'], key: 'drawerStageApproved' },
]

const PARTY_KEYS: Record<string, DictionaryKey> = {
  client: 'drawerPartyClient',
  consultant: 'drawerPartyConsultant',
  main_contractor: 'drawerPartyMainContractor',
  other: 'drawerPartyOther',
}

const today = () => new Date().toISOString().slice(0, 10)
/* Brief 102 — was new Date(iso).toLocaleDateString(), which renders with
   the SERVER's locale and timezone on the server and the DEVICE's on the
   client. That mismatch is what silently regenerated the whole client
   tree on the phone floor page in Brief 100 Part E, taking component
   state with it. formatDateICT is what this app pins dates to for
   exactly that reason. */
const shortDate = (iso: string) => formatDateICT(iso)

/**
 * Brief 100 Part B — the shop drawing drawer (v7.2 §9).
 *
 * A drawer off the update screen, not a detail page: the update screen is
 * a list worked through in one sitting, and a detail page costs a
 * navigation round trip per drawing (§9.1). Desktop only — there is no
 * phone version of the recording screen.
 *
 * Everything shown here is derived by lib/shopDrawing/lifecycle.ts, and
 * every write is enforced by migrations 027–028. This component decides
 * what to show and nothing else.
 */
export function ShopDrawingDrawer({
  projectId,
  drawing,
  actor,
  onClose,
}: {
  projectId: string
  drawing: DrawerDrawing
  actor: DrawingActor
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [showHistory, setShowHistory] = useState(false)

  const input = {
    status: drawing.status,
    preSubmissionStage: drawing.preSubmissionStage,
    draftingStartedAt: drawing.draftingStartedAt,
    legacyDoneNoHistory: drawing.legacyDoneNoHistory,
    submissions: drawing.submissions,
    checks: drawing.checks,
    now: new Date(),
  }
  const life = deriveLifecycle(input)
  const origin = originLine(input, life)

  const kicker = drawing.floorLabel
    ? `${t('drawerKickerFloorPrefix')} ${drawing.floorLabel}`
    : t('drawerKickerProject')

  return (
    <aside className="sd-drawer" role="dialog" aria-label={drawing.typeLabel}>
      <div className="sd-drawer__header">
        <div>
          <div className="sd-drawer__kicker">{kicker}</div>
          <h3 className="sd-drawer__title">{drawing.typeLabel}</h3>
        </div>
        <button type="button" className="sd-drawer__close" onClick={onClose}>
          {t('drawerClose')}
        </button>
      </div>

      {showHistory ? (
        <>
          <button type="button" className="sd-drawer__link" onClick={() => setShowHistory(false)}>
            {t('drawerBackToDrawing')}
          </button>
          <History drawing={drawing} t={t} />
        </>
      ) : (
        <>
          {/* §9.3 current state + origin line */}
          <p className="sd-drawer__state">
            {life.stage === 'not_started' ? (
              t('drawerJustCreatedState')
            ) : (
              <>
                {t('drawerRevPrefix')} {life.currentRevision}
                {origin.startedAt && (
                  <span className="sd-drawer__origin">
                    {' '}
                    {t('drawerOriginStartedPrefix')} {shortDate(origin.startedAt)}
                    {origin.afterCReturn ? ` ${t('drawerOriginAfterC')}` : ''}
                  </span>
                )}
              </>
            )}
          </p>
          {life.stage === 'not_started' && (
            <p className="sd-drawer__origin">
              {t('drawerJustCreatedAddedPrefix')} {shortDate(drawing.createdAt)}
              {/* §21.4 asks for "added <date> by <name>". Part B could
                  only ever render the date — there was no created_by.
                  Rows that still have none are the trigger-seeded ones:
                  they say so, rather than reading "by unknown". */}
              {drawing.createdByName ? (
                <> {t('drawerJustCreatedAddedBy')} {drawing.createdByName}</>
              ) : (
                <> · {t('drawerAddedByNotRecorded')}</>
              )}{' '}
              · {t('drawerJustCreatedNobody')}
            </p>
          )}

          {/* §9.3 — a position indicator, never a set of buttons. */}
          <div className="sd-drawer__strip" aria-hidden="true">
            {STAGE_CELLS.map((cell) => (
              <span
                key={cell.key}
                className={`sd-drawer__strip-cell${cell.stage.includes(life.stage) ? ' sd-drawer__strip-cell--current' : ''}`}
              >
                {t(cell.key)}
              </span>
            ))}
          </div>
          <div className="sd-drawer__holders">
            <span className="sd-drawer__holder sd-drawer__holder--us">{t('drawerHeldByAdtech')}</span>
            <span className="sd-drawer__holder sd-drawer__holder--them">{t('drawerHeldByReviewer')}</span>
          </div>

          <Clocks life={life} drawing={drawing} t={t} />

          <Recording projectId={projectId} drawing={drawing} life={life} actor={actor} t={t} />

          <button type="button" className="sd-drawer__link" onClick={() => setShowHistory(true)}>
            {t('drawerOpenHistory')}
          </button>
        </>
      )}
    </aside>
  )
}

type T = (key: DictionaryKey) => string

/** §9.4 — stated symmetrically and never coloured: same size, same weight,
 *  same label form, side by side. */
function Clocks({
  life,
  drawing,
  t,
}: {
  life: ReturnType<typeof deriveLifecycle>
  drawing: DrawerDrawing
  t: T
}) {
  const { withAdtechDays, withReviewerDays, showProportionBar } = life.clocks
  const reviewerOrg = life.openSubmission?.reviewerOrg ?? life.lastReturned?.reviewerOrg ?? null
  const reviewerParty = life.openSubmission?.reviewerParty ?? life.lastReturned?.reviewerParty ?? null
  const total = (withAdtechDays ?? 0) + (withReviewerDays ?? 0)

  return (
    <section className="sd-drawer__clocks">
      <h4 className="sd-drawer__clocks-heading">{t('drawerClocksHeading')}</h4>
      <div className="sd-drawer__clock-pair">
        <div className="sd-drawer__clock">
          <span className="sd-drawer__clock-label">{t('drawerClockWithAdtech')}</span>
          <span className="sd-drawer__clock-value">
            {/* A drawing that has not started yet has no clock to report —
                that is §21.4's "Not started", not §9.4's permanent "start
                not recorded", which is specifically a drawing that DID
                leave not-started without a recorded start. */}
            {drawing.status === 'not_started' ? (
              <span className="sd-drawer__clock-value--words">{t('drawerClocksNotStarted')}</span>
            ) : withAdtechDays === null ? (
              <span className="sd-drawer__clock-value--words">{t('drawerStartNotRecorded')}</span>
            ) : (
              `${withAdtechDays} ${t('drawerClockDaysSuffix')}`
            )}
          </span>
        </div>
        <div className="sd-drawer__clock">
          <span className="sd-drawer__clock-label">
            {t('drawerClockWithReviewer')}
            {reviewerOrg && (
              <span className="sd-drawer__clock-org">
                {' '}
                ({reviewerOrg}
                {reviewerParty ? `, ${t(PARTY_KEYS[reviewerParty] ?? 'drawerPartyOther').toLowerCase()}` : ''})
              </span>
            )}
          </span>
          <span className="sd-drawer__clock-value">
            {withReviewerDays === null ? (
              <span className="sd-drawer__clock-value--words">{t('drawerClocksNeverSent')}</span>
            ) : (
              `${withReviewerDays} ${t('drawerClockDaysSuffix')}`
            )}
          </span>
        </div>
      </div>
      {showProportionBar && withReviewerDays !== null && total > 0 && (
        /* Ink for us against a neutral hatch for them — not amber vs ink,
           which would read as good vs bad (§9.4). */
        <div className="sd-drawer__proportion" aria-hidden="true">
          <span className="sd-drawer__proportion-us" style={{ width: `${((withAdtechDays ?? 0) / total) * 100}%` }} />
          <span className="sd-drawer__proportion-them" />
        </div>
      )}
    </section>
  )
}

/** §9.5 — whichever of the four recordings this drawing is up to. */
function Recording({
  projectId,
  drawing,
  life,
  actor,
  t,
}: {
  projectId: string
  drawing: DrawerDrawing
  life: ReturnType<typeof deriveLifecycle>
  actor: DrawingActor
  t: T
}) {
  const [stageState, stageAction, stagePending] = useActionState(setPreSubmissionStage, drawerInitialState)
  const [checkState, checkAction, checkPending] = useActionState(recordInternalCheck, drawerInitialState)
  const [submitState, submitAction, submitPending] = useActionState(submitRevision, drawerInitialState)
  const [returnState, returnAction, returnPending] = useActionState(recordReturn, drawerInitialState)

  if (life.stage === 'approved') {
    return (
      <p className="sd-drawer__confirmed" role="status">
        {t('drawerAutoDoneConfirmed')}
      </p>
    )
  }

  // §21.4 "Cannot act" — a sentence, never a disabled control.
  if (!canDraft(actor) && !canRecordCheck(actor) && !canSubmitOrReturn(actor)) {
    return (
      <div className="wf-refused-card" role="status">
        <p className="wf-empty-state-card__headline">{t('drawerCannotActHeadline')}</p>
        <p style={{ margin: 0 }}>{t('drawerCannotActBody')}</p>
      </div>
    )
  }

  // Awaiting a return: the only thing to record is the return itself.
  if (life.stage === 'submitted' && life.openSubmission) {
    if (!canSubmitOrReturn(actor)) {
      return (
        <p className="wf-refused-card" role="status">
          {t('drawerRefusedSubmit')}
        </p>
      )
    }
    return (
      <section className="sd-drawer__recording">
        <h4 className="sd-drawer__recording-heading">{t('drawerReturnHeading')}</h4>
        <form action={returnAction} className="wf-form-row wf-form-row--stack">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="submissionId" value={life.openSubmission.id} />
          <label className="wf-form-row__field">
            <span className="wf-form-row__label">{t('drawerReturnDate')}</span>
            <input className="wf-form-row__input" type="date" name="returnedAt" defaultValue={today()} required />
          </label>
          {/* §9.5 — three radio rows, each carrying its consequence. Shape,
              not hue: a C is an ordinary step in a review, never red. */}
          <div className="sd-drawer__codes">
            {(
              [
                ['A', 'drawerCodeA', 'drawerCodeAConsequence', 'filled'],
                ['B', 'drawerCodeB', 'drawerCodeBConsequence', 'filled'],
                ['C', 'drawerCodeC', 'drawerCodeCConsequence', 'outlined'],
              ] as const
            ).map(([code, labelKey, consequenceKey, shape]) => (
              <label key={code} className="sd-drawer__code-row">
                <input type="radio" name="code" value={code} required />
                <span className={`sd-drawer__code-glyph sd-drawer__code-glyph--${shape}`} aria-hidden="true" />
                <span>
                  <strong>{t(labelKey)}</strong>
                  <span className="sd-drawer__code-consequence"> {t(consequenceKey)}</span>
                </span>
              </label>
            ))}
          </div>
          <label className="wf-form-row__field">
            <span className="wf-form-row__label">{t('drawerReturnComments')}</span>
            <input className="wf-form-row__input" name="comments" />
          </label>
          <button type="submit" className="wf-form-row__submit" disabled={returnPending}>
            {t('drawerReturnButton')}
          </button>
          {returnState.error && <span className="wf-admin-row__confirm-error">{returnState.error}</span>}
        </form>
      </section>
    )
  }

  return (
    <section className="sd-drawer__recording">
      {/* §9.5 first recording. */}
      {(life.stage === 'not_started' || life.stage === 'drafting') && canDraft(actor) && (
        <form action={stageAction} className="wf-form-row">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="itemId" value={drawing.id} />
          <input
            type="hidden"
            name="stage"
            value={life.stage === 'not_started' ? 'drafting' : 'internal_check'}
          />
          <button type="submit" className="wf-form-row__submit" disabled={stagePending}>
            {life.stage === 'not_started' ? t('drawerStartDrafting') : t('drawerMoveToInternalCheck')}
          </button>
          {life.stage === 'not_started' && (
            <span className="sd-drawer__hint">{t('drawerStartDraftingNote')}</span>
          )}
          {stageState.error && <span className="wf-admin-row__confirm-error">{stageState.error}</span>}
        </form>
      )}
      {life.stage === 'not_started' && !canDraft(actor) && (
        <div className="wf-refused-card" role="status">
          <p className="wf-empty-state-card__headline">{t('drawerCannotActHeadline')}</p>
          <p style={{ margin: 0 }}>{t('drawerCannotActBody')}</p>
        </div>
      )}
      {drawing.status === 'in_progress' && drawing.preSubmissionStage === 'drafting' && (
        <p className="sd-drawer__confirmed" role="status">
          {t('drawerAutoStatusConfirmed')}
        </p>
      )}

      {/* §9.5 second recording — the manager's stamp, or the sentence. */}
      {life.stage === 'internal_check' &&
        (canRecordCheck(actor) ? (
          <form action={checkAction} className="sd-drawer__stamp">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="itemId" value={drawing.id} />
            <p className="sd-drawer__stamp-text">
              {t('drawerStampPrefix')} {actor.displayName ?? ''} {t('drawerStampOn')}{' '}
              {new Date().toLocaleString()}
              {t('drawerStampSuffix')}
            </p>
            <button type="submit" className="wf-form-row__submit" disabled={checkPending}>
              {t('drawerCheckButtonPrefix')} {life.currentRevision}
            </button>
            {checkState.error && <span className="wf-admin-row__confirm-error">{checkState.error}</span>}
          </form>
        ) : (
          <p className="wf-refused-card" role="status">
            {t('drawerWaitingForManager')}
          </p>
        ))}

      {/* §9.5 third recording — only once the current revision is checked. */}
      {life.stage === 'checked' ? (
        canSubmitOrReturn(actor) ? (
          <form action={submitAction} className="wf-form-row wf-form-row--stack">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="itemId" value={drawing.id} />
            <input type="hidden" name="revision" value={life.currentRevision} />
            <fieldset className="sd-drawer__parties">
              <legend className="wf-form-row__label">{t('drawerReviewerParty')}</legend>
              {(['client', 'consultant', 'main_contractor', 'other'] as const).map((party, i) => (
                <label key={party} className="sd-drawer__party">
                  <input type="radio" name="reviewerParty" value={party} defaultChecked={i === 1} required />
                  {t(PARTY_KEYS[party])}
                </label>
              ))}
            </fieldset>
            <label className="wf-form-row__field">
              <span className="wf-form-row__label">{t('drawerReviewerOrg')}</span>
              <input className="wf-form-row__input" name="reviewerOrg" />
            </label>
            <label className="wf-form-row__field">
              <span className="wf-form-row__label">{t('drawerDateSent')}</span>
              <input className="wf-form-row__input" type="date" name="submittedAt" defaultValue={today()} required />
            </label>
            <button type="submit" className="wf-form-row__submit" disabled={submitPending}>
              {t('drawerSubmitButtonPrefix')} {life.currentRevision}
            </button>
            <span className="sd-drawer__hint">{t('drawerSubmitFootnote')}</span>
            {submitState.error && <span className="wf-admin-row__confirm-error">{submitState.error}</span>}
          </form>
        ) : (
          <p className="wf-refused-card" role="status">
            {t('drawerRefusedSubmit')}
          </p>
        )
      ) : (
        life.stage !== 'not_started' &&
        life.stage !== 'submitted' && (
          /* §9.5 — no Submit button at all, only the sentence. */
          <p className="sd-drawer__hint">
            {t('drawerSubmitAfterCheckPrefix')} {life.currentRevision} {t('drawerSubmitAfterCheckSuffix')}
          </p>
        )
      )}
    </section>
  )
}

/** §9.6 — oldest revision first. A closed entry contains no control of any
 *  kind: nothing to discover that would then refuse. */
function History({ drawing, t }: { drawing: DrawerDrawing; t: T }) {
  const sorted = [...drawing.submissions].sort((a, b) => a.revision - b.revision)

  if (sorted.length === 0) {
    return <p className="sd-drawer__hint">{t('drawerHistoryEmpty')}</p>
  }

  return (
    <section className="sd-drawer__history">
      <h4 className="sd-drawer__recording-heading">{t('drawerHistoryHeading')}</h4>
      {sorted.map((s) => {
        const closed = s.returnedAt !== null
        return (
          <div
            key={s.id}
            className={`sd-drawer__revision${closed ? ' sd-drawer__revision--closed' : ' sd-drawer__revision--open'}`}
          >
            <div className="sd-drawer__revision-head">
              <strong>
                {t('drawerRevPrefix')} {s.revision}
              </strong>
              <span className="sd-drawer__revision-cap">
                {closed ? t('drawerHistoryClosed') : t('drawerHistoryOpen')}
              </span>
              {s.code && (
                <span
                  className={`sd-drawer__code-glyph sd-drawer__code-glyph--${s.code === 'C' ? 'outlined' : 'filled'}`}
                  aria-label={s.code}
                />
              )}
            </div>
            <div className="wf-data-table">
              {s.checkedByName && (
                <HistoryRow
                  label={t('drawerHistoryChecked')}
                  value={`${s.checkedByName}${s.checkedAt ? ` · ${new Date(s.checkedAt).toLocaleString()}` : ''}`}
                />
              )}
              <HistoryRow
                label={t('drawerHistorySent')}
                value={`${shortDate(s.submittedAt)} → ${s.reviewerOrg ?? '—'} (${t(PARTY_KEYS[s.reviewerParty] ?? 'drawerPartyOther')})`}
              />
              {closed && s.returnedAt && (
                <HistoryRow
                  label={t('drawerHistoryReturned')}
                  value={`${shortDate(s.returnedAt)} · ${Math.max(
                    0,
                    Math.floor(
                      (new Date(s.returnedAt).getTime() - new Date(s.submittedAt).getTime()) / 86_400_000,
                    ),
                  )} ${t('drawerHistoryDaysWithReviewerSuffix')}`}
                />
              )}
              {s.comments && <HistoryRow label={t('drawerHistoryComments')} value={s.comments} />}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function HistoryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '140px 1fr' }}>
      <span className="wf-data-table__head-cell">{label}</span>
      <span>{value}</span>
    </div>
  )
}
