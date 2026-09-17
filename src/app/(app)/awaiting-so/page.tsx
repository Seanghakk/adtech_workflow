import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isSalesTeamMember } from '@/lib/auth/sales-roles'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getTeamLabelsByUserIds } from '@/lib/auth/member-teams'
import { daysSinceICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { getCardWeight } from '@/lib/age'
import { AgeLadder } from '@/components/AgeLadder'

export const metadata: Metadata = {
  title: 'Awaiting SO — ADTECH Workflow Tracker',
}

/**
 * Screen 2b — Awaiting SO (Brief 018 §3). Small focused panel archetype,
 * Design Note Rev 3 §4.4, built as the QUEUE §3.1 describes (every open
 * project with no SO number yet), not the single fixed example the
 * Rev 2 mockup drew — §3.1's own framing ("the queue of work...") and
 * §3.4's sort instruction only make sense for a list.
 *
 * READ-ONLY this round (Brief §4) — the mockup's "Issue SO number"
 * button is not built; issuing an SO is a write action with no
 * permission model defined yet, same reasoning as 2a's read-only-this-
 * round decision (§2.1).
 *
 * DEPARTURE FROM THE MOCKUP: the "already happening without a number"
 * checklist keeps only the one line backed by a real column
 * (procurement_lines.sourcing_started_at) — BOQ-received and
 * PM-assigned-informally have no matching columns anywhere in this
 * schema (workflow.projects/workflow.procurement_lines), so inventing
 * them would violate the same "build to what the columns hold" rule
 * 2a's Result doc already applies. The Accountable mark uses pic_id
 * (this schema's one "named person holding it" column), not a
 * fabricated Finance-role owner — a null pic_id here is itself a real,
 * expected case for this exact screen (an unentered PM assignment is
 * precisely the kind of gap 2b exists to surface), not an edge case to
 * paper over.
 */
export default async function AwaitingSoPage() {
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  if (!member) return null

  const restricted = isSalesTeamMember(member)

  const [{ data: projects }, { data: procurementLines }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, stream, opened_at, pic_id, clients(name)')
      .is('so_number', null)
      .eq('status', 'open'),
    supabase.from('procurement_lines').select('project_id, sourcing_started_at'),
  ])

  const sourcingCountByProject = new Map<string, number>()
  for (const line of procurementLines ?? []) {
    if (!line.sourcing_started_at) continue
    sourcingCountByProject.set(line.project_id, (sourcingCountByProject.get(line.project_id) ?? 0) + 1)
  }

  const picIds = (projects ?? []).map((p) => p.pic_id)
  const profiles = await getUserProfilesByIds(supabase, picIds)
  const teamLabels = await getTeamLabelsByUserIds(supabase, picIds)

  const rows = (projects ?? [])
    .map((p) => {
      const client = Array.isArray(p.clients) ? p.clients[0] : p.clients
      return {
        id: p.id,
        name: p.name,
        stream: p.stream,
        clientName: client?.name ?? null,
        ageDays: daysSinceICT(p.opened_at),
        picId: p.pic_id,
        picLabel: p.pic_id ? formatMemberName(profiles.get(p.pic_id), t('membersNoProfile')) : null,
        picTeam: p.pic_id ? teamLabels.get(p.pic_id) : undefined,
        sourcingLineCount: sourcingCountByProject.get(p.id) ?? 0,
      }
    })
    .sort((a, b) => b.ageDays - a.ageDays)

  return (
    <div className="awaiting-so">
      <div className="awaiting-so__header">
        <div className="awaiting-so__kicker">{t('awaitingSoKicker')}</div>
        <h1 className="awaiting-so__title">{t('awaitingSoTitle')}</h1>
      </div>

      {restricted && <div className="board__restricted-notice">{t('awaitingSoRestrictedNotice')}</div>}

      {rows.length === 0 ? (
        <div className="empty-state empty-state--result">
          <span className="empty-state__figure">0</span>
          <span className="empty-state__fact">
            {restricted ? t('awaitingSoRestrictedEmpty') : t('awaitingSoEmptyFact')}
          </span>
        </div>
      ) : (
        <div className="awaiting-so__list">
          {rows.map((row) => {
            const weight = getCardWeight(row.ageDays)
            return (
              <div key={row.id} className={`exception-card exception-card--${weight} awaiting-so-card`}>
                <div className="exception-card__meta">
                  <span className="so-number so-number--pending">{t('soRecordNoSoYet')}</span>{' '}
                  <span className="stream-tag">{row.stream.toUpperCase()}</span>
                </div>
                <div className="exception-card__title">{row.name}</div>
                {row.clientName && <div className="awaiting-so-card__client">{row.clientName}</div>}

                <div className="awaiting-so-card__accountable">
                  <span className="awaiting-so-card__accountable-label">{t('awaitingSoAccountable')}</span>
                  <span
                    className={
                      row.picLabel ? 'exception-card__pic' : 'exception-card__pic board-card__pic--unassigned'
                    }
                  >
                    {(row.picLabel ?? t('dashboardUnassigned')).toUpperCase()}
                  </span>
                  {row.picTeam && <span className="awaiting-so-card__accountable-team">{row.picTeam}</span>}
                </div>

                {row.sourcingLineCount > 0 && (
                  <p className="awaiting-so-card__note">
                    {t('awaitingSoSourcingNotePrefix')} {row.sourcingLineCount} {t('awaitingSoSourcingNoteSuffix')}
                  </p>
                )}
                <p className="awaiting-so-card__note">{t('awaitingSoCommitmentBlockedNote')}</p>

                <div style={{ marginTop: 'var(--space-4)' }}>
                  <AgeLadder days={row.ageDays} label={`${row.ageDays}d ${t('awaitingSoSinceWon')}`} full />
                </div>

                <Link href={`/projects/${row.id}`} className="awaiting-so-card__link">
                  {t('awaitingSoViewRecord')}
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
