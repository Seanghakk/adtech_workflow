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

\o functions.out
select 'workflow.'||p.proname||'('||pg_get_function_arguments(p.oid)||')'||'|'||pg_get_function_result(p.oid)||'|'||p.prosecdef::text||'|'||md5(p.prosrc) from pg_proc p where p.pronamespace='workflow'::regnamespace order by 1;
\o

\o functions_public.out
select 'public.'||p.proname||'('||pg_get_function_arguments(p.oid)||')'||'|'||pg_get_function_result(p.oid)||'|'||p.prosecdef::text||'|'||md5(p.prosrc) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('is_admin','client_progress_summary') order by 1;
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
