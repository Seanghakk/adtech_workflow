'use client'

import { useActionState, useState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { lookupInitialState, type LookupFormState } from './lookup-shared'

export interface StageRowData {
  id: string
  scopeTypeCode: string
  code: string
  labelEn: string
  labelKm: string | null
  sequence: number
  ownerTeamId: string
  isTerminal: boolean
  isActive: boolean
}

export interface TeamOption {
  id: string
  labelEn: string
}

function needsAttention(labelKm: string | null): boolean {
  return !labelKm || labelKm.trim().startsWith('[provisional')
}

/**
 * One row of the stages admin table (Brief 017 §3.7). scope_type and code
 * are shown but never editable here — immutable after creation (§3.4),
 * same discipline as LookupRow's own code field.
 */
export function StageRow({
  row,
  teams,
  updateAction,
}: {
  row: StageRowData
  teams: TeamOption[]
  updateAction: (prevState: LookupFormState, formData: FormData) => Promise<LookupFormState>
}) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [state, formAction, pending] = useActionState(updateAction, lookupInitialState)

  const [labelEn, setLabelEn] = useState(row.labelEn)
  const [labelKm, setLabelKm] = useState(row.labelKm ?? '')
  const [sequence, setSequence] = useState(String(row.sequence))
  const [ownerTeamId, setOwnerTeamId] = useState(row.ownerTeamId)
  const [isTerminal, setIsTerminal] = useState(row.isTerminal)
  const [isActive, setIsActive] = useState(row.isActive)
  const [handledSavedAt, setHandledSavedAt] = useState<string | null>(null)

  if (state.savedAt && state.savedAt !== handledSavedAt) {
    setHandledSavedAt(state.savedAt)
    setEditing(false)
  }

  const ownerTeamLabel = teams.find((team) => team.id === row.ownerTeamId)?.labelEn ?? '—'

  if (!editing) {
    return (
      <tr className={row.isActive ? undefined : 'wf-admin-row--inactive'}>
        <td>{row.scopeTypeCode}</td>
        <td>{row.code}</td>
        <td>{row.labelEn}</td>
        <td>
          {row.labelKm ?? '—'}
          {needsAttention(row.labelKm) && (
            <span className="wf-admin-table__hint">{t('lookupsNeedsAttention')}</span>
          )}
        </td>
        <td>{row.sequence}</td>
        <td>{ownerTeamLabel}</td>
        <td>{row.isTerminal ? t('lookupsStageTerminalYes') : '—'}</td>
        <td>{row.isActive ? t('usersStatusActive') : t('usersStatusInactive')}</td>
        <td>
          <button type="button" className="wf-admin-row__reactivate" onClick={() => setEditing(true)}>
            {t('lookupsEdit')}
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td colSpan={9}>
        <form action={formAction} className="wf-lookup-edit">
          <input type="hidden" name="id" value={row.id} />
          <input type="hidden" name="isTerminal" value={isTerminal ? 'true' : 'false'} />
          <input type="hidden" name="isActive" value={isActive ? 'true' : 'false'} />

          <label className="field wf-lookup-edit__field">
            <span className="field__label">{t('lookupsColLabelEn')}</span>
            <input
              className="field__input"
              name="labelEn"
              value={labelEn}
              onChange={(e) => setLabelEn(e.target.value)}
            />
          </label>

          <label className="field wf-lookup-edit__field">
            <span className="field__label">{t('lookupsColLabelKm')}</span>
            <input
              className="field__input"
              name="labelKm"
              value={labelKm}
              onChange={(e) => setLabelKm(e.target.value)}
            />
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

          <label className="wf-lookup-edit__active">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {t('lookupsActiveLabel')}
          </label>
          <span className="wf-admin-table__hint">{t('lookupsActivateBlockedHint')}</span>

          <div className="wf-lookup-edit__actions">
            <button type="submit" className="wf-admin-row__reactivate" disabled={pending}>
              {pending ? t('lookupsSaving') : t('lookupsSave')}
            </button>
            <button type="button" onClick={() => setEditing(false)} disabled={pending}>
              {t('lookupsCancel')}
            </button>
          </div>

          {state.error && <span className="wf-admin-row__confirm-error">{state.error}</span>}
        </form>
      </td>
    </tr>
  )
}
