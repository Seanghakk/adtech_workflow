/**
 * Actually EXECUTES a supabase/rollback/<NNN>_*.sql file against pglite.
 *
 * Ported from adtech-cmms (its Brief 033 built this first, after the Sep 07
 * gap). THIS REPO HAD NO RUNNER AT ALL — supabase/rollback/ holds files for
 * migrations 001–028 and every one of them has been written and reviewed and
 * NEVER RUN. A rollback nobody has executed is a rollback nobody knows works.
 *
 * Usage:
 *   node supabase/tests/_support/run-rollback.mjs <migration-number>
 *   node supabase/tests/_support/run-rollback.mjs 045
 *
 * For migration NNN:
 *   1. preamble.sql -> migrations 001..NNN in order — the exact stack a
 *      production SQL editor would hold right after NNN was pasted in.
 *   2. Applies supabase/rollback/<NNN>_*.sql.
 *   3. Runs supabase/tests/rollback/<NNN>_*_rollback_check.sql and parses its
 *      verdict grid: columns `label` and `result`, result = 'PASS'.
 *
 * TWO DIFFERENCES FROM THE CMMS ORIGINAL, both deliberate:
 *
 *   A. A MISSING CHECK FILE IS A FAILURE HERE, not a warning. The CMMS runner
 *      exits 0 and says the effect was not verified. The instruction for this
 *      work was to assert post-rollback state rather than that the script
 *      ran, so "it did not throw" does not earn a zero exit.
 *
 *   B. IT INSPECTS THE ROLLBACK FOR ITS OWN TRANSACTION CONTROL, and says so.
 *      A file that carries `begin; … commit;` cannot be isolated by a caller
 *      that wraps it — the inner COMMIT ends the OUTER transaction, and
 *      everything after it lands unprotected. That is not hypothetical: it
 *      happened during this brief. A test harness that wrapped a migration in
 *      a transaction and trusted a trailing ROLLBACK reported success while
 *      the database had already been changed and committed.
 *
 *      So this runner NEVER wraps. Each rollback owns its transaction, the
 *      runner states what it found, and a file that commits more than once —
 *      i.e. has a commit that is not its last statement — is reported as a
 *      hazard, because a later failure in such a file leaves the earlier part
 *      committed and the database half-rolled-back.
 *
 * Exit code 0 only when the rollback ran AND a check file exists AND every
 * one of its assertions passed.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const TESTS = join(HERE, "..");
const ROOT = join(HERE, "..", "..");
const MIGRATIONS = join(ROOT, "migrations");
const ROLLBACKS = join(ROOT, "rollback");
const ROLLBACK_CHECKS = join(TESTS, "rollback");
const PREAMBLE = readFileSync(join(HERE, "preamble.sql"), "utf8");

const n = process.argv[2];
if (!n || !/^\d+$/.test(n)) {
  console.error("Usage: node supabase/tests/_support/run-rollback.mjs <migration-number>, e.g. 045");
  process.exit(2);
}
const padded = n.padStart(3, "0");

const allMigrations = readdirSync(MIGRATIONS)
  .filter((f) => /^\d+.*\.sql$/.test(f))
  .sort();
const upToTarget = allMigrations.filter((f) => f.split("_")[0] <= padded);
const targetMigration = allMigrations.find((f) => f.startsWith(padded));
if (!targetMigration) {
  console.error(`No migration file found starting with ${padded}_ under ${MIGRATIONS}`);
  process.exit(2);
}

const rollbackFile = readdirSync(ROLLBACKS).find((f) => f.startsWith(padded));
if (!rollbackFile) {
  console.error(`No rollback file found starting with ${padded}_ under ${ROLLBACKS}`);
  process.exit(2);
}

const checkFile = existsSync(ROLLBACK_CHECKS)
  ? readdirSync(ROLLBACK_CHECKS).find((f) => f.startsWith(padded) && f.endsWith("_rollback_check.sql"))
  : undefined;

/**
 * Strip comments and string literals, then look at the transaction control
 * that actually EXECUTES. Counting raw occurrences of "commit" would trip on
 * every comment that discusses one, which is most of them in this repo.
 */
function transactionShape(sql) {
  const bare = sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\$function\$[\s\S]*?\$function\$/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
  const statements = bare.split(";");
  const begins = [];
  const commits = [];
  statements.forEach((s, i) => {
    const t = s.trim().toLowerCase();
    if (/^begin$/.test(t) || /^begin\s+(transaction|work)$/.test(t)) begins.push(i);
    if (/^commit$/.test(t) || /^commit\s+(transaction|work)$/.test(t)) commits.push(i);
  });
  const lastMeaningful = statements.reduce((acc, s, i) => (s.trim() ? i : acc), -1);
  return {
    begins: begins.length,
    commits: commits.length,
    // A commit that is not the file's final meaningful statement means a
    // later failure leaves everything before it already committed.
    commitsEarly: commits.some((i) => i !== lastMeaningful),
  };
}

function parseVerdict(results) {
  const rows = [];
  for (const rs of results ?? []) {
    const cols = (rs.fields ?? []).map((f) => f.name);
    if (cols.includes("result") && cols.includes("label")) {
      for (const r of rs.rows) rows.push({ label: r.label, passed: r.result === "PASS" });
    }
  }
  return rows;
}

console.log(`Rollback runner — migration ${targetMigration}, rollback ${rollbackFile}`);
console.log(`Building stack: preamble + ${upToTarget.length} migration(s) up to and including ${targetMigration}\n`);

const rollbackSql = readFileSync(join(ROLLBACKS, rollbackFile), "utf8");
const shape = transactionShape(rollbackSql);
console.log(
  `  transaction control in ${rollbackFile}: ${shape.begins} begin, ${shape.commits} commit` +
    (shape.begins === 1 && shape.commits === 1 && !shape.commitsEarly
      ? "  (one transaction, committed once at the end — good)"
      : ""),
);
if (shape.commitsEarly) {
  console.log(
    `  ✗ HAZARD: a COMMIT appears before the end of the file. A failure after it leaves\n` +
      `    everything before it already committed — the database ends up half rolled back\n` +
      `    while the script reports an error. Restructure so the file commits once, last.`,
  );
  process.exit(1);
}
if (shape.begins === 0) {
  console.log(
    `  ⚠ no explicit BEGIN: each statement commits on its own, so a failure part-way\n` +
      `    through leaves the earlier statements applied.`,
  );
}
console.log("");

const db = await PGlite.create();
try {
  await db.exec(PREAMBLE);
  for (const m of upToTarget) {
    await db.exec(readFileSync(join(MIGRATIONS, m), "utf8"));
  }
  console.log(`  ✓ forward stack applied cleanly (${upToTarget.length} migrations)`);

  let rollbackThrew = null;
  try {
    await db.exec(rollbackSql);
    console.log(`  ✓ ${rollbackFile} executed without error`);
  } catch (e) {
    rollbackThrew = e.message.split("\n")[0];
    console.log(`  ✗ ROLLBACK THREW: ${rollbackThrew}`);
  }

  // The session must not be left mid-transaction. A rollback whose BEGIN is
  // never matched would otherwise leave every later statement — including the
  // check below — silently inside it.
  try {
    await db.query("select 1");
    console.log(`  ✓ session is not left inside an open or aborted transaction\n`);
  } catch (e) {
    console.log(`  ✗ session unusable after the rollback: ${e.message.split("\n")[0]}\n`);
    process.exit(1);
  }

  if (!checkFile) {
    console.log(
      `  ✗ No ${padded}_*_rollback_check.sql under supabase/tests/rollback/.\n` +
        `    The rollback ${rollbackThrew ? "threw" : "ran"}, but its EFFECT was never asserted, and\n` +
        `    "it did not throw" is not evidence that it reverted anything. Treated as failure.`,
    );
    process.exit(1);
  }

  // Run the check even when the rollback threw — what it reports IS the
  // half-applied state, which is the thing worth seeing.
  const checkSql = readFileSync(join(ROLLBACK_CHECKS, checkFile), "utf8");
  let results;
  try {
    results = await db.exec(checkSql);
  } catch (e) {
    console.log(`  ✗ ${checkFile} THREW: ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
  const verdict = parseVerdict(results);
  if (verdict.length === 0) {
    console.log(`  ✗ ${checkFile} completed without error but produced zero verdict rows — treated as failure.`);
    process.exit(1);
  }

  const fails = verdict.filter((r) => !r.passed);
  console.log(`${checkFile}  (${verdict.length - fails.length}/${verdict.length})`);
  for (const r of verdict) console.log(`  ${r.passed ? "✓" : "✗ FAIL"}  ${r.label}`);

  process.exit(fails.length > 0 || rollbackThrew ? 1 : 0);
} finally {
  await db.close();
}
