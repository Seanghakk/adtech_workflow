'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { createStage } from './actions'
import { lookupInitialState } from './lookup-shared'
import type { TeamOption } from './StageRow'

export interface ScopeTypeOption {
  code: string
  labelEn: string
}

/**
 * §3.7 — the five fields needed to create a stage: scope_type, code,
 * label_en, sequence, owner_team_id. label_km is offered but optional at
 * creation (nullable column) — a fresh stage is created inactive and
 * gains its Khmer label, if any, through StageRow's edit form before it
 * can be activated (§3.6).
 */
export function AddStageForm({ scopeTypes, teams }: { scopeTypes: ScopeTypeOption[]; teams: TeamOption[] }) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(createStage, lookupInitialState)

  const [scopeType, setScopeType] = useState('')
  const [code, setCode] = useState('')
  const [labelEn, setLabelEn] = useState('')
  const [labelKm, setLabelKm] = useState('')
  const [sequence, setSequence] = useState('10')
  const [ownerTeamId, setOwnerTeamId] = useState('')
  const [isTerminal, setIsTerminal] = useState(false)
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  if (state.savedAt && state.savedAt !== handledSavedAt) {
    setHandledSavedAt(state.savedAt)
    setScopeType('')
    setCode('')
    setLabelEn('')
    setLabelKm('')
    setSequence('10')
    setOwnerTeamId('')
    setIsTerminal(false)
  }

  const canAdd = scopeType !== '' && code.trim() !== '' && labelEn.trim() !== '' && ownerTeamId !== '' && !pending

  return (
    <form action={formAction} className="wf-lookup-add">
      <input type="hidden" name="isTerminal" value={isTerminal ? 'true' : 'false'} />
      <span className="wf-lookup-add__title">{t('lookupsAddTitle')}</span>
      <div className="wf-lookup-add__fields">
        <label className="field wf-lookup-edit__field">
          <span className="field__label">{t('lookupsStageColScopeType')}</span>
          <select
            className="field__input"
            name="scopeType"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value)}
          >
            <option value="">{t('lookupsStageScopeTypeChoose')}</option>
            {scopeTypes.map((st) => (
              <option key={st.code} value={st.code}>
                {st.labelEn}
              </option>
            ))}
          </select>
        </label>

        <label className="field wf-lookup-edit__field wf-lookup-edit__field--narrow">
          <span className="field__label">{t('lookupsCodeLabel')}</span>
          <input
            className="field__input"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <span className="field__label-optional">{t('lookupsCodeHint')}</span>
        </label>

        <label className="field wf-lookup-edit__field">
          <span className="field__label">{t('lookupsLabelEnLabel')}</span>
          <input
            className="field__input"
            name="labelEn"
            value={labelEn}
            onChange={(e) => setLabelEn(e.target.value)}
          />
        </label>

        <label className="field wf-lookup-edit__field">
          <span className="field__label">{t('lookupsLabelKmLabel')}</span>
          <input
            className="field__input"
            name="labelKm"
            value={labelKm}
            onChange={(e) => setLabelKm(e.target.value)}
          />
          <span className="field__label-optional">{t('lookupsLabelKmOptionalHint')}</span>
        </label>

        <label className="field wf-lookup-edit__field wf-lookup-edit__field--narrow">
          <span className="field__label">{t('lookupsStageColSequence')}</span>
          <input
            className="field__input"
            name="sequence"
            type="number"
            value={sequence}
            onChange={(e) => setSequence(e.target.value)}
          />
        </label>

        <label className="field wf-lookup-edit__field">
          <span className="field__label">{t('lookupsStageColOwnerTeam')}</span>
          <select
            className="field__input"
            name="ownerTeamId"
            value={ownerTeamId}
            onChange={(e) => setOwnerTeamId(e.target.value)}
          >
            <option value="">{t('lookupsStageOwnerTeamChoose')}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.labelEn}
              </option>
            ))}
          </select>
        </label>

        <label className="wf-lookup-edit__active">
          <input type="checkbox" checked={isTerminal} onChange={(e) => setIsTerminal(e.target.checked)} />
          {t('lookupsStageIsTerminalLabel')}
        </label>
      </div>
      <button type="submit" className={canAdd ? 'btn btn--primary' : 'btn btn--primary btn--disabled'} disabled={pending}>
        {pending ? t('lookupsAddPending') : t('lookupsAddAction')}
      </button>
      {state.error && (
        <div className="update-card__error" role="alert">
          {state.error}
        </div>
      )}
    </form>
  )
}
