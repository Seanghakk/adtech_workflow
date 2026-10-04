import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ADTECH_WF_Brief_107 Part A — second layer: every layout and every server
 * action that calls getCurrentMember() refuses a session that owes the
 * code / must change its password, even if the proxy were skipped.
 */
const state = { aal: { currentLevel: 'aal1', nextLevel: 'aal1' }, mustChange: false }
const chain = (data: unknown) => {
  const q: Record<string, unknown> = {}
  for (const k of ['select', 'eq']) q[k] = () => q
  q.maybeSingle = async () => ({ data, error: null })
  return q
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1', email: 'a@b.test' } } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: state.aal }) },
    },
    schema: () => ({ from: () => chain({ role: 'planner', must_change_password: state.mustChange, full_name: 'X', username: 'x' }) }),
    from: () => chain({ id: 'm1', role: 'member', is_superadmin: false, team_id: 't1', teams: { code: 'qs', label_en: 'QS' } }),
  }),
}))
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => ({ schema: () => ({ from: () => chain({ mfa_enforced: true }) }) }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

const { getCurrentMember } = await import('./current-member')

beforeEach(() => {
  state.aal = { currentLevel: 'aal1', nextLevel: 'aal1' }
  state.mustChange = false
})

describe('getCurrentMember security check', () => {
  it('owes the code → redirected, no member returned', async () => {
    state.aal = { currentLevel: 'aal1', nextLevel: 'aal2' }
    await expect(getCurrentMember()).rejects.toThrow('REDIRECT:/security/two-step')
  })
  it('must change password → redirected', async () => {
    state.mustChange = true
    await expect(getCurrentMember()).rejects.toThrow('REDIRECT:/security/change-password')
  })
  it('a clean session gets its member as before', async () => {
    const r = await getCurrentMember()
    expect(r.member?.memberId).toBe('m1')
  })
})
