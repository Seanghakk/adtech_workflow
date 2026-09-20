/**
 * Screen 6a photo evidence (Brief 057). Browser-only — import only from
 * Client Components.
 */

/** Resize an image File to <= maxWidth and return a JPEG data URL (quality
 * 0.8). Mirrors the CMMS's compressImage (its src/lib/fieldApi.ts) — same
 * approach, required here per Brief 057 §5: a raw phone photo is far too
 * large for a site connection, so this runs before every upload, not
 * optionally. */
export function compressImage(file: File, maxWidth = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, maxWidth / img.width)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas 2d context unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('image decode failed'))
    }
    img.src = url
  })
}

export class ProgressPhotoUploadError extends Error {}

/**
 * Uploads a compressed photo data URL to /api/progress-photos/upload via
 * XMLHttpRequest (not fetch) specifically so `onProgress` reflects real
 * upload bytes sent, not a guess — Brief 057 §5: "a silent spinner on a
 * slow link is indistinguishable from a hang."
 *
 * `stage` (Brief 059 §4) is omitted for a Screen 6a progress-update photo
 * (unchanged PIC-only route gate) and set to 'installation' | 'tnc' for a
 * floor-sub-stage photo, so the route can apply the matching team gate.
 */
export function uploadProgressPhoto(args: {
  projectId: string
  dataUrl: string
  stage?: 'installation' | 'tnc'
  onProgress?: (percent: number) => void
}): Promise<{ url: string; path: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/progress-photos/upload')
    xhr.setRequestHeader('Content-Type', 'application/json')

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !args.onProgress) return
      args.onProgress(Math.round((e.loaded / e.total) * 100))
    }

    xhr.onload = () => {
      let body: { url?: string; path?: string; error?: string } = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // fall through to the status check below with an empty body
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.url && body.path) {
        resolve({ url: body.url, path: body.path })
      } else {
        reject(new ProgressPhotoUploadError(body.error ?? `Upload failed (HTTP ${xhr.status}).`))
      }
    }
    xhr.onerror = () => reject(new ProgressPhotoUploadError('Upload failed — check your connection and try again.'))

    xhr.send(JSON.stringify({ projectId: args.projectId, dataUrl: args.dataUrl, stage: args.stage }))
  })
}
