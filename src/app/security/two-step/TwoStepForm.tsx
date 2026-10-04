import { getServerTranslator } from '@/lib/i18n/server'

/**
 * ADTECH_WF_Brief_108 — a plain HTML form posting to a fixed address
 * (/security/two-step/verify), not a Server Action: it must work whatever
 * URL the browser shows, and with a full page load after it so the raised
 * session is the one every following request carries.
 */
export async function TwoStepForm({ next, error }: { next: string | null; error: boolean }) {
  const t = await getServerTranslator()
  return (
    <form method="post" action="/security/two-step/verify" className="login-form__fields">
      {next && <input type="hidden" name="next" value={next} />}
      <label className="field">
        <span className="field__label">{t('securityTwoStepCode')}</span>
        <input className="field__input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7} required autoFocus />
      </label>
      {error ? (
        <div className="login-form__error" role="alert">
          {t('securityTwoStepError')}
        </div>
      ) : null}
      <button className="btn btn--primary" type="submit">
        {t('securityTwoStepSubmit')}
      </button>
    </form>
  )
}
