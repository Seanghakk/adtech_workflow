import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in — ADTECH Workflow Tracker',
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = Array.isArray(params.next) ? params.next[0] : params.next

  return (
    <div className="login-screen">
      <LoginForm next={next} />
    </div>
  )
}
