/**
 * Brief 115 - verify the 2024/2025 SO import. READ-ONLY (the database session is
 * opened read-only; nothing can be written).
 *
 *   node scripts/verify-so-import-2024-2025.mjs --src <folder-with-the-4-xlsx> [--live]
 *
 * Checks: counts by source file (39/26/94/48 + the stray), by scope letter, by
 * status; zero duplicates; every SO number matches the format; and a spot-check
 * of 10 random SOs against the source cell values. Exit code 0 = all passed.
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createRequire } from 'node:module'
const XLSX = createRequire(import.meta.url)('xlsx')

const TEST_REF = 'srdqnofwhnrojkolwnke', LIVE_REF = 'cepnrkbfhyqqxdqdufja'
const SKIP = new Set(['AD0657-C25C'])
const CANCELLED = new Set(['AD0627-V25T', 'AD0655-V25P', 'AD0444-25T'])
const FILES = [['01- SO VAT 2024 - Staff.xlsx', 'vat', 39], ['02- SO NON VAT 2024 - Staff.xlsx', 'non_vat', 26], ['01- SO VAT 2025 - Staff.xlsx', 'vat', 94], ['02- SO NON VAT 2025 - Staff.xlsx', 'non_vat', 48]]
const FORMAT = /^AD[0-9]{4}-V?[0-9]{2}[TSCPD]$/
const argv = process.argv.slice(2)
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null }
const SRC = opt('--src'); if (!SRC) { console.error('Need --src'); process.exit(1) }
const LIVE = argv.includes('--live'), target = LIVE ? 'LIVE' : 'TEST'
// LIVE: environment variable ADTECH_LIVE_DATABASE_URL (set in your own Terminal, never read from a repo file)
const url = LIVE
  ? (process.env.ADTECH_LIVE_DATABASE_URL || '').trim()
  : (readFileSync('.env.local', 'utf8').match(/^ROLLBACK_TEST_DATABASE_URL=(.*)$/m) || [])[1]?.trim().replace(/^"|"$/g, '')
if (!url) { console.error(LIVE ? 'ADTECH_LIVE_DATABASE_URL is not set in this Terminal.' : 'No ROLLBACK_TEST_DATABASE_URL in .env.local.'); process.exit(1) }
if (!url || !url.includes(LIVE ? LIVE_REF : TEST_REF) || url.includes(LIVE ? TEST_REF : LIVE_REF)) { console.error(`Connection string is not the ${target} project. Refusing.`); process.exit(1) }
const q = (sql) => {
  const r = spawnSync('psql', [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { input: sql, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, PGOPTIONS: '-c default_transaction_read_only=on' } })
  if (r.status !== 0) throw new Error('psql failed: ' + (r.stderr || '').replace(/postgres(ql)?:\/\/\S+/g, '<masked>'))
  return r.stdout.trim()
}
const clean = (v) => { if (v == null) return null; const t = String(v).replace(/​/g, '').replace(/\s+/g, ' ').trim(); return t || null }
const fold = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const iso = (n) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)

const src = []
for (const [file, reg] of FILES) {
  const ws = XLSX.readFile(join(SRC, file)).Sheets[XLSX.readFile(join(SRC, file)).SheetNames[2]]
  XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }).forEach((r, i) => {
    if (i === 0 && clean(r[2]) && /^AD/.test(clean(r[2])) && !clean(r[3])) src.push({ file, reg, so: clean(r[2]), date: iso(r[0]), company: null, project: null, stray: true })
    else if (i >= 8 && clean(r[3])) src.push({ file, reg, so: clean(r[3]), date: iso(r[1]), company: clean(r[7]), project: clean(r[8]), stray: false })
  })
}
const expected = src.filter((r) => !SKIP.has(r.so))
const bySo = new Map(expected.map((r) => [r.so, r]))
const inList = [...bySo.keys()].map((s) => `'${s}'`).join(',')

const db = JSON.parse(q(`select coalesce(json_agg(json_build_object('so', p.so_number, 'reg', r.code, 'scope', p.scope_type, 'status', p.status, 'lifecycle', p.lifecycle, 'stream', p.stream, 'pic', p.pic_id, 'cv', p.contract_value, 'name', p.name, 'opened', to_char(p.opened_at at time zone 'UTC', 'YYYY-MM-DD'), 'client', c.name)), '[]'::json)
  from workflow.projects p join workflow.so_registers r on r.id = p.so_register_id join workflow.clients c on c.id = p.client_id where p.so_number in (${inList})`))
const dupes = JSON.parse(q(`select coalesce(json_agg(so_number), '[]'::json) from (select so_number, so_register_id from workflow.projects where so_number is not null group by 1,2 having count(*) > 1) d`))

let fails = 0
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' - ' + detail : ''}`); if (!ok) fails++ }
console.log(`Verifying ${target}: ${db.length} of ${expected.length} expected SOs are present.\n`)
const present = new Set(db.map((d) => d.so))
for (const [file, , n] of FILES) {
  const exp = expected.filter((r) => r.file === file)
  const got = exp.filter((r) => present.has(r.so)).length
  check(`${file}: present ${got} of ${exp.length} (${n} regular${exp.some((r) => r.stray) ? ' + 1 stray' : ''})`, got === exp.length)
}
check(`total present = ${expected.length}`, db.length === expected.length, `found ${db.length}`)
const letters = {}; db.forEach((d) => (letters[d.scope] = (letters[d.scope] || 0) + 1))
const expLetters = {}; expected.forEach((r) => { const l = r.so.slice(-1); expLetters[l] = (expLetters[l] || 0) + 1 })
check('scope letters match the source', JSON.stringify(Object.entries(letters).sort()) === JSON.stringify(Object.entries(expLetters).sort()), `db ${JSON.stringify(letters)} / source ${JSON.stringify(expLetters)}`)
check('scope_type equals the trailing letter of the SO number, every row', db.every((d) => d.scope === d.so.slice(-1)))
const st = {}; db.forEach((d) => (st[d.lifecycle + '/' + d.status] = (st[d.lifecycle + '/' + d.status] || 0) + 1))
console.log('      status counts:', JSON.stringify(st))
check('cancelled SOs are exactly the 3 decided', db.filter((d) => d.lifecycle === 'cancelled').map((d) => d.so).sort().join() === [...CANCELLED].sort().join())
check('no row is ongoing (everything else finished)', db.every((d) => d.lifecycle === 'cancelled' || d.lifecycle === 'completed_out_of_warranty'))
check('stream = generic on every row', db.every((d) => d.stream === 'generic'))
check('no PIC set, no contract value', db.every((d) => d.pic == null && d.cv == null))
check('zero duplicate (SO number, register) pairs in the table', dupes.length === 0, dupes.join())
check('every SO number matches the table format', db.every((d) => FORMAT.test(d.so)))
check('register matches the file (VAT / non-VAT)', db.every((d) => d.reg === bySo.get(d.so)?.reg))
check('AD0657-C25C was not imported', q(`select count(*) from workflow.projects where so_number = 'AD0657-C25C'`) === '0')

// 10 random spot-checks against the source cells
console.log('\nSpot-check (10 random SOs against the source):')
const pool = db.slice()
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
for (const d of pool.slice(0, 10)) {
  const s = bySo.get(d.so)
  const okName = d.name === (s.project ?? s.so), okDate = d.opened === s.date, okClient = fold(d.client) === fold(s.company ?? '(no company in source)')
  check(`${d.so}`, okName && okDate && okClient, `name ${okName ? 'ok' : `db "${d.name}" vs source "${s.project}"`}; date ${okDate ? 'ok' : `${d.opened} vs ${s.date}`}; client ${okClient ? 'ok' : `"${d.client}" vs "${s.company}"`}`)
}
console.log(`\n${fails === 0 ? 'ALL CHECKS PASSED' : fails + ' CHECK(S) FAILED'}`)
process.exit(fails ? 1 : 0)
