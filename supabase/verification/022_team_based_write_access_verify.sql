-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 022
-- Brief: ADTECH_WF_Brief_050_Migration_021_Rollback_Test_Screen_6a_Cleanup_And_Team_Write_Access §C
--
-- STANDING TRAP (carried forward from every prior round's own verify
-- file): these queries go through pg_policies (the view), never the raw
-- pg_policy catalog — a block run in the SQL editor executes as table
-- owner and bypasses RLS entirely, so nothing here can PROVE a policy
-- blocks or admits anyone. The real test needs real signed-in accounts on
-- the relevant teams, not the SQL editor — see block 6 below.
--
-- Run against a throwaway Supabase project carrying migrations 001-021
-- FIRST (rollback-test-first, this repo's own standing process): apply
-- 022, run blocks 1-5, apply the rollback, confirm blocks 1-5 revert to
-- their pre-022 shape. Only then apply 022 for real against the target.
-- =============================================================================

-- 1. The four new updated_by columns exist, nullable, FK to
-- public.user_profiles. Expect 4 rows.
select table_name, column_name, is_nullable
from information_schema.columns
where table_schema = 'workflow'
  and column_name = 'updated_by'
  and table_name in ('floor_sub_stages', 'project_handover_items', 'shop_drawing_boq_lines', 'procurement_lines')
order by table_name;


-- 2. floor_sub_stages — exactly 2 policies now (insert, update — no
-- delete), both stage-conditional, mentioning BOTH 'project_management'
-- and 'tnc'.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'floor_sub_stages'
order by cmd;


-- 3. project_handover_items — exactly 2 policies now (insert, update — no
-- delete), both mentioning 'qc'.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'project_handover_items'
order by cmd;


-- 4. shop_drawing_boq_lines / shop_drawing_boq_line_locations — 3 policies
-- each (insert/update/delete), every one mentioning BOTH is_superadmin
-- and shop_drawing/a_and_a.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_boq_lines'
order by cmd;

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_boq_line_locations'
order by cmd;


-- 5. procurement_lines — UNCHANGED policies (still exactly the migration
-- 014 team-keyed text, still mentioning 'procurement_local' and
-- 'procurement_overseas', no mention of updated_by anywhere in
-- qual/with_check — this migration only added the column, not a policy
-- change).
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'procurement_lines'
order by cmd;

-- qc_inspections — UNCHANGED, confirms this migration did not touch it.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'qc_inspections'
order by cmd;


-- 6. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as real signed-in accounts on each relevant team
-- (workflow.members.team_id -> workflow.teams.code):
--
--   a. Project team member: insert/update a floor_sub_stages row where
--      stage = 'installation' for ANY project (not just one they're PIC
--      of) — should succeed. Attempt the same on a stage = 'tnc' row —
--      should FAIL.
--   b. TNC team member: the reverse of (a) — tnc rows succeed,
--      installation rows fail.
--   c. QC team member: insert/update a project_handover_items row for any
--      project — should succeed.
--   d. Shop Drawing or A&A team member: insert/update/delete a
--      shop_drawing_boq_lines row and a shop_drawing_boq_line_locations
--      row for any project — should succeed.
--   e. A member on NONE of the above teams (e.g. Sales): attempt every
--      one of (a)-(d) — every attempt should FAIL.
--   f. The project's own PIC, who is NOT on the relevant team for a given
--      surface: attempt a write there — should also FAIL. This is the
--      real behaviour change this migration makes (PIC-only gating
--      REPLACED, not supplemented, for these two tables) — confirm it
--      deliberately, not as a surprise.
--
-- These verdicts belong to Seanghakk.
