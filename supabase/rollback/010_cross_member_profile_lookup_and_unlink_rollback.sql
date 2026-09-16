-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 010
-- Briefs: ADTECH_WF_Brief_013_Member_Name_Display_Everywhere,
--         ADTECH_WF_Brief_014_Reactivate_Unlink_And_Telegram §3
--
-- REQUIRED before migration 010 is applied to prod, per this repo's own
-- process (see migration 009's rollback): run this against the throwaway
-- Supabase project that already carries migrations 001-009 (Seanghakk
-- runs it — this session has no psql/DATABASE_URL/SQL-editor access).
--
-- Reverses, in dependency order: the members_delete policy, the DELETE
-- grant, then the get_user_profiles function.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop policy if exists members_delete on workflow.members;

revoke delete on workflow.members from authenticated;

drop function if exists workflow.get_user_profiles(uuid[]);

commit;
