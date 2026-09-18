-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 017
-- Brief: ADTECH_WF_Brief_024_Floor_Sub_Stage_UI_And_QC_Role §4/§5
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 017_qc_team_write_policies.sql — and after having run the rollback
-- against a non-production target first (a throwaway project carrying
-- migrations 001-016), per this repo's own standing process.
--
-- STANDING TRAP (carried forward from Briefs 009-019 §0): these queries go
-- through pg_policies (the view), never the raw pg_policy catalog — a
-- block run in the SQL editor executes as table owner and bypasses RLS
-- entirely, so nothing here can PROVE a policy blocks or admits anyone.
-- The team-keyed rule in particular CANNOT be proven from here at all
-- (block 3) — it needs a real QC-team account through the app, same
-- standing caveat migration 014's own verify file states for procurement.
-- =============================================================================

-- 0. PRE-FLIGHT — confirms the QC team row exists and is active before
--    relying on it.
-- Expect 1 row: qc, is_active = true.
select code, label_en, is_active
from workflow.teams
where code = 'qc';


-- 1. workflow.qc_inspections now has team-keyed insert/update policies,
--    not the old PIC-keyed ones. select is confirmed unchanged alongside
--    them, all in one query rather than assumed piecemeal.
-- Expect 3 rows: select (migration 008, untouched — qual mentions
-- is_member/can_view_project, not current_team), insert, update (both new
-- — qual/with_check both read `(current_team() = 'qc'::text)`, no
-- reference to pic_id or auth.uid() anywhere).
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'qc_inspections'
order by cmd;


-- 2. No delete policy exists for qc_inspections.
-- Expect 0 rows. (The migration-009 DELETE grant to `authenticated` still
-- technically exists — grants and policies are separate objects, see
-- migration 017's own header — but with zero matching policies here, RLS
-- admits no rows for DELETE regardless of that grant.)
select policyname
from pg_policies
where schemaname = 'workflow' and tablename = 'qc_inspections' and cmd = 'DELETE';


-- 3. Same two checks, workflow.qc_inspection_floors.
-- Expect 3 rows (select/insert/update), same shape as block 1.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'qc_inspection_floors'
order by cmd;

-- Expect 0 rows.
select policyname
from pg_policies
where schemaname = 'workflow' and tablename = 'qc_inspection_floors' and cmd = 'DELETE';


-- 4. SANITY CHECK — this migration touches ONLY qc_inspections and
--    qc_inspection_floors. Confirms the other four migration-008 tables
--    kept their migration-009 PIC-keyed write policies untouched (Brief
--    024 §2.2/§5 — sub-stage write access does not change this round).
-- Expect every qual/with_check below to still reference p.pic_id =
-- auth.uid() (or the floor_id -> project_floors -> projects join for
-- floor_sub_stages) — none should mention current_team.
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow'
  and tablename in ('project_floors', 'shop_drawing_items', 'floor_sub_stages', 'project_handover_items')
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
order by tablename, cmd;


-- 5. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as real signed-in accounts:
--   a. As an active member of workflow.teams code = 'qc', confirm a
--      qc_inspections row (and a qc_inspection_floors row against it) can
--      be inserted and updated for ANY project, not just one the QC
--      member is otherwise associated with.
--   b. As the PIC of a project, and NOT a member of the QC team, confirm
--      the same insert/update against that project's own inspections is
--      now REFUSED (this is the behaviour change from migration 009 —
--      PIC access to these two tables is being removed, not added to).
--   c. As a manager who is not on the QC team, confirm the same
--      insert/update is refused — no manager bypass exists.
--   d. As any active member, confirm qc_inspections/qc_inspection_floors
--      rows still SELECT normally for projects they can otherwise view
--      (migration 008's read policy is untouched).
--   e. Confirm no delete control exists anywhere and a direct delete
--      attempt (if tried via the API) is refused for both tables.
--   f. Confirm workflow.project_floors / shop_drawing_items /
--      floor_sub_stages / project_handover_items writes still work
--      exactly as before for the project's PIC — this migration should
--      have changed nothing about them.
-- These verdicts belong to Seanghakk — see the Result doc's own numbered
-- hand-verification script.
