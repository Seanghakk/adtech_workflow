import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ADTECH_WF_Brief_107 Part A — the code step: the right code raises the
 * session (Supabase challenge + verify) and the person lands where they
 * were going; a wrong code doesn't. Supabase is faked.
 */
const calls: { factorId: string; code: string }[] = []
let verifyError: { message: string } | null = null
let factors: { id: string; status: string }[] = [{ id: 'f1', status: 'verified' }]

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
      mfa: {
        listFactors: async () => ({ data: { totp: factors } }),
        challengeAndVerify: async (a: { factorId: string; code: string }) => {
          calls.push(a)
          return { error: verifyError }
        },
      },
    },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`)
  },
}))

const { verifyTwoStep } = await import('./actions')
const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}

beforeEach(() => {
  calls.length = 0
  verifyError = null
  factors = [{ id: 'f1', status: 'verified' }]
})

describe('verifyTwoStep', () => {
  it('the right code raises the session and goes on to where the person was going', async () => {
    await expect(verifyTwoStep({ error: false }, form({ code: '123 456', next: '/projects/9/update' }))).rejects.toThrow('REDIRECT:/projects/9/update')
    expect(calls).toEqual([{ factorId: 'f1', code: '123456' }])
  })
  it('a wrong code is refused and the person stays on the page', async () => {
    verifyError = { message: 'Invalid TOTP code entered' }
    await expect(verifyTwoStep({ error: false }, form({ code: '000000' }))).resolves.toEqual({ error: true })
  })
  it('anything that is not six digits never reaches Supabase', async () => {
    await expect(verifyTwoStep({ error: false }, form({ code: '12ab' }))).resolves.toEqual({ error: true })
    expect(calls).toEqual([])
  })
  it('an unsafe next is replaced by the board', async () => {
    await expect(verifyTwoStep({ error: false }, form({ code: '123456', next: '//evil.com' }))).rejects.toThrow('REDIRECT:/')
  })
})
