-- =============================================================================
-- Rollback-test / production catalog comparison — the queries
-- See docs/rollback-test-sync.md, "How to run this comparison again".
--
-- Every query here is SCHEMA-ONLY: information_schema and pg_catalog only.
-- None of them reads an application data row, from either project.
--
-- Run it once against each project, into its OWN output directory, then
-- diff the two directories with docs/compare-catalogs.py:
--
--   mkdir -p /tmp/catalog/prod /tmp/catalog/rbt
--   (cd /tmp/catalog/prod && psql "$DATABASE_URL"               -f "$REPO"/docs/catalog-queries.sql)
--   (cd /tmp/catalog/rbt  && psql "$ROLLBACK_TEST_DATABASE_URL" -f "$REPO"/docs/catalog-queries.sql)
--   python3 "$REPO"/docs/compare-catalogs.py /tmp/catalog/prod /tmp/catalog/rbt
--
-- \o writes relative to psql's working directory, which is why each run
-- happens inside its own directory rather than writing to a path baked in
-- here — the same file names on both sides are what the comparison pairs up.
--
-- Confirm which project each connection string points at BEFORE running
-- this; docs/rollback-test-sync.md step 1 has the snippet.
-- =============================================================================

\pset format unaligned
\pset fieldsep '|'
\pset tuples_only on

\o tables.out
select table_schema||'.'||table_name from information_schema.tables where table_schema='workflow' order by 1;
\o

\o columns.out
select table_schema||'.'||table_name||'|'||column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') from information_schema.columns where table_schema='workflow' order by 1;
\o

\o public_user_profiles_columns.out
select column_name||'|'||data_type||'|'||is_nullable||'|'||coalesce(column_default,'') from information_schema.columns where table_schema='public' and table_name='user_profiles' order by 1;
\o

\o constraints.out
select conrelid::regclass::text||'|'||conname||'|'||contype::text||'|'||pg_get_constraintdef(oid) from pg_constraint where connamespace='workflow'::regnamespace order by 1;
\o

\o indexes.out
select schemaname||'.'||tablename||'|'||indexname||'|'||indexdef from pg_indexes where schemaname='workflow' order by 1;
\o

-- The body hash strips carriage returns before hashing. Production's
-- function bodies were applied with CRLF line endings and rollback-test's
-- with LF, so a raw md5(prosrc) reported FOUR functions as differing on
-- every single run — compute_progress_update_delta, current_team,
-- is_manager, is_member — when the logic on both sides was byte-identical
-- once the CRs came out. Eight false differences per run is how a
-- comparison teaches people to skim its output, which is the opposite of
-- what it is for. Confirmed before normalising, not assumed: the stripped
-- hashes match exactly.
--
-- This still catches a REAL body change, which is the whole point of
-- hashing the body at all (see the sync doc's "Verifying a migration that
-- replaces a function body" — a superseded commit_boq_import reached
-- production and this hash is what caught it).
\o functions.out
select 'workflow.'||p.proname||'('||pg_get_function_arguments(p.oid)||')'||'|'||pg_get_function_result(p.oid)||'|'||p.prosecdef::text||'|'||md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.pronamespace='workflow'::regnamespace order by 1;
\o

\o functions_public.out
select 'public.'||p.proname||'('||pg_get_function_arguments(p.oid)||')'||'|'||pg_get_function_result(p.oid)||'|'||p.prosecdef::text||'|'||md5(replace(p.prosrc, chr(13), '')) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('is_admin','client_progress_summary') order by 1;
\o

\o triggers.out
select event_object_table||'|'||trigger_name||'|'||action_timing||'|'||event_manipulation||'|'||action_statement from information_schema.triggers where trigger_schema='workflow' order by 1;
\o

\o rls_enabled.out
select schemaname||'.'||tablename||'|'||rowsecurity::text from pg_tables where schemaname='workflow' order by 1;
\o

\o policies.out
select schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') from pg_policies where schemaname='workflow' order by 1;
\o

\o grants.out
select table_schema||'.'||table_name||'|'||grantee||'|'||privilege_type from information_schema.role_table_grants where table_schema='workflow' and grantee in ('anon','authenticated','service_role') order by 1;
\o

\o views.out
select table_schema||'.'||table_name from information_schema.views where table_schema='workflow' order by 1;
\o

\o schema_grants.out
select r.rolname||'|'||p.perm from pg_namespace n, pg_roles r, unnest(array['USAGE']) as p(perm)
where n.nspname='workflow' and r.rolname in ('anon','authenticated','service_role')
and has_schema_privilege(r.rolname, n.oid, 'USAGE')
order by 1;
\o

-- =============================================================================
-- STORAGE (Brief 100 Part E)
--
-- Added after Part E found production carrying two buckets — progress-photos
-- and wo-photos — that rollback-test did not have at all. Everything above
-- this line reads the `workflow` schema (plus the one `public` table this app
-- depends on), so a bucket could go missing indefinitely without any of it
-- noticing. Photo evidence lives in a bucket, not in a table, and a screen
-- whose photo gate cannot be exercised on rollback-test is a screen whose
-- rollback-test run proves less than it appears to.
--
-- Still schema-only: bucket CONFIGURATION, never the objects inside them.
-- storage.objects is application data — never read it here, from either
-- project.
--
-- owner, owner_id and created_at are deliberately NOT compared: they record
-- who happened to click Create and when, which differs legitimately between
-- two projects holding the same bucket.
-- =============================================================================

\o storage_buckets.out
select id||'|'||name||'|'||public::text||'|'||coalesce(file_size_limit::text,'')||'|'||coalesce(array_to_string(allowed_mime_types,','),'')||'|'||avif_autodetection::text||'|'||type::text||'|'||coalesce(versioning_status,'') from storage.buckets order by 1;
\o

\o storage_tables.out
select schemaname||'.'||tablename from pg_tables where schemaname='storage' order by 1;
\o

\o storage_rls_enabled.out
select schemaname||'.'||tablename||'|'||rowsecurity::text from pg_tables where schemaname='storage' order by 1;
\o

\o storage_policies.out
select schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'') from pg_policies where schemaname='storage' order by 1;
\o
