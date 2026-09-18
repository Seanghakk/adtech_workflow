import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { hoursSinceICT } from '@/lib/format/datetime'
import { getHourLabelBand } from '@/lib/age'
import { AgeLadder } from '@/components/AgeLadder'
import { getServerTranslator } from '@/lib/i18n/server'
import { TriageRouteForm } from './TriageRouteForm'

export const metadata: Metadata = {
  title: 'Triage — ADTECH Workflow Tracker',
}

/**
 * Screen 1c — Triage (Brief 021 §2). Small focused panel archetype,
 * Design Note Rev 3 §4.4, 520-800px, deliberately the smallest screen in
 * the set. Any active member reaches this screen (§1.1) — same
 * unconditional-access reasoning as /requests/new (Brief 015 §4): the
 * (app) layout's own gate already requires an active workflow.members row,
 * no further restriction is added here.
 *
 * §2.1 — holds requests with no destination team: destination_unsure is
 * true, OR destination_team_id is null. Also filters closed_at is null —
 * not stated verbatim in the brief's own column list, but a closed request
 * needs no routing decision and would misread as a live queue item;
 * JUDGMENT CALL, flagged rather than silently decided, consistent with
 * every other queue in this app (e.g. Awaiting SO's own `status = 'open'`
 * filter, Brief 018 §3).
 *
 * §2.2 — runs its clock in HOURS via hoursSinceICT/getHourLadderSegments
 * (src/lib/age.ts), the one screen in the app that does not use the day
 * ladder.
 *
 * §2.5 — sorted oldest first (descending hours old): "on this screen that
 * is the whole job."
 */
export default async function TriagePage() {
  const supabase = await createClient()
  const t = await getServerTranslator()

  const [{ data: requests }, { data: teams }] = await Promise.all([
    supabase
      .from('requests')
      .select('id, body, requester_id, opened_at, destination_unsure, destination_team_id')
      .is('closed_at', null)
      .or('destination_unsure.eq.true,destination_team_id.is.null'),
    supabase
      .from('teams')
      .select('id, label_en, label_km')
      .eq('is_active', true)
      .order('sort_order'),
  ])

  const teamOptions = (teams ?? []).map((team) => ({
    id: team.id,
    labelEn: team.label_en,
    labelKm: team.label_km,
  }))

  const profiles = await getUserProfilesByIds(supabase, (requests ?? []).map((r) => r.requester_id))

  const rows = (requests ?? [])
    .map((r) => ({
      id: r.id,
      body: r.body,
      requesterLabel: formatMemberName(profiles.get(r.requester_id), t('membersNoProfile')),
      hoursOld: hoursSinceICT(r.opened_at),
    }))
    .sort((a, b) => b.hoursOld - a.hoursOld)

  return (
    <div className="triage">
      <div className="triage__header">
        <div className="triage__kicker">{t('triageKicker')}</div>
        <h1 className="triage__title">{t('triageTitle')}</h1>
      </div>

      {rows.length === 0 ? (
        <div className="empty-state empty-state--result">
          <span className="empty-state__figure">0</span>
          <span className="empty-state__fact">{t('triageEmptyFact')}</span>
        </div>
      ) : (
        <div className="triage__list">
          {rows.map((row) => {
            const weight = getHourLabelBand(row.hoursOld)
            return (
              <div key={row.id} className={`exception-card exception-card--${weight} triage-card`}>
                <div className="exception-card__meta">{row.requesterLabel}</div>
                <div className="exception-card__title">
                  <Link href={`/requests/${row.id}`} className="exception-card__title--link">
                    {row.body}
                  </Link>
                </div>

                <AgeLadder
                  hours={row.hoursOld}
                  label={`${Math.max(0, Math.floor(row.hoursOld))}${t('triageHoursSuffix')} ${t('triageSinceOpened')}`}
                  full
                />

                <TriageRouteForm requestId={row.id} teams={teamOptions} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
