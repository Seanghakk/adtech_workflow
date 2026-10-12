import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/proxy', () => ({ updateSession: () => 'session' }))

import { movedTo, newPath, proxy } from './proxy'

// ADTECH_PLATFORM_Brief_013e — the old Workflow's pages forward to the platform.
const NEW = 'https://app.adtech-solutions.net'
const req = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  new NextRequest(`https://old.example${path}`, init)

afterEach(() => vi.unstubAllEnvs())

describe('movedTo', () => {
  it('accepts an https origin only', () => {
    expect(movedTo(NEW)).toBe(NEW)
    expect(movedTo(`${NEW}/`)).toBe(NEW)
    expect(movedTo(undefined)).toBeNull()
    expect(movedTo('')).toBeNull()
    expect(movedTo('http://app.adtech-solutions.net')).toBeNull()
    expect(movedTo(`${NEW}/workflow`)).toBeNull()
    expect(movedTo('not a url')).toBeNull()
  })
})

describe('newPath', () => {
  it('maps old pages to the platform', () => {
    expect(newPath('/')).toBe('/workflow')
    expect(newPath('/f/0b1c')).toBe('/f/0b1c')
    expect(newPath('/login')).toBe('/login')
    expect(newPath('/security/two-step')).toBe('/login')
    expect(newPath('/projects/abc')).toBe('/workflow/projects/abc')
    expect(newPath('/f/0b1c/extra')).toBe('/workflow/f/0b1c/extra')
    expect(newPath('/securityx')).toBe('/workflow/securityx')
  })
})

describe('proxy', () => {
  it('changes nothing while WORKFLOW_MOVED_TO is unset', () => {
    vi.stubEnv('WORKFLOW_MOVED_TO', '')
    expect(proxy(req('/projects/abc'))).toBe('session')
  })

  it('redirects pages with 307, query kept', () => {
    vi.stubEnv('WORKFLOW_MOVED_TO', NEW)
    const r = proxy(req('/projects/abc?tab=matrix')) as unknown as Response
    expect(r.status).toBe(307)
    expect(r.headers.get('location')).toBe(`${NEW}/workflow/projects/abc?tab=matrix`)
    expect((proxy(req('/f/0b1c', { method: 'HEAD' })) as unknown as Response).headers.get('location')).toBe(`${NEW}/f/0b1c`)
  })

  it('never redirects an API call, a POST or a server action', () => {
    vi.stubEnv('WORKFLOW_MOVED_TO', NEW)
    expect(proxy(req('/api/progress-photos/upload', { method: 'POST' }))).toBe('session')
    expect(proxy(req('/api/anything'))).toBe('session')
    expect(proxy(req('/projects/abc', { method: 'POST' }))).toBe('session')
    expect(proxy(req('/projects/abc', { headers: { 'next-action': 'x' } }))).toBe('session')
  })
})
