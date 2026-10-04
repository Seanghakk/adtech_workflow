import { describe, expect, it } from 'vitest'
import { isSecurityOpenPath, mfaRequiredFor, safeNextPath, securityGate, securityRedirectPath, type SessionFacts } from './security-gate'

/** ADTECH_WF_Brief_107 Part A — the decision, mirroring the CMMS's mfaGateDecision. */
const facts = (o: Partial<SessionFacts> = {}): SessionFacts => ({
  aal: { currentLevel: 'aal1', nextLevel: 'aal1' },
  cmmsRole: 'technician',
  mustChangePassword: false,
  enforced: true,
  ...o,
})
const ONE_STEP_WITH_FACTOR = { currentLevel: 'aal1', nextLevel: 'aal2' }
const TWO_STEP_DONE = { currentLevel: 'aal2', nextLevel: 'aal2' }

describe('securityGate', () => {
  it('a verified authenticator at aal1 must enter the code — for every role', () => {
    for (const role of ['admin', 'supervisor', 'planner', 'technician', null]) {
      expect(securityGate(facts({ aal: ONE_STEP_WITH_FACTOR, cmmsRole: role }))).toEqual({ kind: 'verify' })
    }
  })
  it('after the code (aal2) the person is through', () => {
    expect(securityGate(facts({ aal: TWO_STEP_DONE, cmmsRole: 'admin' }))).toEqual({ kind: 'allow' })
  })
  it("a role the CMMS requires two-step for, with none set up, is sent to set it up — only while the CMMS switch is on", () => {
    expect(securityGate(facts({ cmmsRole: 'supervisor' }))).toEqual({ kind: 'enrol' })
    expect(securityGate(facts({ cmmsRole: 'admin' }))).toEqual({ kind: 'enrol' })
    expect(securityGate(facts({ cmmsRole: 'supervisor', enforced: false }))).toEqual({ kind: 'allow' })
    expect(mfaRequiredFor('client', false)).toBe(true) // the CMMS's always-required role
  })
  it('a pending password change blocks everything; the code step still comes first', () => {
    expect(securityGate(facts({ mustChangePassword: true }))).toEqual({ kind: 'change_password' })
    expect(securityGate(facts({ mustChangePassword: true, aal: ONE_STEP_WITH_FACTOR }))).toEqual({ kind: 'verify' })
    expect(securityGate(facts({ mustChangePassword: true, aal: TWO_STEP_DONE }))).toEqual({ kind: 'change_password' })
  })
  it('an account without two-step, where none is required, is unaffected', () => {
    for (const role of ['technician', 'tnc_engineer', 'tnc_leader', 'planner']) expect(securityGate(facts({ cmmsRole: role }))).toEqual({ kind: 'allow' })
  })
})

describe('paths', () => {
  it('only the sign-in page, the security pages and Next assets stay open', () => {
    for (const p of ['/login', '/security/two-step', '/security/change-password', '/_next/static/x.js']) expect(isSecurityOpenPath(p)).toBe(true)
    for (const p of ['/', '/users', '/securityx', '/api/progress-photos/upload', '/projects/1/update']) expect(isSecurityOpenPath(p)).toBe(false)
  })
  it('next is carried only as a same-origin path, never back to a security page', () => {
    expect(safeNextPath('/projects/1?x=2')).toBe('/projects/1?x=2')
    for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '/security/two-step', 5]) expect(safeNextPath(bad)).toBeNull()
    expect(securityRedirectPath({ kind: 'verify' }, '/projects/1')).toBe('/security/two-step?next=%2Fprojects%2F1')
    expect(securityRedirectPath({ kind: 'change_password' }, '//evil.com')).toBe('/security/change-password')
  })
})
