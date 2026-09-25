'use client'

/**
 * Brief 103 — v7.4 §22.7's thumbnail and viewer (mockup 15d).
 *
 * THE THUMBNAIL IS NEVER BLACK. Open item 22 found the dark thumbnails
 * were not a bug at all: the bucket is public so URLs do not expire,
 * `.photo-thumb` was already white, and every stored object is a valid
 * 44–129 kB JPEG. The photographs themselves are dark — site evidence
 * from risers and ceiling voids — and object-fit:cover at 64px
 * concentrates that. So §22.7's "Did not load" is wired to a real load
 * failure only, and the loading background is --wf-surface-2 rather
 * than anything darker.
 *
 * NOT DONE, FLAGGED: §22.7 asks for a resized thumbnail (≤256px long
 * edge). photo_url holds a plain /object/public/ URL; serving a resized
 * one means Supabase's /render/image/ endpoint, which 400s outright
 * when image transformation is not enabled on the project. Seanghakk's
 * instruction was to assume it is not, so these are the original files
 * displayed at a fixed 64×48 with loading="lazy". The resize is pending
 * that capability, and is listed in the Result doc.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { formatDateICT, formatTimeICT } from '@/lib/format/datetime'
import type { DictionaryKey } from '@/lib/i18n/dictionary'

export interface SubStagePhoto {
  url: string
  /** The event this photo arrived with — §22.7's "Recorded with". */
  event: 'done' | 'in_progress' | 'qc_passed' | 'qc_failed'
  takenByName: string | null
  takenAt: string | null
}

const EVENT_KEYS: Record<SubStagePhoto['event'], DictionaryKey> = {
  done: 'updatePhotoEventDone',
  in_progress: 'updatePhotoEventInProgress',
  qc_passed: 'updatePhotoEventQcPassed',
  qc_failed: 'updatePhotoEventQcFailed',
}

export function PhotoCell({
  photos,
  status,
  doneBeforeTracking,
  floorLabel,
  subStageLabel,
}: {
  photos: SubStagePhoto[]
  status: 'not_started' | 'in_progress' | 'done'
  /** Done with no photo and none can ever exist — §22.7's permanent case. */
  doneBeforeTracking: boolean
  floorLabel: string
  subStageLabel: string
}) {
  const { t } = useLanguage()
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const firstThumbRef = useRef<HTMLButtonElement>(null)

  // §22.7 case 2: not started or in progress — an em dash, no box. A
  // photo is asked for at "done", so an empty box here would imply
  // something is missing when nothing is.
  if (photos.length === 0 && !doneBeforeTracking) {
    if (status !== 'done') return <span className="update-photo__dash">—</span>
    // done, no photo, but tracking was on: the file should exist.
    return (
      <div className="update-photo">
        <div className="update-photo__box update-photo__box--failed">{t('updatePhotoDidNotLoad')}</div>
      </div>
    )
  }

  // §22.7 case 1: permanent, and says why.
  if (doneBeforeTracking) {
    return (
      <div className="update-photo">
        <div className="update-photo__box update-photo__box--none">{t('updatePhotoNone')}</div>
        <div className="update-photo__meta">{t('updatePhotoDoneBeforeTracking')}</div>
      </div>
    )
  }

  const latest = photos[photos.length - 1]

  return (
    <div className="update-photo">
      <div className="update-photo__row">
        {failed ? (
          // §22.7 case 3 — the photo exists, the FILE failed.
          <div className="update-photo__box update-photo__box--failed">
            {t('updatePhotoDidNotLoad')}
            <button type="button" className="update-photo__retry" onClick={() => setFailed(false)}>
              {t('updatePhotoRetry')}
            </button>
          </div>
        ) : (
          <button
            ref={firstThumbRef}
            type="button"
            className="update-photo__thumb"
            onClick={() => setOpenIndex(0)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL; next/image is the wrong tool here */}
            <img
              src={photos[0].url}
              alt=""
              loading="lazy"
              width={64}
              height={48}
              onError={() => setFailed(true)}
            />
          </button>
        )}
        {photos.length > 1 && (
          <button type="button" className="update-photo__more" onClick={() => setOpenIndex(1)}>
            +{photos.length - 1}
          </button>
        )}
      </div>
      <div className="update-photo__meta">
        {photos.length > 1
          ? `${photos.length} ${t('updatePhotoCountSuffix')} ${latest.takenAt ? formatDateICT(latest.takenAt) : ''}`
          : `${t('updatePhotoLatestPrefix')} ${latest.takenAt ? formatDateICT(latest.takenAt) : ''}`}
      </div>

      {openIndex !== null && (
        <Viewer
          photos={photos}
          index={openIndex}
          setIndex={setOpenIndex}
          floorLabel={floorLabel}
          subStageLabel={subStageLabel}
          onClose={() => {
            setOpenIndex(null)
            // §22.7: focus returns to the thumbnail.
            firstThumbRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}

function Viewer({
  photos,
  index,
  setIndex,
  floorLabel,
  subStageLabel,
  onClose,
}: {
  photos: SubStagePhoto[]
  index: number
  setIndex: (i: number) => void
  floorLabel: string
  subStageLabel: string
  onClose: () => void
}) {
  const { t } = useLanguage()
  const photo = photos[index]

  const step = useCallback(
    (delta: number) => {
      const next = index + delta
      if (next >= 0 && next < photos.length) setIndex(next)
    },
    [index, photos.length, setIndex],
  )

  // §22.7: "arrow keys step, Esc closes".
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, step])

  return (
    <div className="update-viewer" role="dialog" aria-modal="true">
      <div className="update-viewer__head">
        <div>
          <div className="update-viewer__kicker">
            {floorLabel} · {subStageLabel}
          </div>
          <div className="update-viewer__count">
            {t('updatePhotoViewerOf')} {index + 1} {t('updatePhotoViewerOfMiddle')} {photos.length}
          </div>
        </div>
        <button type="button" className="update-viewer__close" onClick={onClose} aria-label={t('updatePhotoClose')}>
          ✕
        </button>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- external Storage URL */}
      <img src={photo.url} alt="" className="update-viewer__img" />

      <dl className="update-viewer__facts">
        <div>
          <dt>{t('updatePhotoTakenBy')}</dt>
          <dd>{photo.takenByName ?? '—'}</dd>
        </div>
        <div>
          <dt>{t('updatePhotoWhen')}</dt>
          <dd>
            {photo.takenAt ? `${formatDateICT(photo.takenAt)}, ${formatTimeICT(photo.takenAt)}` : '—'}
          </dd>
        </div>
        <div>
          <dt>{t('updatePhotoRecordedWith')}</dt>
          <dd>{t(EVENT_KEYS[photo.event])}</dd>
        </div>
      </dl>

      <div className="update-viewer__nav">
        <button type="button" onClick={() => step(-1)} disabled={index === 0}>
          {t('updatePhotoPrevious')}
        </button>
        <button type="button" onClick={() => step(1)} disabled={index === photos.length - 1}>
          {t('updatePhotoNext')}
        </button>
      </div>
    </div>
  )
}
