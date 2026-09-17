-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 016
-- Brief: ADTECH_WF_Brief_021_Screens_1c_And_1e_Triage_And_Request_Detail §4
--
-- REQUIRED before migration 016 is applied to prod, per this repo's own
-- process (see migrations 009/010/011/012/014/015's own rollback files):
-- run this against the throwaway Supabase project that already carries
-- migrations 001-015 (Seanghakk runs it — this session has no psql/
-- DATABASE_URL/SQL-editor access).
--
-- Reverses the one new policy. Does not touch requests_select or
-- requests_insert (migrations 001/011, untouched by this migration) and
-- does not touch workflow.is_member() (migration 001's own helper, reused
-- here, not modified).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop policy if exists requests_update on workflow.requests;

commit;
