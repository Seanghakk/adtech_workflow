/**
 * ADTECH_WF_Brief_107 Part B — progress photos are served through the app,
 * never by a public Storage link. Pure (safe in client components).
 *
 * The database keeps exactly what it always stored (a /object/public/ URL
 * from migrations 023/024/045 — "Public Storage URL"); the Storage path is
 * derived from it at read time, so no stored row changes.
 */
export const PROGRESS_PHOTO_BUCKET = 'progress-photos'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PATH_RE = new RegExp(`^projects/(${UUID})/[A-Za-z0-9._/-]+$`, 'i')

/** The Storage path inside the bucket, from a stored link (public or signed form) or a bare path. Null if it isn't a progress photo. */
export function photoStoragePath(stored: string | null | undefined): string | null {
  if (!stored) return null
  const marker = `/${PROGRESS_PHOTO_BUCKET}/`
  let path = stored
  if (/^https?:\/\//i.test(stored)) {
    const at = stored.indexOf(`/storage/v1/object/`)
    const b = at >= 0 ? stored.indexOf(marker, at) : -1
    if (b < 0) return null
    path = stored.slice(b + marker.length).split('?')[0]
  }
  try {
    path = decodeURIComponent(path)
  } catch {
    return null
  }
  return PATH_RE.test(path) && !path.split('/').includes('..') ? path : null
}

/** The project a photo belongs to (photos are always stored under projects/<id>/). */
export function photoProjectId(path: string): string | null {
  return PATH_RE.exec(path)?.[1]?.toLowerCase() ?? null
}

/** Where the app shows a stored photo: the protected route, which hands out a short-lived signed link. */
export function photoViewUrl(stored: string | null | undefined): string | null {
  const path = photoStoragePath(stored)
  return path ? `/api/progress-photos/file/${path.split('/').map(encodeURIComponent).join('/')}` : null
}
