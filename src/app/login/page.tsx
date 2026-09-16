import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in — ADTECH Workflow Tracker',
}

export default function LoginPage() {
  return (
    <div className="login-screen">
      <LoginForm />
    </div>
  )
}
