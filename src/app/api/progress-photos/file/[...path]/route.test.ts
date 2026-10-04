import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * ADTECH_WF_Brief_107 Part B — signed out and non-members get nothing; a
 * member who can see the project gets a short-lived signed link. RLS
 * (is_member / can_view_project) is represented by whether the projects
 * read returns the row.
 */
const P = '4c107c15-6ae7-45bb-a792-d5e53c3da1cb'
const state = {
  user: { id: 'u1' } as { id: string } | null,
  member: { memberId: 'm1' } as { memberId: string } | null,
  projectVisible: true,
  signed: [] as { path: string; seconds: number }[],
}
vi.mock('@/lib/auth/current-member', () => ({ getCurrentMember: async () => ({ user: state.user, member: state.member }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = async () => ({ data: state.projectVisible ? { id: P } : null, error: null })
    return { from: () => q }
  },
}))
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: async (path: string, seconds: number) => {
          state.signed.push({ path, seconds })
          return { data: { signedUrl: `https://abc.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t` }, error: null }
        },
      }),
    },
  }),
}))

const { GET, SIGNED_LINK_SECONDS } = await import('./route')
const call = (segments: string[]) => GET(new Request('https://wf.test/x'), { params: Promise.resolve({ path: segments }) })
const PHOTO = ['projects', P, 'sub-stages', 'a.jpg']

beforeEach(() => {
  state.user = { id: 'u1' }
  state.member = { memberId: 'm1' }
  state.projectVisible = true
  state.signed = []
})

describe('GET /api/progress-photos/file/[...path]', () => {
  it('a member who can see the project is redirected to a short-lived signed link', async () => {
    const res = await call(PHOTO)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch(/\/object\/sign\/progress-photos\/projects\/.+\?token=/)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(state.signed).toEqual([{ path: `projects/${P}/sub-stages/a.jpg`, seconds: SIGNED_LINK_SECONDS }])
    expect(SIGNED_LINK_SECONDS).toBeLessThanOrEqual(300)
  })
  it('signed out: 401, nothing signed', async () => {
    state.user = null
    state.member = null
    expect((await call(PHOTO)).status).toBe(401)
    expect(state.signed).toEqual([])
  })
  it('signed in but not a Workflow member: 404, nothing signed', async () => {
    state.member = null
    expect((await call(PHOTO)).status).toBe(404)
    expect(state.signed).toEqual([])
  })
  it('a member who cannot see that project: 404, nothing signed', async () => {
    state.projectVisible = false
    expect((await call(PHOTO)).status).toBe(404)
    expect(state.signed).toEqual([])
  })
  it('a path outside projects/<id>/ or with traversal: 404', async () => {
    for (const bad of [['other', 'a.jpg'], ['projects', P, '..', '..', 'x.jpg'], ['projects', 'nope', 'a.jpg']]) expect((await call(bad)).status).toBe(404)
    expect(state.signed).toEqual([])
  })
})
