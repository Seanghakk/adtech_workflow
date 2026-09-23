import type { Metadata } from 'next'
import { LanguageToggle } from '@/components/LanguageToggle'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = {
  title: 'Sign in — ADTECH Workflow Tracker',
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = Array.isArray(params.next) ? params.next[0] : params.next

  return (
    <div className="login-screen">
      {/* Brief 090 fix 2 — v7.1 §14.1: the toggle sits above the card,
          right-aligned, matching the card's own width so its right edge
          lines up with the card's. Previously inside LoginForm's own
          header, where it was squeezed to an unusable sliver competing
          with the brand mark for space (Brief 089 §0 urgent 2). */}
      <div className="login-screen__toggle">
        <LanguageToggle />
      </div>
      <LoginForm next={next} />
    </div>
  )
}
