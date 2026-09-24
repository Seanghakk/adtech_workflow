'use client'

import { useActionState, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { localizedLabel } from '@/lib/i18n/localized-label'
import { AgeLadder } from '@/components/AgeLadder'
import { compressImage, uploadProgressPhoto } from '@/lib/media/progressPhoto'
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
  lastReported: { dateLabel: string; byLabel: string | null; photoUrl: string | null } | null
  /** Fable Brief 002 §2.1 — the unassigned/not-your-project state, on 6a. */
  pic: { assigned: boolean; isCurrentUser: boolean; label: string | null }
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
    picUnassignedTitle: string
    picUnassignedBody: string
    picRestrictedTitle: string
    picRestrictedBodyPrefix: string
    picLabel: string
    picYou: string
    ownerLabel: string
    photoLabel: string
    photoOptional: string
    photoAdd: string
    photoRetake: string
    photoRemove: string
    photoUploading: string
    photoRetry: string
    photoRequiredTitle: string
    photoRequiredBody: string
    photoEvidenceAlt: string
  }
}

const initialState: SubmitProgressUpdateState = { error: null }

/** Brief §4: meaningful movement is |delta| >= 5 percentage points. */
const MEANINGFUL_THRESHOLD = 5

export function UpdateProgressForm({
  project,
  lastReported,
  pic,
  daysSinceMovement,
  reasonCodes,
  strings: s,
}: UpdateProgressFormProps) {
  const { lang } = useLanguage()
  const [state, formAction, pending] = useActionState(submitProgressUpdate, initialState)
  const [newPercent, setNewPercent] = useState(project.percentComplete)
  const [reasonCode, setReasonCode] = useState<string>('')
  const [note, setNote] = useState('')

  // Brief 057 §3/§5 — photo evidence. photoUrl is what actually gets
  // submitted; uploadStatus/uploadProgress/uploadError only drive the UI.
  // Deliberately separate state from newPercent/reasonCode/note so a
  // failed or slow upload never touches what the person already typed
  // (§5: "the update and the photo must not fail as one unit").
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'error'>('idle')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  const runUpload = async (file: File) => {
    pendingFileRef.current = file
    setUploadStatus('uploading')
    setUploadProgress(0)
    setUploadError(null)
    try {
      const dataUrl = await compressImage(file)
      setPhotoPreview(dataUrl)
      const { url } = await uploadProgressPhoto({
        projectId: project.id,
        dataUrl,
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

  const delta = newPercent - project.percentComplete
  const meetsThreshold = Math.abs(delta) >= MEANINGFUL_THRESHOLD
  const isNoChange = newPercent === project.percentComplete
  // Fable Brief 002 §2.1: with pic_id nullable and no manager bypass
  // (migration 006), a save that cannot possibly succeed must be blocked
  // and explained BEFORE the click, not discovered as a failed save after
  // one. This gate takes priority over the reason-selection gate below —
  // there is no reason to pick if the save can never go through at all.
  const canWrite = pic.isCurrentUser
  // Brief 057 §3 — required only when this save reaches 100%.
  const needsPhoto = newPercent === 100
  const hasPhoto = Boolean(photoUrl)
  const canSave = canWrite && reasonCode !== '' && !pending && uploadStatus !== 'uploading' && (!needsPhoto || hasPhoto)

  const deltaLabel = useMemo(() => {
    if (delta === 0) return '0'
    return delta > 0 ? `+${delta}` : `${delta}`
  }, [delta])

  const lastPhotoUrl = lastReported?.photoUrl ?? null

  // Brief 100 route walk, finding 1 — a refusal is a SENTENCE naming who
  // can help, never a row of disabled controls (Brief 100 §4).
  //
  // This screen used to render the whole entry form with disabled={!canWrite}
  // on every control and the explanation underneath: on a project with no
  // floors an ordinary member met ten dead controls — eight reason codes,
  // "Add photo", "Save — no change" — before reading why. The sentence was
  // already right; it was the greyed-out row beside it that was wrong.
  //
  // So when the save could not possibly succeed, the controls are not
  // disabled — they are not rendered. What stays is what a person who
  // cannot write still came here to read: who holds it, where it stands,
  // and who to ask. The same shape /users, /lookups and /notifications
  // already use, and the same shape the phone floor page uses for a member
  // whose team owns nothing on that floor.
  if (!canWrite) {
    return (
      <div className="update-card">
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
          <div className="update-card__actors">
            <div className="pic-mark">
              <span className="pic-mark__label">{s.picLabel}</span>
              <span className="pic-mark__value">{(pic.label ?? s.unassigned).toUpperCase()}</span>
            </div>
            <div className="owner-mark">
              <span className="owner-mark__label">{s.ownerLabel}</span>
              <span className="owner-mark__box">
                {(project.ownerLabel ?? s.unassigned).toUpperCase()}
              </span>
            </div>
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
            {/* Kept: this one opens the stored photo and genuinely works.
                It is an action, not a disabled stub. */}
            {lastPhotoUrl ? (
              <button
                type="button"
                className="photo-thumb photo-thumb--small"
                onClick={() => setOverlayUrl(lastPhotoUrl)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- stored evidence photo */}
                <img src={lastPhotoUrl} alt={s.photoEvidenceAlt} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="update-card__blocked-note" role="status">
          {!pic.assigned ? (
            <>
              <div className="update-card__blocked-title">{s.picUnassignedTitle}</div>
              <div className="update-card__blocked-body">{s.picUnassignedBody}</div>
            </>
          ) : (
            <>
              <div className="update-card__blocked-title">{s.picRestrictedTitle}</div>
              <div className="update-card__blocked-body">
                {s.picRestrictedBodyPrefix} {(pic.label ?? s.unassigned).toUpperCase()}.
              </div>
            </>
          )}
        </div>

        {overlayUrl ? (
          <div className="photo-overlay" onClick={() => setOverlayUrl(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element -- stored evidence photo */}
            <img src={overlayUrl} alt={s.photoEvidenceAlt} />
          </div>
        ) : null}
      </div>
    )
  }

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
      <input type="hidden" name="photoUrl" value={photoUrl ?? ''} />

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
        {/* Fable Brief 003 §4.2 — the fix: since migration 006, owner_id
            governs nothing and pic_id governs everything (who can write
            here at all), but this card used to show a prominent
            UNASSIGNED badge for OWNER while never stating the PIC at all
            on the success path (only on the blocked-note failure path
            below). The PIC now renders here always, as the primary mark.
            JUDGMENT CALL (stated per the brief, not silently resolved):
            the owner badge still earns a place — it is a different,
            legitimate fact (who opened/owns the project commercially) —
            but it no longer controls access, so it is demoted to a
            smaller, muted, explicitly-labeled chip below the PIC pill
            rather than removed outright. */}
        <div className="update-card__actors">
          <div className="pic-mark">
            <span className="pic-mark__label">{s.picLabel}</span>
            <span className="pic-mark__value">
              {pic.isCurrentUser
                ? s.picYou
                : (pic.label ?? s.unassigned).toUpperCase()}
            </span>
          </div>
          <div className="owner-mark">
            <span className="owner-mark__label">{s.ownerLabel}</span>
            <span className="owner-mark__box">
              {(project.ownerLabel ?? s.unassigned).toUpperCase()}
            </span>
          </div>
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
          {lastPhotoUrl ? (
            <button
              type="button"
              className="photo-thumb photo-thumb--small"
              onClick={() => setOverlayUrl(lastPhotoUrl)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- stored evidence photo, next/image is the wrong tool for an external Storage URL thumbnail */}
              <img src={lastPhotoUrl} alt={s.photoEvidenceAlt} />
            </button>
          ) : null}
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
              disabled={!canWrite}
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
                disabled={!canWrite}
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

        {/* Brief 057 — photo evidence for the claim above. Optional in
            general, required once newPercent reaches 100 (needsPhoto). */}
        <div className="update-card__photo">
          <div className="update-card__reason-head">
            <span className="update-card__reason-label">{s.photoLabel}</span>
            <span className="required-badge">{needsPhoto ? s.required : s.photoOptional}</span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="photo-input"
            disabled={!canWrite}
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
                <img src={photoPreview} alt={s.photoEvidenceAlt} />
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
                disabled={!canWrite || uploadStatus === 'uploading'}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadStatus === 'uploading'
                  ? `${s.photoUploading} ${uploadProgress}%`
                  : photoPreview
                    ? s.photoRetake
                    : s.photoAdd}
              </button>
              {photoPreview ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={!canWrite || uploadStatus === 'uploading'}
                  onClick={() => {
                    setPhotoPreview(null)
                    setPhotoUrl(null)
                    setUploadStatus('idle')
                    setUploadError(null)
                  }}
                >
                  {s.photoRemove}
                </button>
              ) : null}
            </div>
          </div>

          {uploadStatus === 'error' ? (
            <div className="update-card__error" role="alert">
              {uploadError}{' '}
              <button
                type="button"
                className="photo-retry"
                onClick={() => pendingFileRef.current && void runUpload(pendingFileRef.current)}
              >
                {s.photoRetry}
              </button>
            </div>
          ) : null}
        </div>
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
          //
          // The PIC gate below (`!canWrite`) is a different kind of state:
          // a server-fetched fact that cannot flip during this page's
          // lifetime, not a client render race — so native `disabled` here
          // is safe and does not reintroduce the swallowed-click risk the
          // comment above describes for the reason gate.
          disabled={pending || !canWrite}
          onClick={(e) => {
            if (!canWrite) {
              e.preventDefault()
              console.log('[6a update] Save clicked but signed-in user is not this project’s PIC — blocked client-side, not submitted')
            } else if (reasonCode === '') {
              e.preventDefault()
              console.log('[6a update] Save clicked with no reason selected — blocked client-side, not submitted')
            } else if (needsPhoto && !hasPhoto) {
              e.preventDefault()
              console.log('[6a update] Save clicked at 100% with no photo evidence — blocked client-side, not submitted')
            }
          }}
        >
          {pending ? 'Saving…' : isNoChange ? s.saveNoChange : s.save}
        </button>
        <Link href="/" className="btn btn--outline">
          {s.cancel}
        </Link>

        {!pic.assigned ? (
          <div className="update-card__blocked-note">
            <div className="update-card__blocked-title">{s.picUnassignedTitle}</div>
            <div className="update-card__blocked-body">{s.picUnassignedBody}</div>
          </div>
        ) : !pic.isCurrentUser ? (
          <div className="update-card__blocked-note">
            <div className="update-card__blocked-title">{s.picRestrictedTitle}</div>
            <div className="update-card__blocked-body">
              {s.picRestrictedBodyPrefix} {(pic.label ?? s.unassigned).toUpperCase()}.
            </div>
          </div>
        ) : reasonCode === '' ? (
          <div className="update-card__blocked-note">
            <div className="update-card__blocked-title">{s.blockedTitle}</div>
            <div className="update-card__blocked-body">{s.blockedBody}</div>
          </div>
        ) : needsPhoto && !hasPhoto ? (
          <div className="update-card__blocked-note">
            <div className="update-card__blocked-title">{s.photoRequiredTitle}</div>
            <div className="update-card__blocked-body">{s.photoRequiredBody}</div>
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

      {overlayUrl ? (
        <div className="photo-overlay" onClick={() => setOverlayUrl(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size stored evidence photo */}
          <img src={overlayUrl} alt={s.photoEvidenceAlt} />
        </div>
      ) : null}
    </form>
  )
}
