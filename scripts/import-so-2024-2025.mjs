/**
 * Brief 115 - import the 2024 and 2025 Sales Orders into workflow.projects.
 *
 *   node scripts/import-so-2024-2025.mjs --src <folder-with-the-4-xlsx> [options]
 *
 * MODES (default = DRY RUN: reads the database, writes NOTHING to it,
 * writes a report file only):
 *   --apply      write the rows, in ONE transaction (all or nothing)
 *   --rollback   remove exactly the rows a previous --apply created
 *                (uses the manifest file that --apply wrote)
 *   --live       aim at the production database. Without it the script
 *                always uses the TEST database. Writes to LIVE need
 *                --apply AND --live.
 *   --active <file>  text file, one SO number per line = the ACTIVE list
 *                confirmed by Seanghakk. Without it every SO is imported
 *                as finished (and the report says so).
 *   --report <file>  where to write the report (default ./so-import-report.md)
 *   --manifest <file> manifest path (default ./so-import-manifest.json)
 *
 * The database is reached through the psql command line (no new npm
 * dependency). Connection strings come from .env.local and are never printed.
 * TEST  = ROLLBACK_TEST_DATABASE_URL (must contain project ref srdqnofwhnrojkolwnke)
 * LIVE  = the environment variable ADTECH_LIVE_DATABASE_URL, set in your own Terminal
 *         (must contain project ref cepnrkbfhyqqxdqdufja). It is NOT read from .env.local.
 *
 * Decisions this script follows (Seanghakk, 2 Nov 2026):
 *  - AD0657-C25C is NOT imported (the table's SO-number format check refuses it);
 *    it is listed as "needs correct code".
 *  - stream = 'generic' for every row. PIC is never set. contract_value,
 *    start/end dates stay NULL. No parent projects, no links.
 *  - One client per case-and-whitespace-folded company name. Likely-same pairs
 *    are listed in the report, never merged.
 *  - Scope type = trailing letter of the SO code (it wins over column J).
 *  - Status: cancelled (3 SOs) / ongoing (on the --active list) / otherwise
 *    finished = lifecycle 'completed_out_of_warranty' (a trigger sets status).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const TEST_REF = 'srdqnofwhnrojkolwnke'
const LIVE_REF = 'cepnrkbfhyqqxdqdufja'
const SKIP = new Map([['AD0657-C25C', 'needs correct code (table format check refuses it)']])
const CANCELLED = new Set(['AD0627-V25T', 'AD0655-V25P', 'AD0444-25T'])
const FILES = [
  ['01- SO VAT 2024 - Staff.xlsx', 'vat'],
  ['02- SO NON VAT 2024 - Staff.xlsx', 'non_vat'],
  ['01- SO VAT 2025 - Staff.xlsx', 'vat'],
  ['02- SO NON VAT 2025 - Staff.xlsx', 'non_vat'],
]
const EXPECTED = { '01- SO VAT 2024 - Staff.xlsx': 39, '02- SO NON VAT 2024 - Staff.xlsx': 26, '01- SO VAT 2025 - Staff.xlsx': 94, '02- SO NON VAT 2025 - Staff.xlsx': 48 }
const LETTER_NAME = { T: 'Trading', S: 'Service', C: 'CSTC', P: 'Project', D: 'Design' }
const FORMAT = /^AD[0-9]{4}-V?[0-9]{2}[TSCPD]$/ // same as projects_so_number_format_check

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2)
const flag = (n) => argv.includes(n)
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d }
const APPLY = flag('--apply'), ROLLBACK = flag('--rollback'), LIVE = flag('--live')
const SRC = opt('--src'), ACTIVE_FILE = opt('--active')
const REPORT = opt('--report', './so-import-report.md')
const MANIFEST = opt('--manifest', './so-import-manifest.json')
if (!SRC && !ROLLBACK) die('Need --src <folder holding the four xlsx files>.')
if (APPLY && ROLLBACK) die('Pick one: --apply or --rollback.')

function die(m) { console.error('STOP: ' + m); process.exit(1) }

// ---------------------------------------------------------------- database (psql)
function envValue(name) {
  const txt = readFileSync('.env.local', 'utf8')
  const m = txt.match(new RegExp('^' + name + '=(.*)$', 'm'))
  return m ? m[1].trim().replace(/^"|"$/g, '') : null
}
const target = LIVE ? 'LIVE' : 'TEST'
const url = LIVE ? (process.env.ADTECH_LIVE_DATABASE_URL || '').trim() : envValue('ROLLBACK_TEST_DATABASE_URL')
if (!url) die(LIVE ? 'ADTECH_LIVE_DATABASE_URL is not set in this Terminal. Load it first (see the LIVE steps). The script does not read the LIVE password from any repo file.' : 'No ROLLBACK_TEST_DATABASE_URL in .env.local.')
if (!url.includes(LIVE ? LIVE_REF : TEST_REF)) die(`The ${target} connection string does not point at the ${target} project. Refusing.`)
if (url.includes(LIVE ? TEST_REF : LIVE_REF)) die('Connection string points at the wrong project. Refusing.')
const writing = APPLY || ROLLBACK
if (writing && LIVE) console.error('WARNING: writing to LIVE (--live given).')

function psql(sql, { readonly }) {
  const r = spawnSync('psql', [url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-1', '-f', '-'], {
    input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGOPTIONS: readonly ? '-c default_transaction_read_only=on' : '' },
  })
  if (r.status !== 0) throw new Error('psql failed: ' + (r.stderr || '').replace(/postgres(ql)?:\/\/\S+/g, '<masked>').trim())
  return r.stdout
}
const q = (sql) => psql(sql, { readonly: true }).trim()
const lit = (s) => (s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'")
const fold = (s) => String(s ?? '').replace(/[​\s]+/g, ' ').trim().toLowerCase()
const clean = (v) => { if (v == null) return null; const t = String(v).replace(/​/g, '').replace(/\s+/g, ' ').trim(); return t || null }

// ---------------------------------------------------------------- apply guard
if (APPLY && existsSync(MANIFEST)) {
  die(`The manifest file ${MANIFEST} already exists, which means an import was already applied with this file name. Applying again would overwrite it and you could no longer roll back exactly. Nothing was written. If you really mean to apply again, move or rename the old manifest first (keep it safe), or pass a different --manifest name.`)
}

// ---------------------------------------------------------------- rollback
if (ROLLBACK) {
  if (!existsSync(MANIFEST)) die('No manifest file; cannot roll back exactly. (Looked for ' + MANIFEST + ')')
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'))
  if (m.target !== target) die(`Manifest was written for ${m.target}, but this run targets ${target}.`)
  const pairs = m.createdSoRegisters.map(([n, rc]) => `(${lit(n)}, ${lit(rc)})`).join(',')
  const cls = m.createdClientIds.map((c) => `${lit(c)}::uuid`).join(',')
  const sql = `begin;
delete from workflow.projects p using workflow.so_registers r
  where p.so_register_id = r.id and (p.so_number, r.code) in (values ${pairs || "(null, null)"});
delete from workflow.clients c where c.id in (${cls || 'null::uuid'})
  and not exists (select 1 from workflow.projects p where p.client_id = c.id);
commit;`
  console.log(`ROLLBACK on ${target}: ${m.createdSoNumbers.length} SOs, ${m.createdClientIds.length} clients from manifest of ${m.when}`)
  psql(sql, { readonly: false })
  console.log('Rolled back.')
  process.exit(0)
}

// ---------------------------------------------------------------- read the spreadsheets
const serialToIso = (n) => new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10)
const rows = []
for (const [file, reg] of FILES) {
  const wb = XLSX.readFile(join(SRC, file))
  const ws = wb.Sheets[wb.SheetNames[2]] // the THIRD sheet
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  data.forEach((r, i) => {
    const rowNo = i + 1
    if (rowNo === 1 && clean(r[2]) && /^AD/.test(clean(r[2])) && !clean(r[3])) {
      // stray line: date in A, month in B, SO code in C (AD0408-24C)
      rows.push({ file, reg, rowNo, so: clean(r[2]), date: typeof r[0] === 'number' ? serialToIso(r[0]) : null, company: null, project: null, ptype: clean(r[9]), po: null, mgr: null, detail: null, warranty: null, addr: null, city: null, stray: true })
      return
    }
    if (rowNo < 9 || !clean(r[3])) return
    rows.push({ file, reg, rowNo, so: clean(r[3]), date: typeof r[1] === 'number' ? serialToIso(r[1]) : null, company: clean(r[7]), project: clean(r[8]), ptype: clean(r[9]), po: clean(r[10]), mgr: clean(r[11]), detail: clean(r[12]), warranty: clean(r[13]), addr: clean(r[14]), city: clean(r[15]), stray: false })
  })
}

// ---------------------------------------------------------------- checks on the source
const problems = []
const perFile = {}
for (const r of rows) perFile[r.file] = (perFile[r.file] || 0) + (r.stray ? 0 : 1)
for (const [f, n] of Object.entries(EXPECTED)) if (perFile[f] !== n) problems.push(`File ${f}: expected ${n} SOs (not counting the stray line), found ${perFile[f]}`)
const seen = new Map()
for (const r of rows) { if (seen.has(r.so)) problems.push(`Duplicate SO number ${r.so}`); seen.set(r.so, 1) }
const skipped = rows.filter((r) => SKIP.has(r.so))
const toImport = rows.filter((r) => !SKIP.has(r.so))
for (const r of toImport) if (!FORMAT.test(r.so)) problems.push(`${r.so} does not match the table's SO format and is not on the skip list`)
for (const r of toImport) if (!r.date) problems.push(`${r.so} has no date`)
for (const r of toImport) if (r.reg === 'vat' && !/-V\d{2}[TSCPD]$/.test(r.so)) problems.push(`${r.so} is in a VAT file but has no V`)
for (const r of toImport) if (r.reg === 'non_vat' && /-V\d{2}[TSCPD]$/.test(r.so)) problems.push(`${r.so} is in a NON-VAT file but has a V`)

// ---------------------------------------------------------------- live schema facts (read-only)
const registers = JSON.parse(q(`select coalesce(json_object_agg(code, id), '{}'::json) from workflow.so_registers`))
const scopes = JSON.parse(q(`select coalesce(json_agg(code), '[]'::json) from workflow.scope_types where is_active`))
const clients = JSON.parse(q(`select coalesce(json_agg(json_build_object('id', id, 'name', name)), '[]'::json) from workflow.clients`))
const existing = JSON.parse(q(`select coalesce(json_agg(so_number), '[]'::json) from workflow.projects where so_number is not null`))
for (const c of ['vat', 'non_vat']) if (!registers[c]) problems.push(`SO register '${c}' does not exist in ${target}; not guessing`)
for (const r of toImport) if (!scopes.includes(r.so.slice(-1))) problems.push(`${r.so}: scope letter ${r.so.slice(-1)} not in scope_types`)

// ---------------------------------------------------------------- active list
let active = new Set()
let activeNote = 'No --active file given: EVERY SO is imported as FINISHED (except the 3 cancelled).'
if (ACTIVE_FILE) {
  active = new Set(readFileSync(ACTIVE_FILE, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean))
  const unknown = [...active].filter((s) => !toImport.some((r) => r.so === s))
  if (unknown.length) problems.push('Active list holds SO numbers not in the import: ' + unknown.join(', '))
  activeNote = `Active list: ${active.size} SO numbers from ${ACTIVE_FILE}.`
}
const stateOf = (r) => (CANCELLED.has(r.so) ? 'cancelled' : active.has(r.so) ? 'ongoing' : 'completed_out_of_warranty')

// ---------------------------------------------------------------- clients (one per folded name)
const UNKNOWN_CLIENT = '(no company in source)'
const clientName = (r) => r.company ?? UNKNOWN_CLIENT
const existingByFold = new Map(clients.map((c) => [fold(c.name), c]))
const wantedByFold = new Map()
for (const r of toImport) { const k = fold(clientName(r)); if (!wantedByFold.has(k)) wantedByFold.set(k, clientName(r)) }
const newClients = [...wantedByFold].filter(([k]) => !existingByFold.has(k)).map(([, n]) => n)
const reusedClients = [...wantedByFold].filter(([k]) => existingByFold.has(k)).map(([, n]) => n)

// near-duplicate company names (listed, never merged)
const squash = (s) => fold(s).replace(/[^a-z0-9 ]/g, '').replace(/\b(co|ltd|plc|company|limited|corporation|corp)\b/g, '').replace(/\s+/g, ' ').trim()
const bigrams = (s) => { const t = s.replace(/ /g, ''); const m = new Map(); for (let i = 0; i < t.length - 1; i++) m.set(t.slice(i, i + 2), (m.get(t.slice(i, i + 2)) || 0) + 1); return m }
const dice = (a, b) => { const x = bigrams(a), y = bigrams(b); let inter = 0, tx = 0, ty = 0; for (const [k, v] of x) { tx += v; inter += Math.min(v, y.get(k) || 0) } for (const v of y.values()) ty += v; return tx + ty ? (2 * inter) / (tx + ty) : 0 }
const names = [...wantedByFold.values()]
const nearPairs = []
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = squash(names[i]), b = squash(names[j])
  if (!a || !b) continue
  const sc = dice(a, b)
  if (sc >= 0.82 || (a === b) || (a.length >= 6 && b.includes(a)) || (b.length >= 6 && a.includes(b))) nearPairs.push([names[i], names[j], sc.toFixed(2)])
}

// ---------------------------------------------------------------- report numbers
const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m }, {})
const already = toImport.filter((r) => existing.includes(r.so))
const fresh = toImport.filter((r) => !existing.includes(r.so))
const conflicts = rows.filter((r) => !r.stray && (r.ptype || '').toLowerCase() !== LETTER_NAME[r.so.slice(-1)].toLowerCase())
const noName = toImport.filter((r) => !r.project)
const mgrs = count(rows, (r) => r.mgr ?? '(blank)')
const nohome = ['po', 'detail', 'warranty', 'addr', 'city', 'mgr'].map((f) => `${f}: ${toImport.filter((r) => r[f]).length} rows have a value that has no column to go in`)

let md = `# Brief 115 - SO import ${APPLY ? 'APPLY' : 'DRY RUN'} report (${target})\n\n`
md += `Target database: **${target}**. Mode: **${APPLY ? 'APPLY (writes)' : 'DRY RUN (database untouched)'}**.\n\n`
md += `## Source\n- Rows read: ${rows.length} (${rows.filter((r) => r.stray).length} stray line + ${rows.length - rows.filter((r) => r.stray).length} regular). Brief expected 207 regular+stray minus skip = ${rows.length - skipped.length} to import.\n`
for (const [f] of FILES) md += `- ${f}: ${perFile[f]} SOs${rows.some((r) => r.file === f && r.stray) ? ' (+1 stray line)' : ''}\n`
md += `- To import: **${toImport.length}**. Skipped: ${skipped.map((r) => `${r.so} - ${SKIP.get(r.so)}`).join('; ') || 'none'}.\n`
md += `- By register: ${JSON.stringify(count(toImport, (r) => r.reg))}. By scope letter: ${JSON.stringify(count(toImport, (r) => r.so.slice(-1)))}.\n`
md += `- ${activeNote}\n- Planned status: ${JSON.stringify(count(toImport, stateOf))}.\n- Cancelled: ${[...CANCELLED].join(', ')}.\n\n`
md += `## Against ${target} now\n- Already present (skipped, not duplicated): ${already.length}${already.length ? ' - ' + already.map((r) => r.so).join(', ') : ''}\n- New rows to insert: ${fresh.length}\n- Clients: ${newClients.length} to create, ${reusedClients.length} already exist (matched by case/space-folded name).\n\n`
md += `## Problems (script stops an --apply if any)\n${problems.length ? problems.map((p) => '- ' + p).join('\n') : '- none'}\n\n`
md += `## Scope letter vs column J (letter wins) - ${conflicts.length} rows\n` + conflicts.map((r) => `- ${r.so}: letter says ${LETTER_NAME[r.so.slice(-1)]}, column J says ${r.ptype ?? '(blank)'}${SKIP.has(r.so) ? ' [not imported]' : ''}`).join('\n') + '\n\n'
md += `## Rows with no project name (name set to the SO code)\n${noName.map((r) => '- ' + r.so).join('\n') || '- none'}\n\n`
md += `## Rows with no company (client "${UNKNOWN_CLIENT}")\n${toImport.filter((r) => !r.company).map((r) => '- ' + r.so).join('\n') || '- none'}\n\n`
md += `## Likely-same company names - NOT merged, for Seanghakk (${nearPairs.length})\n${nearPairs.map(([a, b, s]) => `- "${a}"  ~  "${b}"  (${s})`).join('\n') || '- none'}\n\n`
md += `## Project/Section Manager names (not used; PIC stays empty)\n${Object.entries(mgrs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`).join('\n')}\n\n`
md += `## No home in the schema (not imported; no columns added)\n${nohome.map((s) => '- ' + s).join('\n')}\n- Currency: no column.\n\n`
writeFileSync(REPORT, md)
console.log(md.split('\n').slice(0, 14).join('\n'))
console.log(`\nFull report: ${REPORT}`)

if (!APPLY) { console.log(`\nDRY RUN finished. Nothing was written to ${target}.`); process.exit(problems.length ? 2 : 0) }
if (problems.length) die('Problems found; refusing to apply. See the report.')

// ---------------------------------------------------------------- apply: ONE transaction
const foldSql = (col) => `lower(regexp_replace(btrim(${col}), '\\s+', ' ', 'g'))`
let sql = 'begin;\n'
const clientBefore = new Set(clients.map((c) => c.id))
for (const n of newClients) sql += `insert into workflow.clients (name) select ${lit(n)} where not exists (select 1 from workflow.clients where ${foldSql('name')} = ${lit(fold(n))});\n`
for (const r of fresh) {
  const st = stateOf(r)
  const name = r.project ?? r.so
  sql += `insert into workflow.projects (client_id, name, scope_type, stream, so_number, so_assigned_at, so_register_id, status, lifecycle, opened_at)
select (select id from workflow.clients where ${foldSql('name')} = ${lit(fold(clientName(r)))} order by created_at limit 1), ${lit(name)}, ${lit(r.so.slice(-1))}, 'generic', ${lit(r.so)}, ${lit(r.date + 'T00:00:00Z')}, (select id from workflow.so_registers where code = ${lit(r.reg)}), ${st === 'cancelled' ? "'cancelled'" : st === 'ongoing' ? "'open'" : "'closed'"}, ${lit(st)}, ${lit(r.date + 'T00:00:00Z')}
on conflict (org_id, so_number, so_register_id) where so_number is not null do nothing;\n`
}
sql += 'commit;\n'
console.log(`\nAPPLY on ${target}: ${fresh.length} projects, ${newClients.length} new clients ...`)
psql(sql, { readonly: false })
const after = JSON.parse(q(`select coalesce(json_agg(json_build_object('id', id, 'name', name)), '[]'::json) from workflow.clients`))
const createdClientIds = after.filter((c) => !clientBefore.has(c.id)).map((c) => c.id)
writeFileSync(MANIFEST, JSON.stringify({
  when: new Date().toISOString(), target,
  createdSoNumbers: fresh.map((r) => r.so),
  createdSoRegisters: fresh.map((r) => [r.so, r.reg]),
  createdClientIds,
}, null, 1))
console.log(`Done. Manifest written to ${MANIFEST} (needed for --rollback).`)
