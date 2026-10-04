'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { verifyTwoStep, type TwoStepState } from './actions'

const initialState: TwoStepState = { error: false }

export function TwoStepForm({ next }: { next: string | null }) {
  const { t } = useLanguage()
  const [state, action, pending] = useActionState(verifyTwoStep, initialState)
  return (
    <form action={action} className="login-form__fields">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="field">
        <span className="field__label">{t('securityTwoStepCode')}</span>
        <input
          className="field__input"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          required
          autoFocus
        />
      </label>
      {state.error ? (
        <div className="login-form__error" role="alert">
          {t('securityTwoStepError')}
        </div>
      ) : null}
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? t('securityTwoStepSubmitPending') : t('securityTwoStepSubmit')}
      </button>
    </form>
  )
}
