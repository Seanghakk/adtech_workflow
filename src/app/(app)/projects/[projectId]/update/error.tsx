'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import Link from 'next/link'

/**
 * Brief 002B: a save that fails must never look like a save that
 * succeeded. This route previously had no error boundary at all, so any
 * unexpected thrown error during a render or a Server Function call for
 * this segment (as opposed to a gracefully-returned {error} state, which
 * UpdateProgressForm already surfaces) would fail SILENTLY from the
 * user's point of view — no crash screen, no message, nothing — leaving
 * only whatever was already on screen (including the live client-side
 * delta preview, which updates from typing alone and proves nothing was
 * saved). This boundary makes that class of failure visible instead.
 */
export default function UpdateProgressError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[6a update] unexpected error:', error)
  }, [error])

  return (
    <div className="update-card" style={{ padding: '26px 24px', maxWidth: 520 }}>
      <h2 style={{ margin: '0 0 10px', font: '700 17px/1.3 var(--font-archivo)' }}>
        Something went wrong saving this update.
      </h2>
      <p style={{ margin: '0 0 18px', color: 'var(--color-muted)', font: '400 12.5px/1.6 var(--font-archivo)' }}>
        Nothing on screen confirms this was saved — treat it as NOT saved. Try again, or go back
        and re-check the project&apos;s current percentage before retrying.
      </p>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button type="button" className="btn btn--primary" onClick={() => retry()}>
          Try again
        </button>
        <Link href="/" className="btn btn--outline">
          Back to list
        </Link>
      </div>
    </div>
  )
}
