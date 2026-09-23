'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { updateNumberingMode } from './actions'
import { setupInitialState } from './setup-shared'

/** Brief 097 §6.2 item 5 — the numbering-mode switch, PIC-gated, one
 *  sentence of consequence (v7.2 §21.1, exact copy). A segmented
 *  two-option control, same board__tabs shape already used elsewhere in
 *  this app for a segmented choice (e.g. the scope tabs). */
export function NumberingModeSwitch({ projectId, mode }: { projectId: string; mode: 'adtech' | 'client' | null }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(updateNumberingMode, setupInitialState)
  const current = mode ?? 'adtech'

  return (
    <div>
      <div className="board__tabs">
        {(['adtech', 'client'] as const).map((option) => (
          <form action={formAction} key={option} style={{ display: 'inline' }}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="mode" value={option} />
            <button
              type="submit"
              className={option === current ? 'board__tab board__tab--active' : 'board__tab'}
              disabled={pending || option === current}
            >
              {option === 'adtech' ? t('setupDrawingsNumberingAdtech') : t('setupDrawingsNumberingClient')}
            </button>
          </form>
        ))}
      </div>
      <p className="floor-config__note">{t('setupDrawingsNumberingConsequence')}</p>
      {state.error && <span className="update-card__error">{state.error}</span>}
    </div>
  )
}
