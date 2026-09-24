# Rollback-test database sync

## What rollback-test is for

Every migration in `supabase/migrations/` is tested against the
**rollback-test** Supabase project before being applied to production. The
whole point is to catch a broken migration — or a migration that assumes
schema state production doesn't actually have — before it touches real
data. That guarantee is only as good as how closely rollback-test's current
state matches production's. If the two have quietly drifted apart, a
migration can pass its rollback-test run and still fail (or silently
misbehave) on production.

- **Production**: `cepnrkbfhyqqxdqdufja`
- **Rollback-test**: `srdqnofwhnrojkolwnke`

Both are read via `DATABASE_URL` and `ROLLBACK_TEST_DATABASE_URL` in
`.env.local` respectively. Never `source` that file or print either
connection string directly (see the README's own environment-variables
note) — extract only the project ref (the `postgres.<ref>` segment of the
pooler username) when you need to confirm which project you're talking to,
never the full string.

## Why this exists (Brief 091)

Brief 089 found two drifts by accident while auditing something unrelated:
`workflow.get_user_profiles()` (migration 010) was entirely missing on
rollback-test despite migration 028 — far later — being present, and
`public.user_profiles.telegram_chat_id` was `bigint` on rollback-test vs
`text` on production. Brief 091 did a full structural comparison and found
several more: `workflow.progress_updates.photo_url` and
`workflow.floor_sub_stages.photo_url` missing (migrations 023/024), a
missing `GRANT DELETE ... TO authenticated` on `workflow.members`
(migration 010), and `public.user_profiles` missing four columns
entirely (`role`, `is_active`, `updated_at`, `must_change_password`).

The likely root cause: **there is no migration-ledger table on either
project** (no `supabase_migrations.schema_migrations` — checked, absent on
both). Migrations here have always been applied by hand via `psql`
(confirmed by several migration files' own headers, e.g. migration 007's
"APPLIED BY HAND already... same 'database ahead of the repo' convention
this project has followed since migration 001"), not through a tool that
tracks what ran where. Without a ledger, it's easy for a migration to be
run against whichever project a given brief happened to need at the time,
and never replayed onto the other one. Migration 010 predates the
rollback-test discipline itself; migrations 023/024 are narrow, easy to
forget, additive columns; `public.user_profiles`'s extra columns belong to
the CMMS (see below) and were never this repo's to add anywhere.

Brief 091 also found the *opposite* kind of drift — objects that existed on
rollback-test but not on production (`workflow.contract_boq_line_locations`
and its policies, from migration 020; `workflow.requests`'s
`requests_update` policy, from migration 016). That meant **production was
missing migrations that are checked into this repo** — a real gap, but a
different one, and out of scope for a rollback-test repair (see "What this
tool does NOT do" below).

**Both were resolved on 23 Sep 2026 under Brief 093**, which investigated
the gap and applied migrations 016 and 020 to production. Production now
carries `workflow.contract_boq_line_locations`, `contract_boq_lines`'
PIC-shaped policies and the `requests_update` policy, so this particular
drift is closed in the direction of production catching up. It is kept here
as the worked example of the class, not as a live gap.

## How to run this comparison again

You need read access to both `DATABASE_URL` and `ROLLBACK_TEST_DATABASE_URL`
locally (`.env.local`). All of the below are **schema-only** reads —
`--schema-only` on `pg_dump`, or `information_schema`/`pg_catalog` queries
that never touch a data row beyond a `COUNT`. Never read application data
from production for this comparison.

1. **Confirm the project ref before connecting**, every time:
   ```bash
   python3 -c "
   import re
   with open('.env.local') as f:
       for line in f:
           if line.strip().startswith('DATABASE_URL=') or line.strip().startswith('ROLLBACK_TEST_DATABASE_URL='):
               name, val = line.strip().split('=', 1)
               val = val.strip().strip('\"').strip(\"'\")
               m = re.search(r'postgres\.([a-z0-9]+):', val)
               print(name, '->', m.group(1) if m else 'UNKNOWN')
   "
   ```
   Expect `DATABASE_URL -> cepnrkbfhyqqxdqdufja` and
   `ROLLBACK_TEST_DATABASE_URL -> srdqnofwhnrojkolwnke`. If either doesn't
   match, stop — you have the wrong connection string.

2. **Dump the `workflow` schema from both**, schema-only:
   ```bash
   pg_dump "$DATABASE_URL" --schema-only --schema=workflow --no-owner -f prod_workflow.sql
   pg_dump "$ROLLBACK_TEST_DATABASE_URL" --schema-only --schema=workflow --no-owner -f rbt_workflow.sql
   ```
   Don't diff these two files by eye — `pg_dump`'s object ordering and
   line-wrapping can make a real difference look identical to a harmless
   one (and vice versa) to a human skim. Brief 091 caught itself making
   exactly this mistake mid-session. Use the catalog-query approach below
   instead, which diffs by *value*, not by text position.

3. **Run the same catalog queries against both projects and diff the result
   sets in a small script**, not the raw SQL text. Both are checked in
   beside this doc — `docs/catalog-queries.sql` and
   `docs/compare-catalogs.py`:
   ```bash
   mkdir -p /tmp/catalog/prod /tmp/catalog/rbt
   (cd /tmp/catalog/prod && psql "$DATABASE_URL"               -f "$REPO"/docs/catalog-queries.sql)
   (cd /tmp/catalog/rbt  && psql "$ROLLBACK_TEST_DATABASE_URL" -f "$REPO"/docs/catalog-queries.sql)
   python3 "$REPO"/docs/compare-catalogs.py /tmp/catalog/prod /tmp/catalog/rbt
   ```
   Each run writes into its own directory because psql's `\o` is relative
   to the working directory. The comparison prints `PROD_ONLY:` and
   `RBT_ONLY:` per line, so which side has what is never ambiguous, and
   exits non-zero when anything differs. Between them they cover: tables,
   columns (name/type/nullable/default),
   constraints (`pg_get_constraintdef`), indexes, functions (arguments,
   return type, `prosecdef`, and a hash of `prosrc` — expect a few
   functions to show a differing hash that turns out to be pure `\r\n` vs
   `\n` line-ending noise in the stored body text, not a real difference;
   confirm with `repr()` on the raw bytes before treating a hash mismatch
   as meaningful), triggers, RLS enabled-per-table, every policy's `USING`/
   `WITH CHECK`, grants on `anon`/`authenticated`/`service_role`, views,
   and schema-level `USAGE`. For each result set, compare as Python (or
   equivalent) **sets**, not diffed text — `prod_set - rbt_set` and
   `rbt_set - prod_set` tell you unambiguously which side has what,
   something a hand-read diff can get backwards under time pressure.

4. **Also check the specific `public`-schema objects this app depends on**
   (`public.user_profiles` above all — grep the app for
   `.schema('public')` and grep every migration for `public\.\w+` to
   confirm the current list hasn't grown). These belong to the CMMS, not
   this repo — see below.

## Verifying a migration that replaces a function body

**A verification query must assert a marker unique to the new body, not
just that the function exists and is `SECURITY DEFINER`.**

This is not a style preference. Migration 037 was amended in place by
Brief 099 to correct its permission rule, and a superseded copy of the
migration was run against production by mistake. Its verification had 14
checks and **all 14 passed against the wrong function**, because every one
of them asked about schema shape:

```
 9 | workflow.commit_boq_import(...) exists     | present | present | PASS
10 | commit_boq_import is SECURITY DEFINER      | true    | true    | PASS
```

Both statements are equally true of either version. Production carried the
wrong permission rule through a merge, and what eventually caught it was
this document's own catalog comparison noticing the function's body hash
differed between the two projects — not the verification written for that
migration.

The fix is one more check per replaced function, asserting a string that
appears in the new body and nowhere in the old one:

```sql
select 15, 'commit_boq_import carries Brief 099''s per-tier rule',
  'true',
  coalesce((select (prosrc like '%v_may_write_tier%')::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')
```

When writing one:

- **Pick a marker that only the new body can contain** — a new variable
  name, a new branch, a renamed error message. Not a comment: comments get
  copied between versions more readily than code does.
- **Prove the check fails on the old body**, not only that it passes on
  the new one. Install the previous version on rollback-test, confirm the
  check reports FAIL, then re-apply the migration. A check that has only
  ever been seen passing has not been tested.
- **One check per behaviour the amendment changed**, not one per
  migration. Migration 037's correction changed two things — the per-tier
  rule and the separate floors/systems gate — so it carries two markers.
- This applies to any `CREATE OR REPLACE` on an existing object, not just
  functions. If a migration's whole point is to change what something
  already does, "it exists" proves nothing about whether it was applied.

Comparing `md5(replace(prosrc, chr(13), ''))` across the two projects is
the blunt version of the same check and is worth running after any
production migration — see the `functions` section of the catalog
comparison, and the note there about `\r\n` line-ending noise.

## Production is read-only; repairs go to rollback-test

- Every comparison read above is schema/catalog-only. Never read
  application data rows from production for this purpose (row counts are
  the one exception, and only if a count is genuinely needed).
- Every repair this comparison turns up gets applied to
  **rollback-test only**. Nothing in this procedure ever writes to
  production.
- Classify every difference before touching anything:
  - **Missing on rollback-test, exists on production** — replay the
    owning migration file verbatim from `supabase/migrations/` if one
    exists. If no migration in this repo owns the object (it's the CMMS's,
    e.g. `public.is_admin()`), and it's simple enough to be low-risk
    (self-contained, no unknown dependencies), create it on rollback-test
    to match production exactly via `pg_get_functiondef`/equivalent, and
    say so in the write-up.
  - **Different shape** (type, nullability, default, policy expression,
    function body) — change rollback-test to match production. Check for
    rows that would violate the new shape (e.g. a `NOT NULL` you're about
    to add) *before* running the change, and note the check's result
    either way.
  - **Exists on rollback-test only** — do not delete it. This usually
    means a migration was tested here and never promoted to production
    (or the reverse decision was made and its own rollback was never run
    here). List it with a guess at which, and leave it for a human
    decision — this procedure only closes the "rollback-test is behind"
    gap, not the "production is behind" one.
  - **Expected to differ** — the five role-test accounts, the rollback-test
    project's own fixture data (test project, floors, shop drawing items).
    Never touch these to make a diff cleaner.

## What this tool does NOT do

- It does not decide whether a migration that only exists on rollback-test
  should be applied to production, abandoned, or reworked. That's a
  product/priority decision for Seanghakk, not something this comparison
  resolves on its own. Brief 091 surfaced two such cases (migration 020's
  table and migration 016's policy); Brief 093 then took that decision and
  applied both to production on 23 Sep 2026. The comparison's job ended at
  naming them.
- It does not reach into the CMMS's own schema beyond what this app
  directly depends on. `public.user_profiles` gets kept in sync because
  this app's own tables FK into it constantly; things like `public.sites`
  or `public.client_progress_summary()` — CMMS objects with their own
  further dependencies this repo has no visibility into — are flagged for
  the CMMS side to handle with their own migrations, not reconstructed
  here from a schema-only read of production. Reconstructing a foreign
  system's schema from the outside, one FK at a time, is how a "mirror"
  quietly becomes its own diverging thing.

## Fixtures that must survive any repair

The five role-test accounts (PIC, Shop Drawing manager, Shop Drawing
member, A&A member, outsider — Briefs 079/088/089), the "Rollback Test
Project" they're attached to, its test floors, and its shop drawing test
items. Other briefs depend on these existing with stable IDs. Never reset
the project, never drop fixture rows to make a comparison's data-level
noise disappear — fixture data is *supposed* to differ from production;
that's not drift, that's the fixtures doing their job.

## When to run this

- **Before trusting a migration test on rollback-test** — if the schema
  underneath the migration you're about to test has drifted, a clean test
  run there proves less than it looks like it proves.
- **After any migration is applied to production** — to confirm the
  structural gap that migration was meant to close on production also
  gets closed on rollback-test in the same pass, not "eventually." Run
  the migration's own verification query against production as well, and
  read the output rather than the exit status: if the migration replaced
  a function body, check the marker assertion above is among the rows
  that passed.
