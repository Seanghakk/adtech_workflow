import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getTeamLabelsByUserIds } from '@/lib/auth/member-teams'
import { daysSinceICT, formatDateTimeICT } from '@/lib/format/datetime'
import { getServerTranslator, getServerLang } from '@/lib/i18n/server'
import { localizedLabel } from '@/lib/i18n/localized-label'
import { AgeLadder } from '@/components/AgeLadder'
import { HandOffForm } from './HandOffForm'
import { CloseRequestControl } from './CloseRequestControl'

export const metadata: Metadata = {
  title: 'Request — ADTECH Workflow Tracker',
}

/**
 * Screen 1e — Request Detail (Brief 021 §3). Record and detail archetype,
 * Design Note Rev 3 §4.3, 1300px. Not linked from anywhere yet this round
 * (screen 5a's Telegram deep links and a general request list are both
 * out of scope, §6) — reached from screen 1c's own rows (each links here,
 * a low-risk navigational addition) or by direct URL, same precedent as
 * /projects/[projectId] before 4a/2a existed to link to it.
 *
 * §3.1 — TWO CLOCKS THAT DISAGREE ON PURPOSE, both on the standard DAY
 * ladder (1e is not the hours screen; 1c is). §3.2 — the handoff history
 * is the point of this screen. §3.3 — the approval chain stays
 * amber-hatched; no control is built for it. §3.5 — named person holding
 * it, then age, never a team as owner.
 */
export default async function RequestDetailPage({ params }: PageProps<'/requests/[requestId]'>) {
  const { requestId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()
  const lang = await getServerLang()
  const { user } = await getCurrentMember()

  const { data: request } = await supabase
    .from('requests')
    .select(
      'id, body, requester_id, current_owner_id, destination_team_id, destination_unsure, opened_at, closed_at, teams(label_en, label_km)',
    )
    .eq('id', requestId)
    .maybeSingle()

  // Same "not found or not visible" convention as /projects/[projectId]
  // (Brief 018) — RLS and a genuinely missing row are not distinguishable
  // from here, and neither screen tries to.
  if (!request) {
    notFound()
  }

  const [{ data: handoffs }, { data: memberRows }] = await Promise.all([
    supabase
      .from('request_handoffs')
      .select('id, from_owner_id, to_owner_id, started_at')
      .eq('request_id', request.id)
      .order('started_at', { ascending: true }),
    supabase
      .from('members')
      .select('user_id, teams(label_en)')
      .eq('is_active', true),
  ])

  const legs = handoffs ?? []

  const profiles = await getUserProfilesByIds(supabase, [
    request.requester_id,
    request.current_owner_id,
    ...legs.map((l) => l.from_owner_id),
    ...legs.map((l) => l.to_owner_id),
    ...(memberRows ?? []).map((m) => m.user_id),
  ])
  const currentOwnerTeam = await getTeamLabelsByUserIds(supabase, [request.current_owner_id])

  const requesterLabel = formatMemberName(profiles.get(request.requester_id), t('membersNoProfile'))
  const ownerLabel = request.current_owner_id
    ? formatMemberName(profiles.get(request.current_owner_id), t('membersNoProfile'))
    : null
  const ownerTeamLabel = request.current_owner_id ? currentOwnerTeam.get(request.current_owner_id) : undefined

  const destinationTeam = Array.isArray(request.teams) ? request.teams[0] : request.teams
  const destinationTeamLabel = destinationTeam
    ? localizedLabel(destinationTeam.label_en, destinationTeam.label_km, lang)
    : null

  const now = new Date()
  const totalAgeDays = daysSinceICT(request.opened_at, request.closed_at ?? now)
  const currentLegStartedAt = legs.length > 0 ? legs[legs.length - 1].started_at : request.opened_at
  const ageInCurrentStateDays = daysSinceICT(currentLegStartedAt, request.closed_at ?? now)

  // §3.2 — each leg's own duration: from its own started_at to the NEXT
  // leg's started_at, or to closed_at/now for the open (last) leg.
  // request_handoffs has no update/delete policy (append-only, migration
  // 001) so ended_at is never written by this app — duration is always
  // derived from chronological order, never read from that column.
  const legRows = legs.map((leg, i) => {
    const nextStartedAt = legs[i + 1]?.started_at ?? request.closed_at ?? now
    return {
      id: leg.id,
      fromLabel: leg.from_owner_id
        ? formatMemberName(profiles.get(leg.from_owner_id), t('membersNoProfile'))
        : t('requestDetailHandoffFromNone'),
      toLabel: formatMemberName(profiles.get(leg.to_owner_id), t('membersNoProfile')),
      startedAt: leg.started_at,
      durationDays: daysSinceICT(leg.started_at, nextStartedAt),
    }
  })

  const memberOptions = (memberRows ?? [])
    // Excludes the current owner — handing a request to the person who
    // already holds it is a no-op the UI can rule out for free, a
    // cosmetic refinement rather than a schema/business-rule decision.
    .filter((m) => m.user_id !== request.current_owner_id)
    .map((m) => {
      const team = Array.isArray(m.teams) ? m.teams[0] : m.teams
      return {
        userId: m.user_id,
        label: formatMemberName(profiles.get(m.user_id), t('membersNoProfile')),
        teamLabel: team?.label_en,
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  const canClose =
    !request.closed_at && user != null && (user.id === request.requester_id || user.id === request.current_owner_id)

  return (
    <div className="request-detail">
      <div className="request-detail__header">
        <div className="request-detail__identity">
          <div className="request-detail__kicker-row">
            <span className="request-detail__kicker">{t('requestDetailKicker')}</span>
            {request.closed_at ? (
              <span className="request-detail__closed-badge">{t('requestDetailClosedBadge')}</span>
            ) : destinationTeamLabel ? (
              <span className="stream-tag">{destinationTeamLabel}</span>
            ) : (
              <span className="so-number so-number--pending">{t('requestDetailUnsureBadge')}</span>
            )}
          </div>
          <h1 className="request-detail__title">{request.body}</h1>
          <div className="request-detail__subline">
            {t('requestDetailRequestedBy')} {requesterLabel}
          </div>
        </div>
        <div className="request-detail__owner-block">
          <span className="request-detail__owner-label">{t('requestDetailOwnerLabel')}</span>
          <span className={ownerLabel ? 'exception-card__pic' : 'exception-card__pic board-card__pic--unassigned'}>
            {(ownerLabel ?? t('dashboardUnassigned')).toUpperCase()}
          </span>
          {ownerTeamLabel && <span className="request-detail__owner-team">{ownerTeamLabel}</span>}
        </div>
      </div>

      <div className="request-detail__clocks">
        <div className="request-detail__clock">
          <span className="request-detail__clock-label">{t('requestDetailTotalAge')}</span>
          <AgeLadder days={totalAgeDays} label={`${totalAgeDays}${t('requestDetailDaySuffix')}`} full />
        </div>
        <div className="request-detail__clock">
          <span className="request-detail__clock-label">{t('requestDetailAgeInCurrentState')}</span>
          <AgeLadder
            days={ageInCurrentStateDays}
            label={`${ageInCurrentStateDays}${t('requestDetailDaySuffix')}`}
            full
          />
        </div>
      </div>

      <div className="request-detail__panel">
        <div className="request-detail__panel-head">
          <span className="request-detail__panel-title">{t('requestDetailHandoffHistoryTitle')}</span>
          <span className="request-detail__panel-count">{legRows.length}</span>
        </div>
        {legRows.length === 0 ? (
          <p className="empty-state">{t('requestDetailHandoffHistoryEmpty')}</p>
        ) : (
          <div className="request-detail__panel-list">
            {legRows.map((leg) => (
              <div key={leg.id} className="request-detail__panel-row">
                <span className="request-detail__panel-row-body">
                  {leg.fromLabel} → {leg.toLabel}
                </span>
                <span className="request-detail__panel-row-meta">{formatDateTimeICT(leg.startedAt)}</span>
                <span className="request-detail__panel-row-age">{leg.durationDays}d</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="request-detail__panel">
        <div className="request-detail__panel-head">
          <span className="request-detail__panel-title">{t('requestDetailApprovalChainTitle')}</span>
        </div>
        <span className="request-detail__hatched">{t('requestDetailApprovalChainHatched')}</span>
      </div>

      {!request.closed_at && (
        <div className="request-detail__actions">
          <div className="request-detail__action-block">
            <span className="request-detail__action-label">{t('requestDetailHandOffLabel')}</span>
            <HandOffForm requestId={request.id} memberOptions={memberOptions} />
          </div>
          <CloseRequestControl requestId={request.id} canClose={canClose} />
        </div>
      )}
    </div>
  )
}
