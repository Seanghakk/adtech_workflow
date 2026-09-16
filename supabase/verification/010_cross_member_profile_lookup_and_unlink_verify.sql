-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 010
-- Briefs: ADTECH_WF_Brief_013_Member_Name_Display_Everywhere,
--         ADTECH_WF_Brief_014_Reactivate_Unlink_And_Telegram §3
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 010_cross_member_profile_lookup_and_unlink.sql — and after having run
-- the rollback against a non-production target first.
--
-- STANDING TRAP (carried forward from Brief 014 §0): these queries go
-- through pg_policies (the view), never the raw pg_policy catalog — a
-- block run in the SQL editor executes as table owner and bypasses RLS
-- entirely, so nothing here can PROVE a policy blocks anyone or that the
-- SECURITY DEFINER function actually returns cross-user rows a plain
-- anon-key query could not. The real test is a second account, through
-- the app (block 4 below, and the hand-verification scripts in the
-- Result docs).
-- =============================================================================

-- 1. The function exists, SECURITY DEFINER, correct return shape.
-- Expect 1 row, prosecdef = true.
select proname, prosecdef, pg_get_function_result(oid) as returns
from pg_proc
join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
where pg_namespace.nspname = 'workflow'
  and proname = 'get_user_profiles';


-- 2. members_delete exists, on workflow.members, is_manager()-gated, and
--    is the ONLY new policy this migration added (members_select/insert/
--    update from migration 001 are untouched).
-- Expect 4 rows total for workflow.members (select/insert/update/delete),
-- and the delete row's qual mentions is_manager.
select policyname, cmd, qual
from pg_policies
where schemaname = 'workflow' and tablename = 'members'
order by cmd;


-- 3. The DELETE grant landed on workflow.members, and (unchanged from
--    migration 009) on no table it didn't already cover.
-- Expect workflow.members now appears alongside migration 009's six.
select table_name
from information_schema.role_table_grants
where table_schema = 'workflow'
  and grantee = 'authenticated'
  and privilege_type = 'DELETE'
order by table_name;


-- 4. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as two real accounts:
--   a. Sign in as Member A. Confirm /users, the dashboard, sales
--      monitoring, and load all show Member B's real full_name (not a
--      raw id, not "No profile on file") wherever B is an owner/PIC.
--      This is the actual regression test for Brief 013 — it cannot pass
--      by looking only at your own account, since RLS's self-read policy
--      already made that case work before this migration.
--   b. As a manager, deactivate then reactivate a test member (Brief 014
--      §2) — confirm the row goes Inactive then Active, staying visible
--      throughout.
--   c. As a manager, Unlink a test member who holds no project as PIC
--      and has no progress_updates rows. Confirm: the members row is
--      gone, the underlying account reappears in the unlinked-account
--      queue, and it can be linked again.
--   d. As a manager, Unlink a test member who DOES hold a project as
--      PIC. Confirm the confirmation names that project count before the
--      action, and afterward that project's PIC field still shows
--      whatever this round's UI does for it (un-updatable until
--      reassigned — the pic_id value itself is untouched by this
--      migration, matching Deactivate's own existing behaviour).
--   e. As a non-manager member, confirm Unlink/Reactivate controls are
--      not reachable at all (no UI, and the underlying delete/update is
--      refused if attempted directly).
-- These verdicts belong to Seanghakk — see the Result docs' own numbered
-- hand-verification scripts.
