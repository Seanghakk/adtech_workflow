import type { ReactNode } from 'react'
import { LanguageToggle } from '@/components/LanguageToggle'
import { signOut } from '@/app/(app)/actions'

/** ADTECH_WF_Brief_107 — the frame every security page shares: the login card, a title, and a way out (sign out). */
export function SecurityCard({ title, body, signOutLabel, children }: { title: string; body: string; signOutLabel: string; children?: ReactNode }) {
  return (
    <div className="login-screen">
      <div className="login-screen__toggle">
        <LanguageToggle />
      </div>
      <div className="login-form">
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
          <h1 className="field__label">{title}</h1>
          <p className="login-form__reset">{body}</p>
        </div>
        {children}
        <form action={signOut} className="login-form__fields">
          <button className="btn" type="submit">
            {signOutLabel}
          </button>
        </form>
      </div>
    </div>
  )
}

/** A link to a CMMS page, or the plain instruction when NEXT_PUBLIC_CMMS_URL isn't set. */
export function CmmsLink({ href, label, missing }: { href: string | null; label: string; missing: string }) {
  return (
    <div className="login-form__fields">
      {href ? (
        <a className="btn btn--primary" href={href} target="_blank" rel="noopener noreferrer">
          {label}
        </a>
      ) : (
        <p className="login-form__reset">{missing}</p>
      )}
    </div>
  )
}
