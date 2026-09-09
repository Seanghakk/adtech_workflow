import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in — ADTECH Workflow Tracker',
}

export default function LoginPage() {
  return (
    <div className="login-screen">
      <div className="brand-box" aria-hidden="true">
        <div className="brand-box__name">ADTECH</div>
        <div className="brand-box__kicker">Workflow Tracker</div>
      </div>
      <LoginForm />
    </div>
  )
}
