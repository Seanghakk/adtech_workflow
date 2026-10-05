import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ADTECH_PLATFORM_Brief_007 (Phase 1) — the Workflow never writes a web
 * address into code: its own comes from NEXT_PUBLIC_APP_URL (floor QR codes,
 * Telegram links) and the CMMS's from NEXT_PUBLIC_CMMS_URL (two-step and
 * password pages). This fails if a hosting address (vercel.app) or the
 * company domain is ever hardcoded in src/ or public/, so moving either app
 * to a new domain stays a settings change. Tests themselves are not scanned.
 */
const ROOTS = [join(__dirname, '..'), join(__dirname, '..', '..', 'public')]
const PATTERNS = [/vercel\.app/i, /adtech-(cmms|workflow)\.vercel/i, /adtech-solutions/i]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|mjs|json|webmanifest)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

describe('no hardcoded web address', () => {
  it('src/ and public/ read addresses from configuration only', () => {
    const offenders = ROOTS.flatMap((r) => walk(r)).flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .map((line, i) => (PATTERNS.some((p) => p.test(line)) ? `${f}:${i + 1}  ${line.trim()}` : null))
        .filter((x): x is string => x !== null),
    )
    expect(offenders).toEqual([])
  })
})
