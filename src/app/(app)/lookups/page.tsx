import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import { getServerTranslator } from '@/lib/i18n/server'
import { NoAccessScreen } from '@/components/NoAccessScreen'
import { LookupRow } from './LookupRow'
import { AddLookupRowForm } from './AddLookupRowForm'
import { StageRow } from './StageRow'
import { AddStageForm } from './AddStageForm'
import { createReasonCode, createScopeType, updateReasonCode, updateScopeType, updateStage } from './actions'

export const metadata: Metadata = {
  title: 'Lookup Tables — ADTECH Workflow Tracker',
}

/**
 * Screen: Lookup Table Admin (Brief 017 §3 / Design Note Rev 3 §4.8 and
 * §6). Administration archetype, same as /users — table, not cards, no
 * age ladder, no card weight (§3.1: "a reason code is not late"). Covers
 * exactly the three tables §3.3 names: reason_codes, scope_types, stages.
 * approval_steps is deliberately NOT here (§5 — its content depends on an
 * undecided approval process).
 *
 * §3.9 — managers and admins only, same RLS-backed boundary as /users
 * (workflow.is_manager()-gated writes), not merely a navigation choice.
 */
export default async function LookupsPage() {
  const { member } = await getCurrentMember()

  if (!member || !isManagerOrAdmin(member)) {
    return <NoAccessScreen />
  }

  const supabase = await createClient()
  const t = await getServerTranslator()

  const [{ data: reasonCodes }, { data: scopeTypes }, { data: stages }, { data: teams }] = await Promise.all([
    supabase.from('reason_codes').select('code, label_en, label_km, sort_order, is_active').order('sort_order'),
    supabase.from('scope_types').select('code, label_en, label_km, sort_order, is_active').order('sort_order'),
    supabase
      .from('stages')
      .select('id, scope_type, code, label_en, label_km, sequence, owner_team_id, is_terminal, is_active')
      .order('scope_type')
      .order('sequence'),
    // Brief §3.7 — "teams has 12 real rows, so owner_team_id is a genuine
    // picker." Active only, matching every other picker in this app
    // (PostRequestForm's own teams query).
    supabase.from('teams').select('id, label_en').eq('is_active', true).order('sort_order'),
  ])

  const teamOptions = (teams ?? []).map((team) => ({ id: team.id, labelEn: team.label_en }))
  const activeScopeTypeOptions = (scopeTypes ?? [])
    .filter((st) => st.is_active)
    .map((st) => ({ code: st.code, labelEn: st.label_en }))

  return (
    <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('lookupsKicker')}</div>
        <h1 className="wf-admin__title">{t('lookupsTitle')}</h1>
      </div>

      <section className="wf-lookup-section">
        <h2 className="wf-lookup-section__title">{t('lookupsReasonCodesTitle')}</h2>
        <table className="wf-admin-table">
          <thead>
            <tr>
              <th>{t('lookupsColCode')}</th>
              <th>{t('lookupsColLabelEn')}</th>
              <th>{t('lookupsColLabelKm')}</th>
              <th>{t('lookupsColSortOrder')}</th>
              <th>{t('lookupsColStatus')}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {(reasonCodes ?? []).map((row) => (
              <LookupRow
                key={row.code}
                row={{
                  code: row.code,
                  labelEn: row.label_en,
                  labelKm: row.label_km,
                  sortOrder: row.sort_order,
                  isActive: row.is_active,
                }}
                updateAction={updateReasonCode}
              />
            ))}
          </tbody>
        </table>
        <AddLookupRowForm createAction={createReasonCode} />
      </section>

      <section className="wf-lookup-section">
        <h2 className="wf-lookup-section__title">{t('lookupsScopeTypesTitle')}</h2>
        <table className="wf-admin-table">
          <thead>
            <tr>
              <th>{t('lookupsColCode')}</th>
              <th>{t('lookupsColLabelEn')}</th>
              <th>{t('lookupsColLabelKm')}</th>
              <th>{t('lookupsColSortOrder')}</th>
              <th>{t('lookupsColStatus')}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {(scopeTypes ?? []).map((row) => (
              <LookupRow
                key={row.code}
                row={{
                  code: row.code,
                  labelEn: row.label_en,
                  labelKm: row.label_km,
                  sortOrder: row.sort_order,
                  isActive: row.is_active,
                }}
                updateAction={updateScopeType}
              />
            ))}
          </tbody>
        </table>
        <AddLookupRowForm createAction={createScopeType} />
      </section>

      <section className="wf-lookup-section">
        <h2 className="wf-lookup-section__title">{t('lookupsStagesTitle')}</h2>
        {/* §3.8 — stages is empty right now; that is the first thing a
            person sees here, and it must read as "nothing defined yet,
            add the first one," never as a blank or an error. */}
        {!stages || stages.length === 0 ? (
          <p className="empty-state">{t('lookupsStagesEmpty')}</p>
        ) : (
          <table className="wf-admin-table">
            <thead>
              <tr>
                <th>{t('lookupsStageColScopeType')}</th>
                <th>{t('lookupsColCode')}</th>
                <th>{t('lookupsColLabelEn')}</th>
                <th>{t('lookupsColLabelKm')}</th>
                <th>{t('lookupsStageColSequence')}</th>
                <th>{t('lookupsStageColOwnerTeam')}</th>
                <th>{t('lookupsStageColTerminal')}</th>
                <th>{t('lookupsColStatus')}</th>
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {stages.map((row) => (
                <StageRow
                  key={row.id}
                  row={{
                    id: row.id,
                    scopeTypeCode: row.scope_type,
                    code: row.code,
                    labelEn: row.label_en,
                    labelKm: row.label_km,
                    sequence: row.sequence,
                    ownerTeamId: row.owner_team_id,
                    isTerminal: row.is_terminal,
                    isActive: row.is_active,
                  }}
                  teams={teamOptions}
                  updateAction={updateStage}
                />
              ))}
            </tbody>
          </table>
        )}
        <AddStageForm scopeTypes={activeScopeTypeOptions} teams={teamOptions} />
      </section>
    </div>
  )
}
