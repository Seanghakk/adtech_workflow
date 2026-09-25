'use client'

/**
 * Brief 105 — §23.5's register (mockups 16a, 16b) and §23.9's states.
 *
 * Two things this screen refuses to do, both from §23:
 *   · it never hides the gap. §23.9's "every package approved, lines
 *     uncovered" row exists because the summary's last cell is the only
 *     place anyone learns that work is unaccounted for, so it stays visible
 *     even when every package on the page reads approved;
 *   · it never shows a disabled control. A reader who may not record gets
 *     §23.6's sentence naming who can.
 */
import { useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { formatDateICT } from '@/lib/format/datetime'
import { registerSort, type PackageState, type RevisionRecord, type SubmissionRecord, type RegisterSummary } from '@/lib/materialApproval/lifecycle'
import { PackageDrawer } from './PackageDrawer'

export interface RegisterDocument {
  id: string
  revisionId: string
  kind: string
  file: string
  uploadedAt: string
}

export interface RegisterRow {
  id: string
  ref: string
  title: string
  systemName: string | null
  outsideBoqReason: string | null
  lineCount: number
  linesNoLongerInBoq: number
  state: PackageState
  revisions: RevisionRecord[]
  submissions: SubmissionRecord[]
  documents: RegisterDocument[]
  holderAgeDays: number
}

export function MaterialApprovalRegister({
  projectId,
  projectName,
  soNumber,
  rows,
  summary,
  systems,
  canRecord,
  actorName,
  hasContractBoq,
}: {
  projectId: string
  projectName: string
  soNumber: string | null
  rows: RegisterRow[]
  summary: RegisterSummary
  systems: { id: string; name: string }[]
  canRecord: boolean
  actorName: string | null
  picName: string | null
  hasContractBoq: boolean
}) {
  const { t } = useLanguage()
  const [openId, setOpenId] = useState<string | null>(null)

  const soLabel = soNumber ?? t('soRecordNoSoYet')
  const sorted = registerSort(
    rows.map((r) => ({ ref: r.ref, state: r.state })),
    (s) => rows.find((r) => r.state === s)?.holderAgeDays ?? 0,
  ).map((s) => rows.find((r) => r.ref === s.ref)!)

  const open = rows.find((r) => r.id === openId) ?? null

  return (
    <div className="ma-screen">
      <div className="ma-head">
        <div>
          <div className="ma-head__project">
            <span className="so-number">{soLabel}</span> <span>{projectName}</span>
          </div>
          <h1 className="ma-head__title">{t('materialApprovalHeading')}</h1>
        </div>
        {/* §23.6 — a refusal is a sentence naming who can, never a disabled
            control, so the actions are simply absent for a reader. */}
        {canRecord && (
          <div className="ma-head__actions">
            <button type="button" className="btn btn--primary">
              {hasContractBoq ? t('materialApprovalAddPackage') : t('materialApprovalAddNotInBoq')}
            </button>
            <button type="button" className="btn">{t('materialApprovalRecordPaper')}</button>
          </div>
        )}
      </div>

      {/* §23.10 — the phone reads. Shown only at 390px by CSS. */}
      <p className="ma-desk-work">{t('materialApprovalPhoneDeskWork')}</p>

      {rows.length === 0 ? (
        <EmptyState
          projectId={projectId}
          soLabel={soNumber ?? projectName}
          uncovered={summary.linesNotInAnyPackage}
          hasContractBoq={hasContractBoq}
        />
      ) : (
        <>
          <Summary summary={summary} />

          {/* §23.9 — "every contract line approved" is its own result field,
              and it is NOT the same as "every package approved": the second
              can be true while lines sit in no package at all. */}
          {summary.contractLines > 0 &&
            summary.linesNotInAnyPackage === 0 &&
            summary.approved === rows.length && <AllApproved rows={rows} count={summary.contractLines} />}

          <table className="wf-table ma-table">
            <thead>
              <tr>
                <th>{t('materialApprovalColPackage')}</th>
                <th>{t('materialApprovalColLines')}</th>
                <th>{t('materialApprovalColProduct')}</th>
                <th>{t('materialApprovalColWhere')}</th>
                <th>{t('materialApprovalColTimeHeld')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <PackageRow
                  key={row.id}
                  row={row}
                  selected={row.id === openId}
                  onOpen={() => setOpenId(row.id)}
                />
              ))}
            </tbody>
          </table>
        </>
      )}

      {open && (
        <PackageDrawer
          projectId={projectId}
          row={open}
          systems={systems}
          canRecord={canRecord}
          actorName={actorName}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

/** §23.5 — five cells in one bordered row. */
function Summary({ summary }: { summary: RegisterSummary }) {
  const { t } = useLanguage()
  return (
    <div className="ma-summary">
      <Cell figure={summary.withAdtech} label={t('materialApprovalSummaryWithAdtech')} />
      <Cell figure={summary.withReviewer} label={t('materialApprovalSummaryWithReviewer')} />
      <Cell
        figure={summary.approved}
        label={t('materialApprovalSummaryApproved')}
        detail={
          summary.approvedFromPaper > 0
            ? `${summary.approvedFromPaper} ${t('materialApprovalSummaryFromPaperSuffix')}`
            : undefined
        }
      />
      <Cell figure={summary.notStarted} label={t('materialApprovalSummaryNotStarted')} />
      <Cell
        figure={summary.linesInAPackage}
        label={`${t('materialApprovalSummaryLinesMiddle')} ${summary.contractLines} ${t('materialApprovalSummaryLinesSuffix')}`}
        // The gap stays visible — §23.9's third row exists for this line.
        detail={
          summary.linesNotInAnyPackage > 0
            ? `${summary.linesNotInAnyPackage} ${t('materialApprovalSummaryUncoveredSuffix')}`
            : undefined
        }
      />
    </div>
  )
}

function Cell({ figure, label, detail }: { figure: number; label: string; detail?: string }) {
  return (
    <div className="ma-summary__cell">
      <div className="ma-summary__figure">{figure}</div>
      <div className="ma-summary__label">{label}</div>
      {detail && <div className="ma-summary__detail">{detail}</div>}
    </div>
  )
}

function AllApproved({ rows, count }: { rows: RegisterRow[]; count: number }) {
  const { t } = useLanguage()
  const last = rows
    .map((r) => r.state.lastReturned)
    .filter((s): s is SubmissionRecord => Boolean(s?.returnedOn))
    .sort((a, b) => (a.returnedOn! < b.returnedOn! ? 1 : -1))[0]

  return (
    <div className="ma-all-approved">
      <div className="ma-all-approved__headline">
        {t('materialApprovalAllApprovedPrefix')} {count} {t('materialApprovalAllApprovedSuffix')}
      </div>
      {last?.returnedOn && (
        <div className="ma-all-approved__detail">
          {t('materialApprovalAllApprovedDetailPrefix')} {formatDateICT(last.returnedOn)}
          {last.org ? `, ${last.org}` : ''}
        </div>
      )}
    </div>
  )
}

/** §23.5's row, with the 5px left rule on the side holding it (§1.2). */
function PackageRow({
  row,
  selected,
  onOpen,
}: {
  row: RegisterRow
  selected: boolean
  onOpen: () => void
}) {
  const { t } = useLanguage()
  const s = row.state
  const rev = s.currentRevision

  return (
    <tr
      className={[
        'ma-row',
        `ma-row--${s.possession}`,
        selected ? 'ma-row--selected' : '',
      ].filter(Boolean).join(' ')}
    >
      <td>
        <button type="button" className="ma-row__open" onClick={onOpen}>
          <span className="ma-row__ref">
            {row.ref}
            {row.systemName ? ` · ${row.systemName}` : ''}
          </span>
          <span className="ma-row__name">{row.title}</span>
        </button>
        {/* §23.4 — the reason travels with the package wherever it appears. */}
        {row.outsideBoqReason && (
          <span className="ma-row__outside">
            {t('materialApprovalNotInBoqPrefix')} {row.outsideBoqReason}
          </span>
        )}
      </td>
      <td>
        {row.lineCount}
        {row.linesNoLongerInBoq > 0 && (
          <span className="ma-row__removed"> · {row.linesNoLongerInBoq} {t('materialApprovalLineNoLongerInBoq')}</span>
        )}
      </td>
      <td>
        {rev?.product ? (
          <>
            <span className="ma-row__product">{rev.manufacturer ? `${rev.manufacturer} ` : ''}{rev.product}</span>
            <span className="ma-row__rev"> · Rev {s.currentRev}</span>
          </>
        ) : (
          <span className="ma-row__dash">—</span>
        )}
      </td>
      <td><Chip row={row} /></td>
      <td><TimeHeld state={s} /></td>
    </tr>
  )
}

/** §23.5's chip table, exactly. Amber is possession, never blame (§5.6). */
function Chip({ row }: { row: RegisterRow }) {
  const { t } = useLanguage()
  const s = row.state
  const sub = s.openSubmission ?? s.lastReturned

  switch (s.possession) {
    case 'none':
      return (
        <>
          <span className="ma-chip__dash">—</span>
          <span className="ma-chip__detail">{t('materialApprovalDetailNotStarted')}</span>
        </>
      )
    case 'adtech':
      return (
        <>
          <span className="ma-chip ma-chip--adtech">{t('materialApprovalChipWithAdtech')}</span>
          <span className="ma-chip__detail">
            {t('materialApprovalDetailPreparingPrefix')} {row.holderAgeDays}d
          </span>
        </>
      )
    case 'reviewer':
      return (
        <>
          <span className="ma-chip ma-chip--reviewer">
            {t('materialApprovalChipWithPrefix')} {sub?.org ?? ''}
          </span>
          <span className="ma-chip__detail">
            {t('materialApprovalDetailSubmittedPrefix')} {row.holderAgeDays}d {t('materialApprovalDetailSubmittedSuffix')}
          </span>
        </>
      )
    case 'approved':
      return (
        <>
          <span className="ma-chip ma-chip--approved">
            {t('materialApprovalChipApprovedPrefix')} {s.lastReturned?.code}
          </span>
          <span className="ma-chip__detail">
            {s.lastReturned?.org ?? ''}{s.lastReturned?.returnedOn ? ` · ${formatDateICT(s.lastReturned.returnedOn)}` : ''}
          </span>
        </>
      )
    case 'paper':
      return (
        <>
          <span className="ma-chip ma-chip--paper">{t('materialApprovalChipApprovedOnPaper')}</span>
          <span className="ma-chip__detail">
            {s.lastReturned?.org ?? ''}{s.lastReturned?.returnedOn ? ` · ${formatDateICT(s.lastReturned.returnedOn)}` : ''}
          </span>
        </>
      )
  }
}

/** §23.5 — "larger side first, each naming its side". */
function TimeHeld({ state }: { state: PackageState }) {
  const { t } = useLanguage()
  const { withAdtechDays, withReviewerDays } = state.clocks

  // §5.3 — a paper approval never shows a duration.
  if (state.possession === 'paper') {
    return <span className="ma-clock__none">{t('materialApprovalClocksNotRecorded')}</span>
  }

  const sides = [
    { days: withAdtechDays, label: t('drawerClockWithAdtech') },
    { days: withReviewerDays, label: t('drawerClockWithReviewer') },
  ]
    .filter((x) => x.days !== null)
    .sort((a, b) => (b.days as number) - (a.days as number))

  if (sides.length === 0) return <span className="ma-clock__none">{t('drawerStartNotRecorded')}</span>

  return (
    <span className="ma-clock">
      {sides.map((x) => (
        <span key={x.label} className="ma-clock__side">
          <span className="ma-clock__days">{x.days}d</span>{' '}
          <span className="ma-clock__label">{x.label}</span>
        </span>
      ))}
    </span>
  )
}

/** §23.9's first two rows — the two empty states, with their exact copy. */
function EmptyState({
  projectId,
  soLabel,
  uncovered,
  hasContractBoq,
}: {
  projectId: string
  soLabel: string
  uncovered: number
  hasContractBoq: boolean
}) {
  const { t } = useLanguage()
  return (
    <div className="wf-empty-state-card ma-empty">
      <div className="wf-empty-state-card__headline">
        {t('materialApprovalEmptyHeadlinePrefix')} {soLabel} {t('materialApprovalEmptyHeadlineSuffix')}
      </div>
      <p className="wf-empty-state-card__body">
        {hasContractBoq ? (
          <>
            {uncovered} {t('materialApprovalEmptyBodyPrefix')}
          </>
        ) : (
          // §23.9 second row — the inert sentence replaces the count, because
          // "0 contract BOQ lines are in no package" is technically true and
          // completely useless.
          <>{t('materialApprovalNoBoqBody')}</>
        )}
      </p>

      {!hasContractBoq && (
        <div className="ma-empty__notice">
          <span className="ma-empty__notice-title">{t('materialApprovalNoBoqNotice')}</span>
          <Link href={`/projects/${projectId}/setup`}>{t('materialApprovalNoBoqLink')}</Link>
        </div>
      )}

      <p className="ma-empty__footnote">{t('materialApprovalEmptyFootnote')}</p>
    </div>
  )
}
