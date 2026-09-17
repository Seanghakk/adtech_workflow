-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 015
-- Brief: ADTECH_WF_Brief_022_Procurement_Line_Identity_Owner_And_Floors §1/§6/§7
-- AMENDED per Brief 022 Amendment A §5 — see block 0b below.
--
-- Run blocks 0 and 0b by hand BEFORE applying migration 015. Block 0
-- decides which branch the description-column NOT NULL logic takes. Block
-- 0b re-confirms, at apply time, the live policy text this migration's
-- SELECT fix depends on — Amendment A §5's standing rule: "a policy's
-- CURRENT definition lives in pg_policies. The migration that CREATED it
-- may have been superseded by a later one." Do not skip 0b on the
-- assumption Amendment A's own reading (17 Sep 2026) still holds; confirm
-- it again at apply time. Run the rest AFTER applying — and after having
-- run the rollback against a non-production target first (rollback-test
-- project carrying 001-013 plus the stub public.user_profiles; migration
-- 014 may or may not be applied there, and does not need to be for this
-- migration's own DDL to work — see this migration's own header).
--
-- STANDING TRAP (carried forward from every prior round's own verify
-- file): these queries go through pg_policies (the view), never the raw
-- pg_policy catalog — a block run in the SQL editor executes as table
-- owner and bypasses RLS entirely, so nothing here can PROVE a policy
-- blocks or admits anyone. The team-keyed half (block 5) needs a real
-- procurement-team account through the app, same as migration 014's own
-- verify file says.
-- =============================================================================

-- 0. PRE-FLIGHT — run this BEFORE applying, not after (§1). Decides
--    whether description ends up NOT NULL or nullable.
-- Brief expects 0. If it is not 0, description will be left NULLABLE —
-- confirm the migration's own NOTICE output says which branch it took.
select count(*) from workflow.procurement_lines;


-- 0b. PRE-FLIGHT (Amendment A §5) — confirms the premise this migration's
--     procurement_line_floors_select fix depends on: that
--     procurement_lines_select is project-scoped via can_view_project(),
--     not a flat is_member() check. Expect qual to mention both
--     is_member() and can_view_project(), matching the text quoted in this
--     migration's own header and in Amendment A §1. If it does NOT match —
--     i.e. procurement_lines_select has changed again since 17 Sep 2026 —
--     STOP: the SELECT policy below needs re-deriving against whatever
--     procurement_lines_select currently says, not applied as written.
select policyname, cmd, qual
from pg_policies
where schemaname = 'workflow' and tablename = 'procurement_lines' and policyname = 'procurement_lines_select';


-- 1. workflow.procurement_lines has the two new columns, with the right
--    nullability and FK target.
-- Expect 2 rows: assigned_to (nullable, uuid), description (nullable OR
-- not null depending on block 0's count).
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'workflow' and table_name = 'procurement_lines'
  and column_name in ('assigned_to', 'description')
order by column_name;


-- 2. assigned_to's FK — public.user_profiles(id), ON DELETE RESTRICT.
-- Expect 1 row.
select
  tc.constraint_name,
  ccu.table_schema as ref_schema,
  ccu.table_name as ref_table,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'workflow' and tc.table_name = 'procurement_lines'
  and tc.constraint_type = 'FOREIGN KEY'
  and ccu.column_name = 'id' and ccu.table_name = 'user_profiles';


-- 3. workflow.procurement_line_floors exists with the composite PK and
--    both FKs, both ON DELETE RESTRICT.
-- Expect 2 rows (one per FK column), both delete_rule = 'RESTRICT'.
select
  kcu.column_name,
  ccu.table_name as ref_table,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'workflow' and tc.table_name = 'procurement_line_floors'
  and tc.constraint_type = 'FOREIGN KEY'
order by kcu.column_name;

-- Expect exactly one row, PRIMARY KEY, covering both columns.
select tc.constraint_name, kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
where tc.table_schema = 'workflow' and tc.table_name = 'procurement_line_floors'
  and tc.constraint_type = 'PRIMARY KEY'
order by kcu.ordinal_position;


-- 4. workflow.procurement_line_floors' policies — select (EXISTS-joined
--    through procurement_lines, AMENDED per Amendment A §3.1 — no longer a
--    flat is_member()), insert and delete (both current_team-gated), no
--    update.
-- Expect 3 rows: select, insert, delete. qual/with_check on insert and
-- delete both mention current_team; select's qual mentions
-- workflow.procurement_lines (an EXISTS join), NOT a bare is_member() call.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'procurement_line_floors'
order by cmd;


-- 4b. THE REGRESSION THIS AMENDMENT FIXES — confirm procurement_line_floors
--     is no longer MORE permissive than procurement_lines. Expect these two
--     counts to be equal: every procurement_line_floors row's line must be
--     visible under procurement_lines_select for the same viewer, so a
--     join back through procurement_lines should drop no rows relative to
--     a straight count. (Run as an authenticated app user, not the SQL
--     editor owner role — see this file's own standing trap note above.)
select count(*) from workflow.procurement_line_floors;
select count(*) from workflow.procurement_line_floors plf
  join workflow.procurement_lines pl on pl.id = plf.procurement_line_id;


-- 5. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as real signed-in accounts:
--   a. As an active member of procurement_local or procurement_overseas,
--      confirm a procurement_line_floors row can be inserted, linking any
--      procurement line to any of its project's floors.
--   b. As the same account, confirm that row can be deleted.
--   c. As the project's PIC (not on a procurement team), confirm both the
--      insert and the delete are refused.
--   d. As any active member, confirm procurement_line_floors rows still
--      SELECT normally regardless of team membership.
--   e. Confirm a procurement_line_floors row cannot be created pointing at
--      a floor belonging to a DIFFERENT project than the procurement
--      line's own project — this is not enforced by any constraint in
--      this migration (deliberately left as a documented expectation, not
--      a DB rule, same as qc_inspection_floors' own type/floor pairing in
--      migration 008), so confirm this by inspection of the data, not by
--      expecting a database error.
-- These verdicts belong to Seanghakk — see the Result doc's own numbered
-- hand-verification script for the full rollback-then-reapply sequence.
