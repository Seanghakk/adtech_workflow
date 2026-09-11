'use client'

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { localizedLabel } from '@/lib/i18n/localized-label'
import { AgeLadder } from '@/components/AgeLadder'
import { submitProgressUpdate, type SubmitProgressUpdateState } from './actions'

interface ReasonCode {
  code: string
  labelEn: string
  labelKm: string | null
}

interface UpdateProgressFormProps {
  project: {
    id: string
    name: string
    stream: string
    soNumber: string | null
    percentComplete: number
    openItemCount: number
    ownerLabel: string | null
  }
  lastReported: { dateLabel: string; byLabel: string | null } | null
  daysSinceMovement: number
  reasonCodes: ReasonCode[]
  strings: {
    lastReported: string
    thisWeek: string
    movement: string
    tapToType: string
    clearsThreshold: string
    drawnUnchanged: string
    reasonLabel: string
    reasonLabelNoMovement: string
    required: string
    noteLabel: string
    noteOptional: string
    save: string
    saveNoChange: string
    cancel: string
    blockedTitle: string
    blockedBody: string
    saveHint: string
    by: string
    unreported: string
    unassigned: string
  }
}

const initialState: SubmitProgressUpdateState = { error: null }

/** Brief §4: meaningful movement is |delta| >= 5 percentage points. */
const MEANINGFUL_THRESHOLD = 5

export function UpdateProgressForm({
  project,
  lastReported,
  daysSinceMovement,
  reasonCodes,
  strings: s,
}: UpdateProgressFormProps) {
  const { lang } = useLanguage()
  const [state, formAction, pending] = useActionState(submitProgressUpdate, initialState)
  const [newPercent, setNewPercent] = useState(project.percentComplete)
  const [reasonCode, setReasonCode] = useState<string>('')
  const [note, setNote] = useState('')

  const delta = newPercent - project.percentComplete
  const meetsThreshold = Math.abs(delta) >= MEANINGFUL_THRESHOLD
  const isNoChange = newPercent === project.percentComplete
  const canSave = reasonCode !== '' && !pending

  const deltaLabel = useMemo(() => {
    if (delta === 0) return '0'
    return delta > 0 ? `+${delta}` : `${delta}`
  }, [delta])

  return (
    <form
      action={formAction}
      className="update-card"
      onSubmit={() => {
        // Brief 002B: this app previously had no way to tell "the click
        // never reached the form" apart from "the save failed after
        // being submitted." This fires the instant the browser actually
        // attempts to submit — if it's ever missing from the console on
        // a real click, the bug is upstream of this component entirely
        // (the click/DOM layer, not the Server Function or the database).
        console.log('[6a update] form submit fired', { projectId: project.id, newPercent, reasonCode })
      }}
    >
      <input type="hidden" name="projectId" value={project.id} />
      <input type="hidden" name="currentPercent" value={project.percentComplete} />
      <input type="hidden" name="newPercent" value={newPercent} />
      <input type="hidden" name="reasonCode" value={reasonCode} />

      <div className="update-card__header">
        <div className="update-card__identity">
          <div className="update-card__meta">
            {project.soNumber ? (
              <span className="so-number">{project.soNumber}</span>
            ) : (
              <span className="so-number so-number--pending">No SO yet</span>
            )}
            <span className="stream-tag">{project.stream.toUpperCase()}</span>
          </div>
          <div className="update-card__name">{project.name}</div>
          <div className="update-card__sub">{project.openItemCount} open sub-items</div>
        </div>
        <div className="owner-mark">
          <span className="owner-mark__box">
            {(project.ownerLabel ?? s.unassigned).toUpperCase()}
          </span>
        </div>
      </div>

      <div className="update-card__figures">
        <div className="update-card__figure">
          <div className="update-card__figure-label">{s.lastReported}</div>
          <div className="update-card__figure-value update-card__figure-value--muted">
            {project.percentComplete}
            <span className="update-card__percent-sign">%</span>
          </div>
          <div className="update-card__figure-caption">
            {lastReported
              ? `${lastReported.dateLabel}${lastReported.byLabel ? `, ${s.by} ${lastReported.byLabel}` : ''}`
              : s.unreported}
          </div>
        </div>

        <div className="update-card__figure">
          <div className="update-card__figure-label update-card__figure-label--accent">
            {s.thisWeek}
          </div>
          <label className="update-card__figure-value update-card__figure-value--input">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={newPercent}
              onChange={(e) => {
                const raw = e.target.value
                const parsed = raw === '' ? 0 : Math.round(Number(raw))
                setNewPercent(Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0)
              }}
              aria-label={s.thisWeek}
            />
            <span className="update-card__percent-sign">%</span>
          </label>
          <div className="update-card__figure-caption">{s.tapToType}</div>
        </div>

        <div className="update-card__figure">
          <div className="update-card__figure-label">{s.movement}</div>
          <div
            className={
              meetsThreshold
                ? 'update-card__figure-value'
                : 'update-card__figure-value update-card__figure-value--flat'
            }
          >
            {deltaLabel}
          </div>
          <div
            className={
              meetsThreshold
                ? 'update-card__movement-flag update-card__movement-flag--clears'
                : 'update-card__movement-flag update-card__movement-flag--flat'
            }
          >
            {meetsThreshold ? s.clearsThreshold : s.drawnUnchanged}
          </div>
        </div>
      </div>

      <div className="update-card__stall-row">
        <AgeLadder days={daysSinceMovement} label={`${daysSinceMovement}d since last movement`} />
      </div>

      <div className="update-card__reason">
        <div className="update-card__reason-head">
          <span className="update-card__reason-label">
            {isNoChange ? s.reasonLabelNoMovement : s.reasonLabel}
          </span>
          <span className="required-badge">{s.required}</span>
        </div>

        <div className="reason-grid" role="radiogroup" aria-label={s.reasonLabel}>
          {reasonCodes.map((reason) => {
            const selected = reasonCode === reason.code
            return (
              <button
                key={reason.code}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? 'reason-option reason-option--selected' : 'reason-option'}
                onClick={() => setReasonCode(reason.code)}
              >
                <span className="reason-option__box" aria-hidden="true" />
                <span className="reason-option__label">
                  {localizedLabel(reason.labelEn, reason.labelKm, lang)}
                </span>
              </button>
            )
          })}
        </div>

        <label className="field field--note">
          <span className="field__label">
            {s.noteLabel} <span className="field__label-optional">{s.noteOptional}</span>
          </span>
          <textarea
            className="field__textarea"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            name="reasonNote"
            rows={2}
          />
        </label>
      </div>

      <div className="update-card__footer">
        <button
          type="submit"
          className={canSave ? 'btn btn--primary' : 'btn btn--primary btn--disabled'}
          // Brief Fable 001 Stage B, UNCONFIRMED candidate fix for the 6a
          // silent-save bug (see Result doc for the full reasoning and the
          // exact observation that confirms/refutes this): `disabled` used
          // to be tied to `!canSave`, making this a genuinely native
          // HTML-disabled button until a reason was picked. A disabled
          // button dispatches NO click/submit event in any browser — if
          // something in the real browser session ever left `canSave`
          // reading false when the person believed they'd already picked a
          // reason (stale render, a missed re-render, anything), the click
          // would vanish silently with neither the onSubmit console log
          // below nor a network request ever firing — exactly the reported
          // symptom. `disabled` now tracks only `pending`, so the button is
          // always a real, clickable element; the onClick guard below
          // preserves the actual gating. This also brings the button in
          // line with the design contract's own words for this exact
          // state: "the click is never let through to be scolded
          // afterwards" (README, screen 6a, state 2) — describing a click
          // that is quietly absorbed, not a button that cannot be clicked
          // at all.
          disabled={pending}
          onClick={(e) => {
            if (reasonCode === '') {
              e.preventDefault()
              console.log('[6a update] Save clicked with no reason selected — blocked client-side, not submitted')
            }
          }}
        >
          {pending ? 'Saving…' : isNoChange ? s.saveNoChange : s.save}
        </button>
        <Link href="/" className="btn btn--outline">
          {s.cancel}
        </Link>

        {reasonCode === '' ? (
          <div className="update-card__blocked-note">
            <div className="update-card__blocked-title">{s.blockedTitle}</div>
            <div className="update-card__blocked-body">{s.blockedBody}</div>
          </div>
        ) : (
          <span className="update-card__hint">{s.saveHint}</span>
        )}
      </div>

      {state.error ? (
        <div className="update-card__error" role="alert">
          {state.error}
        </div>
      ) : null}
    </form>
  )
}
