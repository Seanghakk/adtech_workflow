'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { updateProjectIdentity } from './actions'
import { setupInitialState } from './setup-shared'

/** Brief 097 §6.2 item 1 — owner/consultant, the only two editable
 *  fields in Identity. Uses the 4.1 form-row shared part. */
export function IdentityForm({
  projectId,
  ownerName,
  consultantName,
}: {
  projectId: string
  ownerName: string | null
  consultantName: string | null
}) {
  const { t } = useLanguage()
  const [state, formAction, pending] = useActionState(updateProjectIdentity, setupInitialState)

  return (
    <form action={formAction} className="wf-form-row">
      <input type="hidden" name="projectId" value={projectId} />
      <label className="wf-form-row__field">
        <span className="wf-form-row__label">{t('setupIdentityOwner')}</span>
        <input
          className="wf-form-row__input"
          type="text"
          name="ownerName"
          defaultValue={ownerName ?? ''}
          placeholder={t('setupIdentityNotSet')}
        />
      </label>
      <label className="wf-form-row__field">
        <span className="wf-form-row__label">{t('setupIdentityConsultant')}</span>
        <input
          className="wf-form-row__input"
          type="text"
          name="consultantName"
          defaultValue={consultantName ?? ''}
          placeholder={t('setupIdentityNotSet')}
        />
      </label>
      <button type="submit" className="wf-form-row__submit" disabled={pending}>
        {t('setupIdentitySave')}
      </button>
      {state.error && <span className="update-card__error">{state.error}</span>}
    </form>
  )
}
