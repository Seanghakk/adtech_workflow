'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { linkAccount, type LinkAccountState } from './actions'

const initialState: LinkAccountState = { error: null }

/**
 * Brief 012 §2.4 — "a one-action path to create their member record."
 * team_id and role are both required by workflow.members' own schema
 * (migration 001: team_id NOT NULL, role NOT NULL default 'member') —
 * an admin picks both here rather than a bare "link" button silently
 * defaulting role, since role is what decides which board scope (Brief
 * 009) this person lands on.
 */
export function UnlinkedAccountRow({
  userId,
  email,
  sinceLabel,
  teams,
}: {
  userId: string
  email: string | null
  sinceLabel: string
  teams: { id: string; labelEn: string }[]
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(linkAccount, initialState)

  return (
    <form action={formAction} className="wf-queue__row">
      <input type="hidden" name="userId" value={userId} />
      <div className="wf-queue__row-identity">
        <span className="wf-queue__row-email">{email ?? userId}</span>
        <span className="wf-queue__row-since">{sinceLabel}</span>
      </div>
      <select name="teamId" defaultValue="" required aria-label={t('usersQueueTeamLabel')}>
        <option value="" disabled>
          {t('usersQueueChooseTeam')}
        </option>
        {teams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.labelEn}
          </option>
        ))}
      </select>
      <select name="role" defaultValue="member" required aria-label={t('usersQueueRoleLabel')}>
        <option value="member">{t('usersRoleMember')}</option>
        <option value="manager">{t('usersRoleManager')}</option>
        <option value="admin">{t('usersRoleAdmin')}</option>
      </select>
      <button type="submit" disabled={pending}>
        {pending ? t('usersQueueLinkPending') : t('usersQueueLinkAction')}
      </button>
      {state.error && <span className="wf-queue__row-error">{t('usersQueueLinkError')}</span>}
    </form>
  )
}
