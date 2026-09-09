'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { signIn, type SignInState } from './actions'

const initialState: SignInState = { error: null }

export function LoginForm() {
  const { t } = useLanguage()
  const [state, action, pending] = useActionState(signIn, initialState)

  return (
    <form action={action} className="login-form">
      <label className="field">
        <span className="field__label">{t('loginEmail')}</span>
        <input
          className="field__input"
          type="email"
          name="email"
          autoComplete="email"
          required
          autoFocus
        />
      </label>
      <label className="field">
        <span className="field__label">{t('loginPassword')}</span>
        <input
          className="field__input"
          type="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state.error ? (
        <div className="login-form__error" role="alert">
          {t('loginErrorGeneric')}
        </div>
      ) : null}
      <button className="btn btn--primary" type="submit" disabled={pending}>
        {pending ? t('loginSubmitPending') : t('loginSubmit')}
      </button>
    </form>
  )
}
