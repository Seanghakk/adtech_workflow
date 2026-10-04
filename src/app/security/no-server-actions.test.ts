import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ADTECH_WF_Brief_108 guard. The security pages are shown while the
 * browser's URL may still be a GATED page (the proxy's redirect happens
 * during a client navigation), and a Server Action posts to the browser's
 * URL — which the proxy refuses. So nothing under src/app/security may use
 * a Server Action: every form posts to a fixed /security/… address.
 */
const DIR = __dirname
const files = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? files(join(d, n)) : /\.tsx?$/.test(n) && !n.endsWith('.test.ts') ? [join(d, n)] : []))

describe('security pages', () => {
  it("no 'use server' and no Server Action imported into a form", () => {
    for (const f of files(DIR)) {
      const src = readFileSync(f, 'utf8')
      expect(src, f).not.toMatch(/['"]use server['"]/)
      expect(src, f).not.toMatch(/from ['"]@\/app\/\(app\)\/actions['"]/)
      expect(src, f).not.toMatch(/<form[^>]*action=\{/)
    }
  })
  it('every form posts to a fixed /security/ address', () => {
    const forms = files(DIR).flatMap((f) => readFileSync(f, 'utf8').match(/<form[^>]*>/g) ?? [])
    expect(forms.length).toBeGreaterThanOrEqual(2)
    for (const form of forms) expect(form).toMatch(/method="post" action="\/security\//)
  })
})
