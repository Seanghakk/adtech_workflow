import { describe, expect, it } from 'vitest'
import { photoProjectId, photoStoragePath, photoViewUrl } from './photo-link'

/** ADTECH_WF_Brief_107 Part B — the stored links stay as they are; the path is derived at read time. */
const P = '4c107c15-6ae7-45bb-a792-d5e53c3da1cb'
const stored = `https://abc.supabase.co/storage/v1/object/public/progress-photos/projects/${P}/sub-stages/1789909662277_d60zbmple4i.jpg`

describe('photo links', () => {
  it('a stored public link becomes the protected route, with the same Storage path', () => {
    expect(photoStoragePath(stored)).toBe(`projects/${P}/sub-stages/1789909662277_d60zbmple4i.jpg`)
    expect(photoViewUrl(stored)).toBe(`/api/progress-photos/file/projects/${P}/sub-stages/1789909662277_d60zbmple4i.jpg`)
    expect(photoProjectId(photoStoragePath(stored) as string)).toBe(P)
  })
  it('a signed-form link and a bare path work too', () => {
    expect(photoStoragePath(`https://abc.supabase.co/storage/v1/object/sign/progress-photos/projects/${P}/a.jpg?token=x`)).toBe(`projects/${P}/a.jpg`)
    expect(photoStoragePath(`projects/${P}/a.jpg`)).toBe(`projects/${P}/a.jpg`)
  })
  it('anything else is refused: other buckets, other folders, traversal, empty', () => {
    for (const bad of [
      null,
      '',
      `https://abc.supabase.co/storage/v1/object/public/wo-photos/projects/${P}/a.jpg`,
      `https://abc.supabase.co/storage/v1/object/public/progress-photos/other/${P}/a.jpg`,
      `projects/${P}/../../x.jpg`,
      `projects/not-a-uuid/a.jpg`,
      'https://evil.test/progress-photos/projects/x.jpg',
    ]) expect(photoStoragePath(bad), String(bad)).toBeNull()
    expect(photoViewUrl(null)).toBeNull()
  })
})
