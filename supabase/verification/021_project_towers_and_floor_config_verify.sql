-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 021
-- Brief: ADTECH_WF_Brief_047_Floor_Zone_Configuration
--
-- STANDING TRAP (carried forward from every prior round's own verify
-- file): these queries go through pg_policies (the view), never the raw
-- pg_policy catalog — a block run in the SQL editor executes as table
-- owner and bypasses RLS entirely, so nothing here can PROVE a policy
-- blocks or admits anyone. The real test needs a real signed-in PIC
-- account through the app, not the SQL editor — see block 6 below.
--
-- Run against a throwaway Supabase project carrying migrations 001-020
-- FIRST (rollback-test-first, this repo's own standing process): apply
-- 021, run blocks 1-5, apply the rollback, confirm blocks 1-5 revert to
-- their pre-021 shape. Only then apply 021 for real against the target.
-- =============================================================================

-- 1. project_towers exists with the expected shape. Expect four columns:
-- id, project_id, label, sort_order (plus created_at/updated_at).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'project_towers'
order by ordinal_position;

-- 2. project_floors.tower_id exists, nullable, references project_towers.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'project_floors' and column_name = 'tower_id';

select
  tc.constraint_name,
  rc.delete_rule,
  ccu.table_name as references_table
from information_schema.table_constraints tc
join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'workflow'
  and tc.table_name = 'project_floors'
  and tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name = 'project_towers';


-- 3. Uniqueness — the old project-wide constraint is GONE, the two
-- partial indexes exist instead. Expect zero rows for the old
-- constraint name, and two rows (one per index) below.
select constraint_name
from information_schema.table_constraints
where table_schema = 'workflow'
  and table_name = 'project_floors'
  and constraint_name = 'project_floors_project_id_label_key';

select indexname, indexdef
from pg_indexes
where schemaname = 'workflow'
  and tablename = 'project_floors'
  and indexname in ('project_floors_no_tower_label_unique', 'project_floors_tower_label_unique');

-- Confirm the partial indexes actually behave as intended: two floors
-- with the SAME label under DIFFERENT towers should both insert
-- successfully; a second no-tower floor with a label already used by
-- another no-tower floor in the same project should fail. Exercise this
-- by hand against real test rows — not scripted here since it needs
-- real project_id/tower_id values from this project's own test data.


-- 4. RLS enabled and exactly four policies on project_towers
-- (select/insert/update/delete), every insert/update/delete
-- qual/with_check mentioning "pic_id".
select relrowsecurity
from pg_class
where relname = 'project_towers' and relnamespace = 'workflow'::regnamespace;

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'project_towers'
order by cmd;


-- 5. DELETE grant on project_towers. Expect exactly one row: grantee =
-- 'authenticated', privilege_type = 'DELETE' (the table owner also
-- implicitly holds every privilege and is filtered out here deliberately,
-- matching migration 019/020's own verify files).
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow'
  and table_name = 'project_towers'
  and privilege_type = 'DELETE'
  and grantee = 'authenticated';

-- project_floors' own existing policies are UNCHANGED by this migration.
-- Expect the same select/insert/update/delete policies as before, still
-- referencing pic_id, no mention of tower_id in any qual/with_check
-- (adding a nullable column needs no RLS change).
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'project_floors'
order by cmd;


-- 6. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as a real signed-in account that IS the PIC of a real
-- test project:
--
--   a. Create a tower — should succeed.
--   b. Add a floor under that tower — should succeed, and the seed
--      trigger (workflow.seed_floor_children(), migration 008) should
--      still fire normally (confirm the floor's 7 child rows exist:
--      2 shop_drawing_items + 5 floor_sub_stages).
--   c. Add a SECOND tower, then add a floor with the SAME label under
--      it — should succeed (the partial-index fix's whole point).
--   d. Add a floor with NO tower whose label duplicates an existing
--      no-tower floor in the same project — should FAIL (uniqueness
--      still holds for the common, no-tower case).
--   e. Edit a floor's label and sort_order — should succeed.
--   f. Delete a freshly-added, untouched floor (no progress recorded on
--      any of its 7 seeded rows) — should succeed, and its 7 seeded
--      child rows should be gone too (confirm directly).
--   g. Record some progress on a floor's sub-stage (mark one in_progress
--      or done), then attempt to delete that floor — should FAIL with a
--      clear message, per this round's own deliberate "refuse deletion
--      of a floor with real recorded progress" design (see Result 047
--      for the full reasoning) — confirm the floor and its progress are
--      both still present afterward.
--   h. Attempt to delete a tower that still has a floor assigned to it —
--      should FAIL (ON DELETE RESTRICT) with a clear message; remove or
--      reassign the floor first, then the tower delete should succeed.
--
-- As a real signed-in account that is a member but NOT that project's
-- PIC:
--
--   i. Attempt to create/edit/delete a tower or floor for that same
--      project — every one should FAIL (RLS denies it).
--
-- These verdicts belong to Seanghakk.
