import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { NextRequest } from 'next/server'

/**
 * ADTECH_WF_Brief_107 Part A — the proxy applies the CMMS's second step and
 * forced password change to EVERY page (each page route in src/app,
 * discovered from the folder), every server action and every API route.
 * Supabase is faked; the session facts are what each test sets.
 */
const state = {
  user: null as { id: string } | null,
  aal: { currentLevel: 'aal1', nextLevel: 'aal1' } as { currentLevel: string; nextLevel: string },
  profile: { role: 'technician', must_change_password: false } as { role: string; must_change_password: boolean } | null,
  profileError: null as { message: string } | null,
  enforced: true,
}

function fakeClient() {
  const profileQuery = { select: () => profileQuery, eq: () => profileQuery, maybeSingle: async () => ({ data: state.profile, error: state.profileError }) }
  const settingsQuery = { select: () => settingsQuery, eq: () => settingsQuery, maybeSingle: async () => ({ data: { mfa_enforced: state.enforced }, error: null }) }
  return {
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal, error: null }) },
    },
    schema: () => ({ from: (t: string) => (t === 'security_settings' ? settingsQuery : profileQuery) }),
  }
}
vi.mock('./env', () => ({ getSupabaseUrl: () => 'https://x.supabase.co', getSupabasePublishableKey: () => 'pk', getSupabaseSecretKey: () => 'sk' }))
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => fakeClient() }))

const { updateSession } = await import('./proxy')
const { forgetMfaEnforcedCache } = await import('@/lib/auth/session-facts')

const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(new URL(path, 'https://wf.test'), { method: init.method ?? 'GET', headers: init.headers })

/** Every page route in src/app, with a sample value in each dynamic segment. */
function pageRoutes(): string[] {
  const root = join(__dirname, '..', '..', 'app')
  const out: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name === 'page.tsx') {
        const segs = relative(root, dir).split(sep).filter(Boolean).filter((s) => !/^\(.*\)$/.test(s))
        out.push('/' + segs.map((s) => (s.startsWith('[') ? '00000000-0000-0000-0000-000000000001' : s)).join('/'))
      }
    }
  }
  walk(root)
  return out.map((p) => p.replace(/\/$/, '') || '/')
}
const GATED = pageRoutes().filter((p) => p !== '/login' && !p.startsWith('/security'))

beforeEach(() => {
  forgetMfaEnforcedCache()
  state.user = { id: 'u1' }
  state.aal = { currentLevel: 'aal1', nextLevel: 'aal1' }
  state.profile = { role: 'technician', must_change_password: false }
  state.profileError = null
  state.enforced = true
})

describe('two-step owed (authenticator set up, signed in with the password only)', () => {
  beforeEach(() => {
    state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
  })
  it(`every page route (${GATED.length} found) is sent to the code page, carrying where it was going`, async () => {
    expect(GATED.length).toBeGreaterThan(30)
    for (const path of GATED) {
      const res = await updateSession(req(path))
      expect(res.status, path).toBe(307)
      expect(res.headers.get('location'), path).toBe(`https://wf.test/security/two-step?next=${encodeURIComponent(path)}`)
    }
  })
  it('a server action (next-action header) and an API route are refused outright, never run', async () => {
    const action = await updateSession(req('/projects/1/update', { method: 'POST', headers: { 'next-action': 'abc123' } }))
    expect(action.status).toBe(403)
    expect(await action.json()).toEqual({ error: 'verify' })
    const api = await updateSession(req('/api/progress-photos/upload', { method: 'POST' }))
    expect(api.status).toBe(403)
  })
  it('the code page itself and sign-out stay reachable', async () => {
    expect((await updateSession(req('/security/two-step'))).status).toBe(200)
    expect((await updateSession(req('/security/two-step', { method: 'POST', headers: { 'next-action': 'x' } }))).status).toBe(200)
  })
  it('after the code (aal2) everything is reachable', async () => {
    state.aal = { currentLevel: 'aal2', nextLevel: 'aal2' }
    for (const path of GATED) expect((await updateSession(req(path))).status, path).toBe(200)
  })
})

describe('forced password change and required set-up', () => {
  it('must_change_password blocks every page and action until changed', async () => {
    state.profile = { role: 'technician', must_change_password: true }
    for (const path of GATED) expect((await updateSession(req(path))).headers.get('location'), path).toMatch(/\/security\/change-password/)
    expect((await updateSession(req('/', { method: 'POST', headers: { 'next-action': 'x' } }))).status).toBe(403)
    state.profile = { role: 'technician', must_change_password: false }
    expect((await updateSession(req('/'))).status).toBe(200)
  })
  it('a supervisor with no authenticator while the CMMS switch is on is sent to set one up', async () => {
    state.profile = { role: 'supervisor', must_change_password: false }
    expect((await updateSession(req('/users'))).headers.get('location')).toBe('https://wf.test/security/set-up-two-step?next=%2Fusers')
    forgetMfaEnforcedCache()
    state.enforced = false
    expect((await updateSession(req('/users'))).status).toBe(200)
  })
  it('an unreadable profile fails closed', async () => {
    state.profileError = { message: 'boom' }
    expect((await updateSession(req('/'))).status).toBe(503)
    expect((await updateSession(req('/api/progress-photos/upload', { method: 'POST' }))).status).toBe(503)
  })
})

describe('unchanged behaviour', () => {
  it('an account without two-step, where none is required, is unaffected', async () => {
    for (const path of GATED) expect((await updateSession(req(path))).status, path).toBe(200)
  })
  it('signed out: every page still goes to /login?next=…, /login stays open', async () => {
    state.user = null
    const res = await updateSession(req('/projects/1'))
    expect(res.headers.get('location')).toBe('https://wf.test/login?next=%2Fprojects%2F1')
    expect((await updateSession(req('/login'))).status).toBe(200)
    expect((await updateSession(req('/security/two-step'))).headers.get('location')).toMatch(/\/login\?next=/)
  })
})
