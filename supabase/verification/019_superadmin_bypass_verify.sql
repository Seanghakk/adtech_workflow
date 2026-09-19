-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 019
-- Brief: ADTECH_WF_Brief_040_Superadmin_Implementation §5
--
-- STANDING TRAP (carried forward from every prior round's own verify
-- file): these queries go through pg_policies (the view), never the raw
-- pg_policy catalog — a block run in the SQL editor executes as table
-- owner and bypasses RLS entirely, so nothing here can PROVE a policy
-- blocks or admits anyone. The real test needs a real signed-in account
-- through the app, not the SQL editor — see block 6 below.
--
-- Run against a throwaway Supabase project carrying migrations 001-018
-- FIRST (rollback-test-first, this repo's own standing process): apply
-- 019, run blocks 1-5, apply the rollback, confirm blocks 1-5 revert to
-- their pre-019 shape. Only then apply 019 for real against the target.
-- =============================================================================

-- 1. is_superadmin column and is_superadmin() function exist.
-- Expect one row for the column (data_type = 'boolean', is_nullable =
-- 'NO', column_default mentioning false) and one row for the function
-- (pronargs = 0).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'workflow' and table_name = 'members' and column_name = 'is_superadmin';

select proname, pronargs
from pg_proc
where proname = 'is_superadmin' and pronamespace = 'workflow'::regnamespace;


-- 2. Confirm no one is flagged is_superadmin yet — this migration must
-- not have set it for anyone. Expect zero rows.
select id, user_id from workflow.members where is_superadmin;


-- 3. can_view_project()'s new body mentions is_superadmin. Expect the
-- function source (prosrc) to contain 'is_superadmin'.
select proname, prosrc ilike '%is_superadmin%' as mentions_superadmin
from pg_proc
where proname = 'can_view_project' and pronamespace = 'workflow'::regnamespace;


-- 4. Every is_manager()-gated write policy now ORs in is_superadmin().
-- Expect 13 rows, each with_check/qual text containing 'is_superadmin'.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow'
  and policyname in (
    'members_insert', 'members_update', 'members_delete',
    'stages_insert', 'stages_update',
    'scope_types_insert', 'scope_types_update',
    'reason_codes_insert', 'reason_codes_update',
    'reporting_periods_insert', 'reporting_periods_update',
    'client_owners_insert', 'client_owners_update'
  )
order by tablename, cmd;


-- 5. Every PIC-keyed/team-keyed write policy now ORs in is_superadmin().
-- Expect 21 rows total, each with_check/qual text containing
-- 'is_superadmin'. progress_updates_insert's with_check should ALSO still
-- contain 'author_id' (confirms the reversal only ADDED the bypass, did
-- not replace the original author-ownership check).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow'
  and policyname in (
    'project_floors_insert', 'project_floors_update', 'project_floors_delete',
    'shop_drawing_items_insert', 'shop_drawing_items_update', 'shop_drawing_items_delete',
    'floor_sub_stages_insert', 'floor_sub_stages_update', 'floor_sub_stages_delete',
    'project_handover_items_insert', 'project_handover_items_update', 'project_handover_items_delete',
    'progress_updates_insert',
    'procurement_lines_insert', 'procurement_lines_update',
    'procurement_line_floors_insert', 'procurement_line_floors_delete',
    'qc_inspections_insert', 'qc_inspections_update',
    'qc_inspection_floors_insert', 'qc_inspection_floors_update'
  )
order by tablename, cmd;


-- 6. BOQ tables — new superadmin-only write policies. Expect 21 rows (3
-- per table x 7 tables), all qual/with_check = is_superadmin() only (no
-- OR clause — no one else gets write access here).
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow'
  and tablename in (
    'tender_boq_lines', 'tender_boq_line_locations', 'tender_boq_location_map',
    'contract_boq_lines',
    'shop_drawing_boq_lines', 'shop_drawing_boq_line_locations', 'shop_drawing_boq_location_map'
  )
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
order by tablename, cmd;


-- 7. DELETE grant on the seven BOQ tables. Expect exactly 7 rows, one per
-- table, privilege_type = 'DELETE', grantee = 'authenticated'. (The table
-- owner — 'postgres' in most Supabase projects — always implicitly holds
-- every privilege and will show up here too if the grantee filter below
-- is ever removed; that's not a grant this migration made.)
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow'
  and table_name in (
    'tender_boq_lines', 'tender_boq_line_locations', 'tender_boq_location_map',
    'contract_boq_lines',
    'shop_drawing_boq_lines', 'shop_drawing_boq_line_locations', 'shop_drawing_boq_location_map'
  )
  and privilege_type = 'DELETE'
  and grantee = 'authenticated'
order by table_name, grantee;


-- 8. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as real signed-in accounts:
--
--   a. Flag one throwaway test account is_superadmin = true by hand:
--        update workflow.members set is_superadmin = true where id = '<test member id>';
--      Do NOT flag any real production account this way for testing —
--      use a disposable test member row.
--
--   b. As that superadmin account, confirm you CAN:
--        - read a project you would otherwise be excluded from as a
--          sales-only member (if the test account is sales-team scoped);
--        - insert/update a row on a table gated by is_manager() (e.g.
--          workflow.reason_codes) despite the account's role being
--          'member', not 'manager'/'admin';
--        - insert/update/delete a row on a PIC-keyed table (e.g.
--          workflow.project_floors) for a project the account is NOT the
--          PIC of;
--        - insert a row into a BOQ table (e.g. workflow.tender_boq_lines)
--          — this table had ZERO write policies for anyone before this
--          migration.
--
--   c. As a second, non-superadmin account (is_superadmin = false, same
--      role/team as the superadmin test account otherwise), confirm each
--      of the four checks in (b) still FAILS exactly as it did before
--      this migration — the bypass must be scoped to the superadmin
--      account only, not accidentally widened for everyone.
--
--   d. Confirm the rollback file, run immediately after, restores every
--      policy listed in blocks 4-6 above to its exact pre-migration text
--      (rerun blocks 4-6 post-rollback and diff against a pre-019
--      snapshot), drops workflow.is_superadmin() and the seven BOQ write
--      policies entirely, and drops the is_superadmin column — confirm
--      with:
--        select column_name from information_schema.columns
--        where table_schema = 'workflow' and table_name = 'members'
--          and column_name = 'is_superadmin';
--      (expect zero rows after rollback).
--
-- These verdicts belong to Seanghakk.
