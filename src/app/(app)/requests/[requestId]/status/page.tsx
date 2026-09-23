import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getTeamLabelsByUserIds } from '@/lib/auth/member-teams'
import { daysSinceICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { AgeLadder } from '@/components/AgeLadder'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { requestStatusAncestors } from '@/lib/breadcrumbs'
import { CloseRequestControl } from '../CloseRequestControl'

export const metadata: Metadata = {
  title: 'Status — ADTECH Workflow Tracker',
}

/**
 * Screen 3c, frame 2 — checking status after a Telegram nudge (Brief 028
 * §2). Phone archetype: two jobs only, no data entry, no lists to browse
 * (§2's own instruction — this is NOT a responsive/shrunken version of
 * 1e, a genuinely different, minimal screen built fresh for phone width).
 * Reuses 1e's own underlying data (workflow.requests + request_handoffs)
 * and its exact age computations, but a completely different, minimal
 * template — "who has it and how long" in the first screenful, nothing
 * to scroll for.
 *
 * SCHEMA GAP FOUND: the mockup (div id="3c", frame 2) shows "overdue
 * since {date}." No needed-by/due-date column exists anywhere on
 * workflow.requests (checked directly — opened_at/closed_at/created_at/
 * updated_at are the only date columns) — the same gap 5a's own message
 * #4 ("needed-by passed") runs into. Left out rather than invented; the
 * age ladder's own colour (amber at 6+ days, red at 11+) is this app's
 * existing substitute for "is this late," the same signal every other
 * screen already relies on instead of a separate due-date line.
 *
 * DEEP-LINK COLD START (§3): no special handling needed in this file —
 * the (app) layout's own auth gate (src/lib/supabase/proxy.ts) now
 * carries the original path through login via a `next` param and
 * redirects back here after sign-in (this brief's own addition; see
 * proxy.ts / login/actions.ts).
 *
 * ACTIONS: "Close" is real — reuses CloseRequestControl/closeRequest
 * exactly as 1e does (same requester-or-current-owner gate, enforced
 * server-side there, unchanged here). "Nudge" is NOT wired to anything —
 * sending a Telegram message requires the send capability Brief 029
 * investigates; rendered as an inert, clearly-labelled action rather
 * than a fake button that does nothing when tapped.
 */
export default async function RequestStatusPage({ params }: PageProps<'/requests/[requestId]/status'>) {
  const { requestId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { user } = await getCurrentMember()

  const { data: request } = await supabase
    .from('requests')
    .select('id, body, requester_id, current_owner_id, opened_at, closed_at')
    .eq('id', requestId)
    .maybeSingle()

  if (!request) {
    notFound()
  }

  // Brief 094 §3.4 — a failed read here used to render identically to
  // "no recent activity," on a phone-facing status screen a requester
  // reads to judge whether their request is progressing at all.
  const { data: handoffs, error: handoffsError } = await supabase
    .from('request_handoffs')
    .select('id, from_owner_id, to_owner_id, started_at')
    .eq('request_id', request.id)
    .order('started_at', { ascending: false })
    .limit(4)
  if (handoffsError) console.error('RequestStatusPage: request_handoffs read failed', handoffsError)

  const legs = handoffs ?? []

  const profiles = await getUserProfilesByIds(supabase, [
    request.current_owner_id,
    ...legs.map((l) => l.from_owner_id),
    ...legs.map((l) => l.to_owner_id),
  ])
  const ownerTeam = await getTeamLabelsByUserIds(supabase, [request.current_owner_id])

  const ownerLabel = request.current_owner_id
    ? formatMemberName(profiles.get(request.current_owner_id), t('membersNoProfile'))
    : t('dashboardUnassigned')
  const ownerTeamLabel = request.current_owner_id ? ownerTeam.get(request.current_owner_id) : undefined

  const now = new Date()
  const totalAgeDays = daysSinceICT(request.opened_at, request.closed_at ?? now)
  // Same "current leg" derivation as 1e — the most recent handoff's own
  // started_at, or the request's own opened_at if it has never moved.
  const currentLegStartedAt = legs.length > 0 ? legs[0].started_at : request.opened_at
  const ageInCurrentStateDays = daysSinceICT(currentLegStartedAt, request.closed_at ?? now)

  const canClose =
    !request.closed_at && user != null && (user.id === request.requester_id || user.id === request.current_owner_id)

  return (
    <>
      {/* Brief 071 — no breadcrumb on this route, decided: see
          requestStatusAncestors's own header in src/lib/breadcrumbs.ts
          for why (this is a requester-facing Telegram deep-link screen;
          a "Triage" ancestor doesn't serve its own audience). Brief 070
          had added one here and flagged it as an open judgment call —
          that call is now made. */}
      <Breadcrumbs ancestors={requestStatusAncestors()} current={t('phoneStatusKicker')} />
      <div className="phone-status">
      <div className="phone-status__kicker">{t('phoneStatusKicker')}</div>

      {request.closed_at && <div className="phone-status__closed-badge">{t('requestDetailClosedBadge')}</div>}

      <p className="phone-status__body">{request.body}</p>

      <div className="phone-status__owner-block">
        <span className="phone-status__owner-label">{t('phoneStatusHeldByLabel')}</span>
        <span className="phone-status__owner-name">{ownerLabel}</span>
        {ownerTeamLabel && <span className="phone-status__owner-team">{ownerTeamLabel}</span>}
      </div>

      <div className="phone-status__clock">
        <AgeLadder
          days={ageInCurrentStateDays}
          label={`${ageInCurrentStateDays}d ${t('phoneStatusInStateLabel')}`}
          full
        />
      </div>
      <div className="phone-status__total-age">
        {totalAgeDays}d {t('phoneStatusTotalAgeLabel')}
      </div>

      <div className="phone-status__panel">
        <div className="phone-status__panel-title">{t('phoneStatusRecentActivityTitle')}</div>
        {handoffsError ? (
          <p className="phone-status__empty" role="alert">
            {t('phoneStatusLoadError')}
          </p>
        ) : legs.length === 0 ? (
          <p className="phone-status__empty">{t('phoneStatusNoLegs')}</p>
        ) : (
          <div className="phone-status__legs">
            {legs.map((leg) => (
              <div key={leg.id} className="phone-status__leg">
                <span className="phone-status__leg-to">
                  {formatMemberName(profiles.get(leg.to_owner_id), t('membersNoProfile'))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="phone-status__actions">
        <div className="phone-status__nudge">
          <span className="phone-btn phone-btn--disabled">
            {t('phoneStatusNudgeAction')} {ownerLabel}
          </span>
          <p className="phone-status__nudge-note">{t('phoneStatusNudgeUnavailableNote')}</p>
        </div>
        <CloseRequestControl requestId={request.id} canClose={canClose} />
      </div>

      <Link href={`/requests/${request.id}`} className="phone-status__full-detail-link">
        {t('phoneStatusOpenFullDetail')}
      </Link>
    </div>
    </>
  )
}
