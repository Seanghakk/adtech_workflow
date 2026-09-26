/**
 * Runs a verification file against the stack built to an arbitrary migration,
 * so "does this file survive a PRE-migration run" is answerable before
 * someone pastes it into the production SQL editor.
 *
 * WHY THIS EXISTS. Twice now a verification file has ABORTED instead of
 * printing its PASS/FAIL table, because a check named an object that the
 * migration itself creates: check 34 named a table, and later check 39 named
 * a COLUMN while guarding only the table it lives in. Postgres resolves table
 * names, column names and function names when it PLANS a statement, so a
 * CASE guard never helps — the branch is parsed whether or not it is taken.
 * The only fixes are to_regclass (tables) or to defer the whole statement
 * through query_to_xml, whose string is parsed at execution.
 *
 * A file that errors on the pre-migration run is at its least useful on the
 * exact run that matters most: the one that is supposed to show FAILs and
 * prove the checks are testing something.
 *
 * Usage:
 *   node supabase/tests/_support/run-verify-at.mjs 044 path/to/verify.sql [...]
 *   node supabase/tests/_support/run-verify-at.mjs 049 path/to/verify.sql
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const ROOT = "supabase";
const upto = process.argv[2] || "044";
const files = process.argv.slice(3);
const db = await PGlite.create();
await db.exec(readFileSync(join(ROOT,"tests/_support/preamble.sql"),"utf8"));
for (const m of readdirSync(join(ROOT,"migrations")).filter(f=>/^\d+.*\.sql$/.test(f)).sort()) {
  if (m.split("_")[0] > upto) break;
  await db.exec(readFileSync(join(ROOT,"migrations",m),"utf8"));
}
console.log(`stack built to ${upto}`);
for (const f of files) {
  try {
    const res = await db.exec(readFileSync(f,"utf8"));
    const grid = res.filter(r=>(r.fields??[]).some(x=>x.name==="result"));
    const rows = grid.flatMap(r=>r.rows);
    const fails = rows.filter(r=>r.result!=="PASS").length;
    console.log(`  ✓ ${f.split("/").pop()} PRINTED ITS TABLE — ${rows.length} rows, ${fails} FAIL`);
  } catch(e) {
    console.log(`  ✗ ${f.split("/").pop()} ABORTED: ${e.message.split("\n")[0]}`);
  }
}
await db.close();
