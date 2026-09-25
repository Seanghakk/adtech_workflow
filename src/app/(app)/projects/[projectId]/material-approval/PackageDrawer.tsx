'use client'

/**
 * Brief 105 — §23.6's drawer (16c) and §23.7's history (16d).
 *
 * §23.2: this IS §9's drawer with three differences, so the shape, the
 * width, the header and the history layout are §9's and the copy patterns
 * are §9's with "drawing" read as "package". What is different, and only
 * what is different, is written out here:
 *
 *   · THREE strip cells, not four. There is no manager's stamp before a
 *     submittal goes out, so "Internal check" does not exist — not as a
 *     cell, not as a count, not as a sentence anywhere on this screen.
 *   · The product lives on the revision, so the grid names it and says
 *     "product changed" when a revision differs from the one before.
 *   · A paper approval has no clocks at all, permanently.
 */
import { useState, useTransition } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { formatDateICT } from '@/lib/format/datetime'
import type { RegisterRow } from './MaterialApprovalRegister'
import { productChanged, type SubmissionRecord } from '@/lib/materialApproval/lifecycle'
import { startPreparing, submitRevision, recordReturn } from './actions'

const STRIP: { key: string; labelKey: 'materialApprovalStagePreparing' | 'materialApprovalStageSubmitted' | 'materialApprovalStageApproved' }[] = [
  { key: 'preparing', labelKey: 'materialApprovalStagePreparing' },
  { key: 'submitted', labelKey: 'materialApprovalStageSubmitted' },
  { key: 'approved', labelKey: 'materialApprovalStageApproved' },
]

export function PackageDrawer({
  projectId,
  row,
  canRecord,
  actorName,
  onClose,
}: {
  projectId: string
  row: RegisterRow
  systems: { id: string; name: string }[]
  canRecord: boolean
  actorName: string | null
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [showHistory, setShowHistory] = useState(false)
  const s = row.state

  return (
    <aside className="ma-drawer" role="dialog" aria-modal="false">
      <div className="ma-drawer__head">
        <div>
          <div className="ma-drawer__kicker">
            {t('materialApprovalDrawerKicker')} · {row.ref}
            {row.systemName ? ` · ${row.systemName}` : ''}
          </div>
          <div className="ma-drawer__name">{row.title}</div>
        </div>
        <button type="button" className="ma-drawer__close" onClick={onClose}>
          {t('drawerClose')}
        </button>
      </div>

      {row.outsideBoqReason && (
        <p className="ma-drawer__outside">
          {t('materialApprovalNotInBoqPrefix')} {row.outsideBoqReason}
        </p>
      )}

      {showHistory ? (
        <History row={row} onBack={() => setShowHistory(false)} />
      ) : (
        <>
          <div className="ma-drawer__rev">
            {t('drawerRevPrefix')} {s.currentRev}
            <OriginLine row={row} />
          </div>

          {/* §23.2 — three cells. */}
          <div className="ma-strip">
            {STRIP.map((cell) => (
              <span
                key={cell.key}
                className={`ma-strip__cell${s.stage === cell.key ? ' ma-strip__cell--current' : ''}`}
              >
                {t(cell.labelKey)}
              </span>
            ))}
          </div>
          <div className="ma-strip__spans">
            <span className="ma-strip__span ma-strip__span--adtech">{t('drawerHeldByAdtech')}</span>
            <span className="ma-strip__span ma-strip__span--reviewer">{t('drawerHeldByReviewer')}</span>
          </div>

          <Grid row={row} />
          <Clocks row={row} />

          {canRecord ? (
            <Actions projectId={projectId} row={row} />
          ) : (
            // §23.6's refusal, addressed to the reader by name. Never a
            // disabled control.
            <div className="ma-refused">
              <div className="ma-refused__headline">{t('materialApprovalRefusedHeadline')}</div>
              <p className="ma-refused__body">
                {t('materialApprovalRefusedBodyPrefix')} {actorName ?? ''}
                {t('materialApprovalRefusedBodySuffix')}
              </p>
            </div>
          )}

          <button type="button" className="ma-drawer__history-link" onClick={() => setShowHistory(true)}>
            {t('drawerOpenHistory')}
          </button>
        </>
      )}
    </aside>
  )
}

/** §23.6's origin line — "second revision · started 29 Aug after a C return
 *  · product changed". */
function OriginLine({ row }: { row: RegisterRow }) {
  const { t } = useLanguage()
  const s = row.state
  if (s.currentRev === 0) return null

  const previousReturn = row.submissions
    .filter((x) => x.rev === s.currentRev - 1 && x.returnedOn)
    .slice(-1)[0]

  return (
    <span className="ma-drawer__origin">
      {' '}
      {previousReturn?.returnedOn && (
        <>
          {t('drawerOriginStartedPrefix')} {formatDateICT(previousReturn.returnedOn)}{' '}
        </>
      )}
      {previousReturn?.code === 'C' && t('drawerOriginAfterC')}
      {s.productChanged && <> · {t('materialApprovalProductChanged')}</>}
    </span>
  )
}

/** §23.6's label/value grid. */
function Grid({ row }: { row: RegisterRow }) {
  const { t } = useLanguage()
  const s = row.state
  const rev = s.currentRevision
  const prev = s.previousRevision

  return (
    <dl className="ma-grid">
      <div>
        {/* "Submitted as" once it has gone out, "Proposed" while we hold it. */}
        <dt>{s.possession === 'reviewer' || s.possession === 'approved' || s.possession === 'paper'
          ? t('materialApprovalSubmittedAs')
          : t('materialApprovalProposed')}</dt>
        <dd>
          {rev?.manufacturer ? <strong>{rev.manufacturer}</strong> : null}
          {rev?.product ? ` ${rev.product}` : ''}
          {rev?.model ? ` · ${rev.model}` : ''}
          {!rev?.manufacturer && !rev?.product && '—'}
        </dd>
      </div>

      {/* §23.6 — "Rev n−1 was", shown only when the product actually changed,
          with the code and comment that sent it back. */}
      {prev && productChanged(prev, rev) && (
        <div>
          <dt>
            {t('materialApprovalPreviousRevWasPrefix')} {prev.rev} {t('materialApprovalPreviousRevWasSuffix')}
          </dt>
          <dd>
            {prev.manufacturer ?? ''} {prev.product ?? ''}
            <PreviousReturn row={row} rev={prev.rev} />
          </dd>
        </div>
      )}

      <div>
        <dt>{t('materialApprovalCovers')}</dt>
        <dd>
          {row.lineCount} {t('materialApprovalCoversLinesSuffix')}
          {row.linesNoLongerInBoq > 0 && (
            <span className="ma-grid__removed">
              {' · '}{row.linesNoLongerInBoq} {t('materialApprovalLineNoLongerInBoq')}
            </span>
          )}
        </dd>
      </div>

      <div>
        <dt>{t('materialApprovalDocuments')}</dt>
        <dd>{row.documents.length > 0 ? row.documents.length : '—'}</dd>
      </div>
    </dl>
  )
}

function PreviousReturn({ row, rev }: { row: RegisterRow; rev: number }) {
  const sub = row.submissions.filter((s) => s.rev === rev && s.returnedOn).slice(-1)[0]
  if (!sub) return null
  return (
    <span className="ma-grid__prev-return">
      {' · '}{sub.code}
      {sub.comments ? ` · ${sub.comments}` : ''}
    </span>
  )
}

/** §9.4's pair, unchanged — same size, same weight, never coloured. */
function Clocks({ row }: { row: RegisterRow }) {
  const { t } = useLanguage()
  const { withAdtechDays, withReviewerDays, showProportionBar } = row.state.clocks

  // §5.3 — permanently not recorded, and it says why.
  if (row.state.possession === 'paper') {
    return (
      <div className="ma-clocks">
        <div className="ma-clocks__heading">{t('drawerClocksHeading')}</div>
        <p className="ma-clocks__none">{t('materialApprovalClocksNotRecorded')}</p>
      </div>
    )
  }

  const total = (withAdtechDays ?? 0) + (withReviewerDays ?? 0)

  return (
    <div className="ma-clocks">
      <div className="ma-clocks__heading">{t('drawerClocksHeading')}</div>
      <div className="ma-clocks__pair">
        <div className="ma-clocks__cell">
          <div className="ma-clocks__label">{t('drawerClockWithAdtech')}</div>
          <div className="ma-clocks__value">
            {withAdtechDays === null
              ? <span className="ma-clocks__not-recorded">{t('drawerStartNotRecorded')}</span>
              : <>{withAdtechDays} {t('drawerClockDaysSuffix')}</>}
          </div>
        </div>
        <div className="ma-clocks__cell">
          <div className="ma-clocks__label">{t('drawerClockWithReviewer')}</div>
          <div className="ma-clocks__value">
            {withReviewerDays === null
              ? <span className="ma-clocks__not-recorded">{t('drawerClocksNeverSent')}</span>
              : <>{withReviewerDays} {t('drawerClockDaysSuffix')}</>}
          </div>
        </div>
      </div>
      {/* §9.4 — ink for us against a neutral hatch for them, never amber vs
          ink, which would read as good vs bad. Omitted entirely when the
          start is not recorded, because a proportion needs both halves. */}
      {showProportionBar && total > 0 && (
        <div className="ma-clocks__bar" aria-hidden="true">
          <span className="ma-clocks__bar-us" style={{ flex: withAdtechDays ?? 0 }} />
          <span className="ma-clocks__bar-them" style={{ flex: withReviewerDays ?? 0 }} />
        </div>
      )}
    </div>
  )
}

/** §23.6's recordings, offered by state. */
function Actions({ projectId, row }: { projectId: string; row: RegisterRow }) {
  const { t } = useLanguage()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const s = row.state

  // §5.3 — a paper approval is finished on arrival. Nothing to record.
  if (s.possession === 'paper' || s.possession === 'approved') return null

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null)
    start(async () => {
      const result = await fn()
      if (result.error) setError(result.error)
    })
  }

  return (
    <div className="ma-actions">
      {error && <p className="ma-actions__error">{error}</p>}

      {s.stage === 'not_started' && s.currentRevision && (
        <button
          type="button"
          className="btn btn--primary"
          disabled={pending}
          onClick={() => run(() => startPreparing(projectId, s.currentRevision!.id))}
        >
          {t('materialApprovalStartPreparing')}
        </button>
      )}

      {s.stage === 'preparing' && s.currentRevision && (
        <SubmitForm projectId={projectId} row={row} pending={pending} onRun={run} />
      )}

      {s.stage === 'submitted' && s.openSubmission && (
        <ReturnForm projectId={projectId} row={row} pending={pending} onRun={run} />
      )}
    </div>
  )
}

function SubmitForm({
  projectId,
  row,
  pending,
  onRun,
}: {
  projectId: string
  row: RegisterRow
  pending: boolean
  onRun: (fn: () => Promise<{ error?: string }>) => void
}) {
  const { t } = useLanguage()
  const [party, setParty] = useState('consultant')
  const [org, setOrg] = useState('')
  const [sentOn, setSentOn] = useState('')
  const s = row.state

  return (
    <div className="ma-form">
      <div className="ma-form__heading">{t('drawerSubmitHeading')}</div>

      {/* §23.6 — when this revision proposes a different product, say so
          before it goes out, because the documents have to match it. */}
      {s.productChanged && (
        <p className="ma-form__notice">
          {t('materialApprovalSubmitDifferentProductPrefix')} {s.currentRev}{' '}
          {t('materialApprovalSubmitDifferentProductBody')}
        </p>
      )}

      <label>
        {t('drawerReviewerParty')}
        <select value={party} onChange={(e) => setParty(e.target.value)}>
          <option value="client">{t('drawerPartyClient')}</option>
          <option value="consultant">{t('drawerPartyConsultant')}</option>
          <option value="main_contractor">{t('drawerPartyMainContractor')}</option>
          <option value="other">{t('drawerPartyOther')}</option>
        </select>
      </label>
      <label>
        {t('drawerReviewerOrg')}
        <input value={org} onChange={(e) => setOrg(e.target.value)} />
      </label>
      <label>
        {t('drawerDateSent')}
        <input type="date" value={sentOn} onChange={(e) => setSentOn(e.target.value)} />
      </label>

      <p className="ma-form__footnote">{t('drawerSubmitFootnote')}</p>

      <button
        type="button"
        className="btn btn--primary"
        disabled={pending || !sentOn}
        onClick={() =>
          onRun(() =>
            submitRevision(projectId, {
              revisionId: s.currentRevision!.id,
              party,
              org: org || null,
              sentOn,
            }),
          )
        }
      >
        {t('drawerSubmitButtonPrefix')} {s.currentRev}
      </button>
    </div>
  )
}

function ReturnForm({
  projectId,
  row,
  pending,
  onRun,
}: {
  projectId: string
  row: RegisterRow
  pending: boolean
  onRun: (fn: () => Promise<{ error?: string }>) => void
}) {
  const { t } = useLanguage()
  const [returnedOn, setReturnedOn] = useState('')
  const [code, setCode] = useState<'A' | 'B' | 'C'>('A')
  const [comments, setComments] = useState('')
  const [manufacturer, setManufacturer] = useState('')
  const [product, setProduct] = useState('')
  const [model, setModel] = useState('')
  const s = row.state

  const consequence =
    code === 'A' ? t('materialApprovalCodeAConsequence')
    : code === 'B' ? t('materialApprovalCodeBConsequence')
    : t('materialApprovalCodeCConsequence')

  return (
    <div className="ma-form">
      <div className="ma-form__heading">{t('drawerReturnHeading')}</div>
      <label>
        {t('drawerReturnDate')}
        <input type="date" value={returnedOn} onChange={(e) => setReturnedOn(e.target.value)} />
      </label>

      {/* §5.6 — shape, not hue. C is an outlined square, not a red one: a C
          is a finding, not a delay, and red in this app means delay only. */}
      <div className="ma-codes">
        {(['A', 'B', 'C'] as const).map((c) => (
          <label key={c} className={`ma-code ma-code--${c === 'C' ? 'outlined' : 'filled'}`}>
            <input type="radio" name="code" checked={code === c} onChange={() => setCode(c)} />
            <span className="ma-code__glyph" aria-hidden="true" />
            <span className="ma-code__label">{c}</span>
          </label>
        ))}
      </div>
      <p className="ma-form__consequence">{consequence}</p>

      <label>
        {t('drawerReturnComments')}
        <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} />
      </label>

      {/* §23.6 — a C "may propose another product", so the next revision's
          product is offered here rather than as a second trip. */}
      {code === 'C' && (
        <div className="ma-form__next-product">
          <label>
            {t('materialApprovalProposed')}
            <input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder={s.currentRevision?.manufacturer ?? ''}
            />
          </label>
          <label>
            <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder={s.currentRevision?.product ?? ''} />
          </label>
          <label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={s.currentRevision?.model ?? ''} />
          </label>
        </div>
      )}

      <button
        type="button"
        className="btn btn--primary"
        disabled={pending || !returnedOn}
        onClick={() =>
          onRun(() =>
            recordReturn(projectId, {
              submissionId: s.openSubmission!.id,
              packageId: row.id,
              returnedOn,
              code,
              comments: comments || null,
              nextProduct:
                code === 'C'
                  ? {
                      // An empty field means "same product again", so the
                      // current revision's value carries forward rather than
                      // the next revision silently losing its product.
                      manufacturer: manufacturer || s.currentRevision?.manufacturer || null,
                      product: product || s.currentRevision?.product || null,
                      model: model || s.currentRevision?.model || null,
                    }
                  : undefined,
            }),
          )
        }
      >
        {t('materialApprovalReturnButtonPrefix')} {code}
      </button>
    </div>
  )
}

/** §23.7 — §9.6 exactly, oldest revision first. A closed entry carries no
 *  control of any kind: nothing to discover that would then refuse. */
function History({ row, onBack }: { row: RegisterRow; onBack: () => void }) {
  const { t } = useLanguage()
  const revisions = [...row.revisions].sort((a, b) => a.rev - b.rev)

  return (
    <div className="ma-history">
      <button type="button" className="ma-history__back" onClick={onBack}>
        {t('drawerBackToDrawing')}
      </button>
      <div className="ma-history__heading">{t('drawerHistoryHeading')}</div>

      {row.state.possession === 'paper' ? (
        <PaperEntry row={row} />
      ) : (
        revisions.map((rev) => {
          const subs = row.submissions.filter((s) => s.rev === rev.rev)
          const returned = subs.find((s) => s.returnedOn)
          const closed = Boolean(returned)
          const previous = revisions.find((r) => r.rev === rev.rev - 1) ?? null

          return (
            <div key={rev.id} className={`ma-history__entry${closed ? ' ma-history__entry--closed' : ''}`}>
              <div className="ma-history__cap-row">
                <span className="ma-history__rev">{t('drawerRevPrefix')} {rev.rev}</span>
                <span className="ma-history__cap">
                  {closed ? t('drawerHistoryClosed') : t('drawerHistoryOpen')}
                </span>
                {returned?.code && <span className="ma-history__code">{returned.code}</span>}
              </div>
              <dl className="ma-history__grid">
                <div>
                  <dt>{t('materialApprovalHistoryProduct')}</dt>
                  <dd>
                    {rev.manufacturer ?? ''} {rev.product ?? ''}{rev.model ? ` · ${rev.model}` : ''}
                    {productChanged(previous, rev) && (
                      <span className="ma-history__changed"> · {t('materialApprovalProductChanged')}</span>
                    )}
                  </dd>
                </div>
                {rev.startedAt && (
                  <div>
                    <dt>{t('materialApprovalHistoryPrepared')}</dt>
                    <dd>{formatDateICT(rev.startedAt)}</dd>
                  </div>
                )}
                {subs.map((s) => (
                  <SubmissionEntry key={s.id} submission={s} />
                ))}
              </dl>
            </div>
          )
        })
      )}
    </div>
  )
}

function SubmissionEntry({ submission }: { submission: SubmissionRecord }) {
  const { t } = useLanguage()
  const days =
    submission.sentOn && submission.returnedOn
      ? Math.max(
          0,
          Math.round(
            (new Date(submission.returnedOn).getTime() - new Date(submission.sentOn).getTime()) / 86_400_000,
          ),
        )
      : null

  return (
    <>
      {submission.sentOn && (
        <div>
          <dt>{t('drawerHistorySent')}</dt>
          <dd>
            {formatDateICT(submission.sentOn)} → {submission.org ?? ''}
          </dd>
        </div>
      )}
      {submission.returnedOn && (
        <div>
          <dt>{t('drawerHistoryReturned')}</dt>
          <dd>
            {formatDateICT(submission.returnedOn)}
            {days !== null && ` · ${days} ${t('drawerHistoryDaysWithReviewerSuffix')}`}
          </dd>
        </div>
      )}
      {submission.comments && (
        <div>
          <dt>{t('drawerHistoryComments')}</dt>
          <dd>{submission.comments}</dd>
        </div>
      )}
    </>
  )
}

/** §23.7 — a paper approval is ONE closed entry, and its clocks say why
 *  they are empty rather than showing a zero. */
function PaperEntry({ row }: { row: RegisterRow }) {
  const { t } = useLanguage()
  const sub = row.state.lastReturned
  const scan = row.documents.find((d) => d.kind === 'paper_scan')

  return (
    <div className="ma-history__entry ma-history__entry--closed">
      <div className="ma-history__cap-row">
        <span className="ma-history__rev">{t('materialApprovalHistoryApprovedOnPaper')}</span>
        <span className="ma-history__cap">{t('drawerHistoryClosed')}</span>
        {sub?.code && <span className="ma-history__code">{sub.code}</span>}
      </div>
      <dl className="ma-history__grid">
        <div>
          <dt>{t('materialApprovalPaperApprovedBy')}</dt>
          <dd>{sub?.org ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('materialApprovalHistoryStampDate')}</dt>
          <dd>{sub?.returnedOn ? formatDateICT(sub.returnedOn) : '—'}</dd>
        </div>
        <div>
          <dt>{t('drawerClocksHeading')}</dt>
          <dd>{t('materialApprovalClocksNotRecorded')}</dd>
        </div>
        <div>
          <dt>{t('materialApprovalPaperScan')}</dt>
          <dd>{scan ? scan.file : '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
