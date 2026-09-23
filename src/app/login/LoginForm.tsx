'use client'

import { useActionState } from 'react'
import { useLanguage } from '@/lib/i18n/LanguageProvider'
import { signIn, type SignInState } from './actions'

const initialState: SignInState = { error: null }

/**
 * Rebuilt to the administration archetype (Brief 010 §2 / Design Note
 * Rev 3 §5, Token Spec v3 §2) — this screen predated Rev 3 and had never
 * been brought up to it. Card sizing (400px / 48px controls), the full-
 * size brand mark with a 2px ink rule under it, and the plain-text reset
 * path (§5.5) all live in globals.css's own "Login screen" section; see
 * that file for the reasoning behind each.
 *
 * Brief 090 fix 2 — the language toggle moved OUT of this card entirely:
 * v7.1 §14.1 places it "above the card, right-aligned," not inside the
 * card's own header. It had been living here (inside .login-form__header,
 * competing for space with the brand mark), which is what let it be
 * squeezed to an unusable ~38px sliver on /login — Brief 089 §0 urgent 2.
 * Now rendered by page.tsx, a sibling above this form. See LoginPage.
 */
export function LoginForm({ next }: { next?: string }) {
  const { t } = useLanguage()
  const [state, action, pending] = useActionState(signIn, initialState)

  return (
    <form action={action} className="login-form">
      {/* Brief 028 §3 — deep-link cold start: a Telegram button that
          opens this app signed-out must land back on the intended page
          after sign-in, not always on the board. Validated server-side
          in actions.ts before ever being used as a redirect target. */}
      {next && <input type="hidden" name="next" value={next} />}
      <div className="login-form__header">
        <span className="brand-mark brand-mark--lg" aria-hidden="true">
          <span className="brand-mark__blocks">
            <span className="brand-mark__block brand-mark__block--blue" />
            <span className="brand-mark__block brand-mark__block--ink" />
          </span>
          <span className="brand-mark__text">
            <span className="brand-mark__name">ADTECH</span>
            <span className="brand-mark__app">Workflow</span>
          </span>
        </span>
      </div>
      <div className="login-form__fields">
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
        <p className="login-form__reset">{t('loginResetPath')}</p>
      </div>
    </form>
  )
}
