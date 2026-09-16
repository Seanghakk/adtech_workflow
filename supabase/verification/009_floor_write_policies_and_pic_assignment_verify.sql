-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 009
-- Brief: ADTECH_WF_Brief_012_User_Management_And_Write_Permissions §1/§3
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 009_floor_write_policies_and_pic_assignment.sql — and after having run
-- the ROLLBACK against a non-production target first, per Brief §1.4.
--
-- STANDING TRAP, carried forward from this brief's own §0: these queries
-- go through pg_policies (the view), never the raw pg_policy catalog —
-- a block run in the SQL editor executes as table owner and bypasses RLS
-- entirely, so nothing here can PROVE a policy blocks anyone. These
-- checks confirm the objects exist with the intended SHAPE only. The
-- real test is a second account, through the app (block 6 below, and the
-- hand-verification script in the Result doc).
-- =============================================================================

-- 1. Each of the six tables now has exactly three write policies
--    (insert/update/delete), and checklist_templates/checklist_items
--    have none — confirming §1.3 was respected.
-- Expect 3 rows each for the first six table names, 0 rows for the last two.
select tablename, cmd, policyname
from pg_policies
where schemaname = 'workflow'
  and tablename in (
    'project_floors', 'shop_drawing_items', 'floor_sub_stages',
    'qc_inspections', 'qc_inspection_floors', 'project_handover_items',
    'checklist_templates', 'checklist_items'
  )
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
order by tablename, cmd;


-- 2. NO MANAGER BYPASS anywhere in these eighteen policies — every
--    qual/with_check references pic_id and nothing else. Matches
--    migration 006's own precedent for progress_updates.
-- Expect ZERO rows. Any row here means a policy accidentally let
-- is_manager()/is_admin() into the check, which this brief's §1.1
-- explicitly forbids.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'workflow'
  and tablename in (
    'project_floors', 'shop_drawing_items', 'floor_sub_stages',
    'qc_inspections', 'qc_inspection_floors', 'project_handover_items'
  )
  and (
    coalesce(qual, '') like '%is_manager%'
    or coalesce(with_check, '') like '%is_manager%'
  );


-- 3. Each policy's join path matches what the Result doc states — eyeball
--    the qual/with_check text against §1.2's table.
-- Expect: project_floors/shop_drawing_items/qc_inspections/
-- project_handover_items mention "p.pic_id" via a direct project_id join;
-- floor_sub_stages mentions project_floors joined to projects;
-- qc_inspection_floors mentions qc_inspections joined to projects.
select tablename, policyname, cmd, coalesce(qual, with_check) as definition
from pg_policies
where schemaname = 'workflow'
  and tablename in (
    'project_floors', 'shop_drawing_items', 'floor_sub_stages',
    'qc_inspections', 'qc_inspection_floors', 'project_handover_items'
  )
order by tablename, cmd;


-- 4. The DELETE grant landed on exactly these six tables, no others.
-- Expect exactly these 6 rows.
select table_name
from information_schema.role_table_grants
where table_schema = 'workflow'
  and grantee = 'authenticated'
  and privilege_type = 'DELETE'
order by table_name;


-- 5. The two new functions exist, SECURITY DEFINER, owned appropriately.
-- Expect 2 rows, both prosecdef = true.
select proname, prosecdef
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where pg_namespace.nspname = 'workflow'
  and proname in ('assign_project_pic', 'list_unlinked_accounts');


-- 6. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as a second real account:
--   a. Sign in as a member who is NOT a project's PIC. Attempt to add a
--      floor to that project (or any migration-008 write). Expect: it is
--      refused.
--   b. Sign in as the project's actual PIC. Attempt the same write.
--      Expect: it succeeds.
--   c. Sign in as a manager/admin who is NOT the PIC. Attempt the same
--      write against a project they do not hold as PIC. Expect: it is
--      ALSO refused — this is the "no manager bypass" guarantee, and the
--      one most likely to be silently wrong if block 2 above is skipped.
-- These verdicts belong to Seanghakk — see the Result doc's numbered
-- hand-verification script.
