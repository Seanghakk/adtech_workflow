'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { localizedLabel } from '@/lib/i18n/localized-label'
import { routeRequest, type RouteRequestState } from './actions'

const initialState: RouteRequestState = { error: null }

/**
 * Screen 1c's own row-level action (Brief §2.3) — same compact
 * select-plus-button shape as AssignPicForm (screen 4a), reused because
 * this is structurally the same "one decision, taken fast" UI problem, not
 * the big exclusive-choice reason-grid 1a's destination picker uses (that
 * shape fits ONE form; this queue can hold many rows at once).
 */
export function TriageRouteForm({
  requestId,
  teams,
}: {
  requestId: string
  teams: { id: string; labelEn: string; labelKm: string | null }[]
}) {
  const { t, lang } = useLanguage()
  const [state, formAction, pending] = useActionState(routeRequest, initialState)

  return (
    <form action={formAction} className="triage-card__route">
      <input type="hidden" name="requestId" value={requestId} />
      <select name="teamId" defaultValue="" required aria-label={t('triageRouteChoose')}>
        <option value="" disabled>
          {t('triageRouteChoose')}
        </option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {localizedLabel(team.labelEn, team.labelKm, lang)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={pending} className="btn btn--primary">
        {pending ? t('triageRoutePending') : t('triageRoute')}
      </button>
      {state.error && <span className="triage-card__route-error">{state.error}</span>}
    </form>
  )
}
