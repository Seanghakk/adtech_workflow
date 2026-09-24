'use client'

/**
 * Brief 100 Part E — v7.2 §12.6 (capture and confirm) and §12.7 (the
 * three save outcomes).
 *
 * §12.7's last paragraph is the whole design rule here: "A silent
 * failure, or a status that looks saved and is not, is worse than no app
 * at all." So nothing on this screen is optimistic — the button is
 * REPLACED by a saving block rather than greyed, and the saved block is
 * rendered only from what the server actually returned.
 *
 * No offline queueing, deliberately: no service worker, no IndexedDB
 * blob queue. §12.7 says to ship honest failure and revisit on evidence.
 */
import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { compressImage, uploadProgressPhoto } from '@/lib/media/progressPhoto'
import { formatDateICT, formatTimeICT } from '@/lib/format/datetime'
import type { Stage } from '@/lib/floorScan/rows'
import { saveSubStageStatus } from '../../actions'
import { scanSaveInitialState } from '../../scan-shared'

type Step = 'capture' | 'confirm'

export function PhotoGate({
  floorId,
  floorLabel,
  projectId,
  subStageId,
  stage,
  subStageLabel,
  memberName,
}: {
  floorId: string
  floorLabel: string
  projectId: string
  subStageId: string
  stage: Stage
  subStageLabel: string
  memberName: string | null
}) {
  const { t } = useLanguage()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('capture')
  const [preview, setPreview] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string>('')
  const [takenAt, setTakenAt] = useState<Date | null>(null)
  const [bytes, setBytes] = useState<number>(0)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const [saveState, saveAction, savePending] = useActionState(
    saveSubStageStatus,
    scanSaveInitialState,
  )

  async function onFilePicked(file: File) {
    setUploadError(null)
    setUploading(true)
    try {
      const dataUrl = await compressImage(file)
      setPreview(dataUrl)
      setTakenAt(new Date())
      // base64 payload → bytes, for §12.6's "timestamp and size left"
      setBytes(Math.round((dataUrl.length - (dataUrl.indexOf(',') + 1)) * 0.75))
      const { url } = await uploadProgressPhoto({ projectId, dataUrl, stage })
      setPhotoUrl(url)
      setStep('confirm')
    } catch {
      // The photo never reached the server, so there is nothing to
      // confirm — stay on capture and say so, rather than advancing to a
      // confirm step whose "Save" could not work.
      setUploadError(t('phoneFloorNotSavedBody'))
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  // ---- §12.7, outcome 2: saved -----------------------------------------
  if (saveState.kind === 'saved') {
    return (
      <div className="phone-gate">
        <div className="phone-gate__saved" role="status">
          <div className="phone-gate__saved-head">{t('phoneFloorSaved')}</div>
          <p className="phone-gate__saved-line">
            {subStageLabel} · {t('statusDone')}
            {saveState.withPhoto ? ` · ${t('phoneFloorSavedWithPhoto')}` : ''}
          </p>
          <p className="phone-gate__saved-line">
            {formatTimeICT(saveState.at)} · {formatDateICT(saveState.at)}
          </p>
          <p className="phone-gate__saved-line">
            {t('phoneFloorSavedNowReads')}: {t('phoneFloorTagAwaitingQc')}
          </p>
        </div>
        <button
          type="button"
          className="phone-gate__primary"
          onClick={() => router.push(`/floors/${floorId}/scan`)}
        >
          {t('phoneFloorBackToFloor')}
        </button>
      </div>
    )
  }

  return (
    <div className="phone-gate">
      <div className="phone-gate__head">
        <div className="phone-gate__floor">{floorLabel}</div>
        <div className="phone-gate__substage">{subStageLabel}</div>
      </div>

      {/* §12.6 — a 2px ink bordered statement, before anything else. */}
      <p className="phone-gate__statement">{t('phoneFloorCaptureStatement')}</p>

      {step === 'capture' ? (
        <>
          <div className="phone-gate__frame" aria-hidden={!preview}>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="phone-gate__frame-img" />
            ) : (
              <span className="phone-gate__frame-empty">{t('phoneFloorPhotoFrameEmpty')}</span>
            )}
          </div>

          {/* Camera directly — capture="environment", no gallery picker:
              the evidence is taken on the floor at that moment. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="phone-gate__file"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) void onFilePicked(file)
            }}
          />
          <button
            type="button"
            className="phone-gate__primary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? t('photoUploading') : t('phoneFloorTakePhoto')}
          </button>

          {uploadError && (
            <p className="phone-gate__error" role="alert">
              {uploadError}
            </p>
          )}

          {/* Returns with the status UNCHANGED — nothing has been written
              at any point before the confirm step's save. */}
          <button
            type="button"
            className="phone-gate__cancel"
            onClick={() => router.push(`/floors/${floorId}/scan`)}
          >
            {t('phoneFloorCancel')}
          </button>
          <p className="phone-gate__cancel-note">{t('phoneFloorCancelNote')}</p>
        </>
      ) : (
        <>
          <div className="phone-gate__confirm-photo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview ?? ''} alt="" className="phone-gate__frame-img" />
          </div>
          <div className="phone-gate__confirm-meta">
            <span>
              {takenAt ? formatTimeICT(takenAt) : ''} · {(bytes / 1024).toFixed(0)} KB
            </span>
            <button type="button" className="phone-gate__retake" onClick={() => setStep('capture')}>
              {t('phoneFloorRetake')}
            </button>
          </div>

          {/* §12.6's three-row summary. */}
          <dl className="phone-gate__summary">
            <div className="phone-gate__summary-row">
              <dt>{t('phoneFloorSummarySubStage')}</dt>
              <dd>{subStageLabel}</dd>
            </div>
            <div className="phone-gate__summary-row">
              <dt>{t('phoneFloorSummaryNewStatus')}</dt>
              <dd>{t('statusDone')}</dd>
            </div>
            <div className="phone-gate__summary-row">
              <dt>{t('phoneFloorSummaryBy')}</dt>
              <dd className="phone-gate__summary-member">{memberName ?? ''}</dd>
            </div>
          </dl>

          {savePending ? (
            /* §12.7, outcome 1 — the button is REPLACED, not greyed.
               Nothing claims the update landed until the server says so. */
            <div className="phone-gate__saving" role="status">
              <div className="phone-gate__saving-head">{t('phoneFloorSaving')}</div>
              <p>{t('phoneFloorSavingBody')}</p>
            </div>
          ) : (
            <form action={saveAction}>
              <input type="hidden" name="floorId" value={floorId} />
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="subStageId" value={subStageId} />
              <input type="hidden" name="stage" value={stage} />
              <input type="hidden" name="status" value="done" />
              <input type="hidden" name="photoUrl" value={photoUrl} />
              <button type="submit" className="phone-gate__primary">
                {t('phoneFloorSaveUpdate')}
              </button>
            </form>
          )}

          {/* §12.7, outcome 3 — not saved. No red: red is delay, and a
              failed upload is not a late project. */}
          {saveState.kind === 'error' && !savePending && (
            <div className="phone-gate__not-saved" role="alert">
              <div className="phone-gate__not-saved-head">{t('phoneFloorNotSaved')}</div>
              <p>{t('phoneFloorNotSavedBody')}</p>
              <p className="phone-gate__not-saved-detail">{saveState.message}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
