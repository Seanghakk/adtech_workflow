-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 020
-- Brief: ADTECH_WF_Brief_046_Amendment_A_Migration_And_Write_Policies §5
--
-- STANDING TRAP (carried forward from every prior round's own verify
-- file): these queries go through pg_policies (the view), never the raw
-- pg_policy catalog — a block run in the SQL editor executes as table
-- owner and bypasses RLS entirely, so nothing here can PROVE a policy
-- blocks or admits anyone. The real test needs a real signed-in PIC
-- account through the app, not the SQL editor — see block 5 below.
--
-- Run against a throwaway Supabase project carrying migrations 001-019
-- FIRST (rollback-test-first, this repo's own standing process): apply
-- 020, run blocks 1-4, apply the rollback, confirm blocks 1-4 revert to
-- their pre-020 shape (contract_boq_line_locations gone entirely;
-- contract_boq_lines' three policies back to superadmin()-only). Only
-- then apply 020 for real against the target.
-- =============================================================================

-- 1. contract_boq_line_locations exists with the expected shape. Expect
-- three rows: contract_boq_line_id (uuid, not null), location_label
-- (text, not null), quantity (numeric, not null).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'contract_boq_line_locations'
order by ordinal_position;

-- Expect exactly two columns in the primary key: contract_boq_line_id,
-- location_label — no surrogate id.
select kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
where tc.table_schema = 'workflow'
  and tc.table_name = 'contract_boq_line_locations'
  and tc.constraint_type = 'PRIMARY KEY';

-- Expect one foreign key, delete_rule = RESTRICT, referencing
-- contract_boq_lines(id).
select
  tc.constraint_name,
  rc.delete_rule,
  ccu.table_name as references_table
from information_schema.table_constraints tc
join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'workflow'
  and tc.table_name = 'contract_boq_line_locations'
  and tc.constraint_type = 'FOREIGN KEY';


-- 2. RLS enabled, and exactly four policies on contract_boq_line_locations
-- (select/insert/update/delete). Expect relrowsecurity = true.
select relrowsecurity
from pg_class
where relname = 'contract_boq_line_locations' and relnamespace = 'workflow'::regnamespace;

-- Expect exactly 4 rows: one each of select/insert/update/delete, every
-- insert/update/delete qual/with_check mentioning "contract_boq_lines" and
-- "pic_id" (the PIC join), the select policy mentioning "is_member".
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'contract_boq_line_locations'
order by cmd;


-- 3. contract_boq_lines' three policies now OR in the PIC condition
-- alongside is_superadmin() — NOT replaced by it. Expect 3 rows
-- (insert/update/delete), every qual/with_check containing BOTH
-- "is_superadmin" and "pic_id".
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow'
  and tablename = 'contract_boq_lines'
  and policyname in ('contract_boq_lines_insert', 'contract_boq_lines_update', 'contract_boq_lines_delete')
order by cmd;

-- contract_boq_lines_select (migration 018, untouched by this migration)
-- should be unchanged — still is_member() + can_view_project() only, no
-- mention of pic_id or is_superadmin.
select policyname, cmd, qual
from pg_policies
where schemaname = 'workflow' and tablename = 'contract_boq_lines' and policyname = 'contract_boq_lines_select';


-- 4. DELETE grant on contract_boq_line_locations. Expect exactly one row:
-- grantee = 'authenticated', privilege_type = 'DELETE' (the table owner —
-- 'postgres' in most Supabase projects — also implicitly holds every
-- privilege and is filtered out here deliberately, matching migration
-- 019's own verify file, Result 041's fix).
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow'
  and table_name = 'contract_boq_line_locations'
  and privilege_type = 'DELETE'
  and grantee = 'authenticated';


-- 5. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as a real signed-in account that IS the PIC of a real
-- test project:
--
--   a. Insert a contract_boq_lines row for that project — should succeed.
--   b. Insert a contract_boq_line_locations row referencing it — should
--      succeed.
--   c. Update and delete both rows — should succeed.
--
-- As a real signed-in account that is a member but NOT that project's
-- PIC:
--
--   d. Attempt the same insert/update/delete on both tables for that same
--      project — every one should FAIL (RLS denies it), confirming the
--      PIC condition actually gates non-PIC members, not just superadmin.
--
-- These verdicts belong to Seanghakk.
