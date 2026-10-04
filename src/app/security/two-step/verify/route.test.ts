import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * ADTECH_WF_Brief_108 — at the level where the cookie is actually written.
 * The REAL @supabase/ssr + supabase-js run here; only the network (Supabase
 * Auth's HTTP API) is faked. The test reads the Set-Cookie header of the
 * response and checks the session in it is AAL2 — the thing Brief 107's
 * stubbed tests could not see.
 */
const REF = 'abcdefghijklmnopqrst'
vi.mock('@/lib/supabase/env', () => ({
  getSupabaseUrl: () => `https://${REF}.supabase.co`,
  getSupabasePublishableKey: () => 'sb_publishable_test',
}))

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt = (aal: string) => `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: 'u1', aal, exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's1', role: 'authenticated' })}.sig`
const user = { id: 'u1', aud: 'authenticated', email: 'a@b.test', factors: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'phone' }] }
const session = (aal: string, refresh: string) => ({ access_token: jwt(aal), refresh_token: refresh, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user })
const COOKIE = `sb-${REF}-auth-token`
const cookieValue = (s: unknown) => `base64-${Buffer.from(JSON.stringify(s)).toString('base64url')}`

const calls: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? 'GET').toUpperCase()
    calls.push(`${method} ${url.pathname}`)
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.pathname === '/auth/v1/user') return json(user)
    if (url.pathname === '/auth/v1/factors/f1/challenge') return json({ id: 'c1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 })
    if (url.pathname === '/auth/v1/factors/f1/verify') {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return body.code === '123456' ? json(session('aal2', 'r2')) : json({ code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422)
    }
    if (url.pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
    return json({ msg: `unexpected ${url.pathname}` }, 404)
  })
})

const { POST } = await import('./route')
const { POST: SIGN_OUT } = await import('../../sign-out/route')

function post(path: string, fields: Record<string, string>, extraHeaders: Record<string, string> = {}) {
  return new NextRequest(new URL(path, 'https://wf.test'), {
    method: 'POST',
    body: new URLSearchParams(fields),
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: `${COOKIE}=${cookieValue(session('aal1', 'r1'))}`, ...extraHeaders },
  })
}
function sessionCookie(res: Response): { aal: string } | null {
  const set = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`))
  if (!set) return null
  const raw = decodeURIComponent(set.split(';')[0].slice(COOKIE.length + 1)).replace(/^base64-/, '')
  const s = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { access_token: string }
  return JSON.parse(Buffer.from(s.access_token.split('.')[1], 'base64url').toString())
}

describe('POST /security/two-step/verify (real @supabase/ssr)', () => {
  it('the right code: AAL2 session cookie is SET ON THE RESPONSE, and it redirects to where the person was going', async () => {
    const res = await POST(post('/security/two-step/verify', { code: '123 456', next: '/projects/9/update' }))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://wf.test/projects/9/update')
    expect(sessionCookie(res)?.aal).toBe('aal2')
    expect(calls).toContain('POST /auth/v1/factors/f1/verify')
  })
  it('a wrong code: back to the code page with an error, no AAL2 session', async () => {
    const res = await POST(post('/security/two-step/verify', { code: '000000', next: '/users' }))
    expect(res.headers.get('location')).toBe('https://wf.test/security/two-step?next=%2Fusers&error=1')
    expect(sessionCookie(res)?.aal ?? 'none').not.toBe('aal2')
  })
  it('no next: the board; an unsafe next is dropped', async () => {
    expect((await POST(post('/security/two-step/verify', { code: '123456' }))).headers.get('location')).toBe('https://wf.test/')
    expect((await POST(post('/security/two-step/verify', { code: '123456', next: '//evil.com' }))).headers.get('location')).toBe('https://wf.test/')
  })
  it('not six digits never reaches Supabase verify', async () => {
    const res = await POST(post('/security/two-step/verify', { code: 'abc' }))
    expect(res.headers.get('location')).toMatch(/error=1/)
    expect(calls).not.toContain('POST /auth/v1/factors/f1/verify')
  })
  it('a post from another site is refused', async () => {
    expect((await POST(post('/security/two-step/verify', { code: '123456' }, { origin: 'https://evil.test' }))).status).toBe(403)
  })
})

describe('POST /security/sign-out (real @supabase/ssr)', () => {
  it('clears the session cookie on the redirect to /login', async () => {
    const res = await SIGN_OUT(post('/security/sign-out', {}))
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://wf.test/login')
    const cleared = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE}=`))
    expect(cleared).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i)
  })
})
