-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 014
-- Brief: ADTECH_WF_Brief_019_Screen_2c_Procurement_Line §3/§8
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 014_procurement_team_write_policies.sql — and after having run the
-- rollback against a non-production target first (rollback-test project
-- carrying 001-013 plus the stub public.user_profiles, per this migration's
-- own header).
--
-- STANDING TRAP (carried forward from Briefs 009/010/011/012 §0): these
-- queries go through pg_policies (the view), never the raw pg_policy
-- catalog — a block run in the SQL editor executes as table owner and
-- bypasses RLS entirely, so nothing here can PROVE a policy blocks or
-- admits anyone. The team-keyed rule in particular CANNOT be proven from
-- here at all (block 3) — it needs a real procurement-team account through
-- the app, per the brief's own §8.
-- =============================================================================

-- 0. PRE-FLIGHT — confirms the two procurement team rows exist and are
--    active before relying on them.
-- Expect 2 rows: procurement_local, procurement_overseas, both is_active.
select code, label_en, is_active
from workflow.teams
where code in ('procurement_local', 'procurement_overseas')
order by code;


-- 1. workflow.procurement_lines now has insert/update policies alongside
--    its original select policy, all confirmed together rather than
--    assumed.
-- Expect 3 rows: select (from migration 001, untouched), insert, update
-- (both new). qual/with_check on insert and update both mention
-- current_team.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'procurement_lines'
order by cmd;


-- 2. No delete policy exists for procurement_lines.
-- Expect 0 rows.
select policyname
from pg_policies
where schemaname = 'workflow' and tablename = 'procurement_lines' and cmd = 'DELETE';


-- 3. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as real signed-in accounts:
--   a. As an active member of workflow.teams code = 'procurement_local' (or
--      'procurement_overseas'), confirm a procurement_lines row for ANY
--      project can be inserted and updated.
--   b. As the PIC of the same project, and NOT a member of either
--      procurement team, confirm the same insert/update is refused.
--   c. As a manager who is not on either procurement team, confirm the
--      same insert/update is refused — no manager bypass exists.
--   d. As any active member, confirm procurement_lines rows still SELECT
--      normally (migration 001's blanket read policy is untouched).
--   e. Confirm no delete control exists anywhere and a direct delete
--      attempt (if tried via the API) is refused.
-- These verdicts belong to Seanghakk — see the Result doc's own numbered
-- hand-verification script.
