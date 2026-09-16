-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 004
-- Brief: ADTECH_WF_Brief_003_Sales_Roles
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 004_sales_roles_and_client_ownership.sql. Catalog-only checks, same
-- discipline as every other verification file here (no psql/DATABASE_URL
-- in this environment — see 003's own verify file for why). These confirm
-- the objects exist with the intended SHAPE; they do not prove the RLS
-- restriction behaves correctly end to end — see the note at the bottom.
-- =============================================================================

-- 1. is_maintenance_contract exists on projects, boolean, NOT NULL, default false.
-- Expect 1 row: is_maintenance_contract | boolean | NO | false
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'workflow' and table_name = 'projects'
  and column_name = 'is_maintenance_contract';


-- 2. workflow.client_owners exists with the expected columns.
-- Expect 8 rows: id, org_id, client_id, sales_engineer_id, assigned_at,
-- assigned_by, created_at, updated_at.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'client_owners'
order by ordinal_position;


-- 3. client_owners has RLS enabled and exactly 3 policies (select, insert, update — no delete).
-- Expect relrowsecurity = true.
select relrowsecurity
from pg_class
where oid = 'workflow.client_owners'::regclass;

-- Expect 3 rows: client_owners_select | SELECT, client_owners_insert | INSERT,
-- client_owners_update | UPDATE.
-- ADTECH_WF_Result_004: pg_policy.cmd is a raw single-character code
-- ('r'/'a'/'w'/'d'/'*'), not the human-readable command name — that
-- decoding only exists on the pg_policies VIEW (used correctly elsewhere
-- in this file, blocks 7 and 9). Fixed to query the view here too.
select policyname as policy_name, cmd as command
from pg_policies
where schemaname = 'workflow' and tablename = 'client_owners'
order by cmd;


-- 4. The unique constraint on (org_id, client_id) exists — a client has at
-- most one current owner.
-- Expect 1 row, contype = 'u'.
select conname, contype
from pg_constraint
where conrelid = 'workflow.client_owners'::regclass and contype = 'u';


-- 5. workflow.can_view_project(uuid, boolean) exists, in schema workflow.
-- Expect 1 row.
select p.proname as function_name, n.nspname as schema_name,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'can_view_project' and n.nspname = 'workflow';


-- 6. Read the live source and eyeball the two branches: unrestricted for
-- anyone NOT a sales-team member/manager, restricted-to-owned-maintenance-
-- clients for anyone who is. Not a pass/fail query — a listing to review,
-- same as 001's verify block 13 and 003's blocks 3-4.
select pg_get_functiondef('workflow.can_view_project(uuid, boolean)'::regprocedure);


-- 7. All six affected SELECT policies now reference can_view_project, not
-- a bare is_member() — confirms the DROP + CREATE actually took effect,
-- not just that a policy with the right name exists.
-- Expect 6 rows, each qual containing 'can_view_project'.
select
  schemaname || '.' || tablename as table_name,
  policyname,
  qual like '%can_view_project%' as calls_can_view_project
from pg_policies
where schemaname = 'workflow'
  and tablename in ('projects', 'variations', 'project_items', 'progress_updates',
                     'procurement_lines', 'dependency_links')
  and cmd = 'SELECT'
order by table_name;


-- 8. workflow.is_sales_only_member() exists.
-- Expect 1 row.
select p.proname as function_name, n.nspname as schema_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname = 'is_sales_only_member' and n.nspname = 'workflow';


-- 9. THE GAP FIX: progress_updates_insert's WITH CHECK now excludes
-- is_sales_only_member() from the manager-override branch — confirms a
-- Sales Supervisor cannot write progress updates via that override
-- (Brief 092's "no write action in the maintenance flow" requirement).
-- Expect 1 row, with_check containing BOTH 'is_manager' and
-- 'is_sales_only_member'.
select
  policyname,
  with_check like '%is_manager%' as has_manager_override,
  with_check like '%is_sales_only_member%' as excludes_sales_only
from pg_policies
where schemaname = 'workflow' and tablename = 'progress_updates'
  and policyname = 'progress_updates_insert';


-- =============================================================================
-- WHAT THIS FILE CANNOT PROVE
-- =============================================================================
-- Blocks 1-7 confirm the schema objects exist with the intended shape and
-- source text. They do NOT prove the restriction actually behaves
-- correctly for a real Sales Engineer/Supervisor session — that requires:
--   (a) at least one real workflow.members row with team_id = the sales
--       team and role = 'member' or 'manager',
--   (b) at least one real workflow.client_owners row assigning them a
--       client, and
--   (c) at least one real project under that client with
--       is_maintenance_contract = true, plus another project (either a
--       different client, or the same client with
--       is_maintenance_contract = false) that the same session should
--       NOT be able to see.
-- Rather than insert fixture rows against production here (this
-- environment cannot do so anyway — no psql, no DATABASE_URL), the real
-- behavioural test is: apply supabase/seed_dev.sql (extended with a
-- client_owners row and a maintenance-flagged project) in a review/dev
-- context, sign in as that member, and confirm directly in the app that
-- the Sales monitoring view shows exactly the expected project and
-- nothing else — and, as a genuine negative test, that a direct API call
-- for an out-of-scope project's data returns nothing rather than relying
-- on the UI to simply not offer a link to it.
-- =============================================================================
