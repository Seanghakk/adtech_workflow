-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 002
-- Brief: ADTECH_WF_Brief_001D_Post_Apply_Reconciliation_And_Rollback_Test §2
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 002_grants_and_api_exposure.sql. Every query inspects live catalog/role
-- state, never the migration text — same discipline as
-- 001_init_workflow_schema_verify.sql.
-- =============================================================================

-- 1. PostgREST exposes `workflow` alongside the stock schemas, and
--    `graphql_public` was preserved, not dropped.
-- Expect one row: pgrst.db_schemas=public, graphql_public, workflow
select rolconfig
from pg_roles
where rolname = 'authenticator';


-- 2. anon and authenticated both hold USAGE on schema workflow. Read via
--    has_schema_privilege(), not information_schema — schema-level USAGE
--    isn't reliably exposed there across Postgres versions.
-- Expect one row, both columns true.
select
  has_schema_privilege('anon', 'workflow', 'USAGE') as anon_has_usage,
  has_schema_privilege('authenticated', 'workflow', 'USAGE') as authenticated_has_usage;


-- 3. Table-level grants match the intended split: anon and authenticated
--    both hold SELECT on every table; authenticated additionally holds
--    INSERT and UPDATE; nobody holds DELETE anywhere.
-- Expect, with 19 tables in the schema (Result 001C):
--   anon          | SELECT | 19
--   authenticated | SELECT | 19
--   authenticated | INSERT | 19
--   authenticated | UPDATE | 19
-- and no DELETE row for anyone.
select grantee, privilege_type, count(*) as table_count
from information_schema.role_table_grants
where table_schema = 'workflow'
group by grantee, privilege_type
order by grantee, privilege_type;


-- 4. No DELETE privilege exists anywhere in the schema, for any role —
--    matches no table in workflow carrying a DELETE policy (see
--    001_init_workflow_schema_verify.sql block 4 for the policy side of
--    this same guarantee).
-- Expect ZERO rows.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow' and privilege_type = 'DELETE';


-- 5. Default privileges are set so a table added to `workflow` by a
--    FUTURE migration inherits the same SELECT (anon + authenticated) /
--    INSERT+UPDATE (authenticated only) split without its own grant
--    block. Full listing to eyeball — defaclacl is the raw ACL array,
--    not a computed pass/fail.
-- Expect one row (defaclobjtype = 'r', relations): defaclacl showing
-- anon with r (SELECT) and authenticated with arw (SELECT/INSERT/UPDATE).
select n.nspname as schema_name,
       d.defaclobjtype,
       d.defaclacl
from pg_default_acl d
join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'workflow';
