-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 011
-- Brief: ADTECH_WF_Brief_015_Screen_1a_Post_A_Request §2
--
-- REQUIRED before migration 011 is applied to prod, per this repo's own
-- process (see migration 009/010's rollback): run this against the
-- throwaway Supabase project that already carries migrations 001-010
-- (Seanghakk runs it — this session has no psql/DATABASE_URL/SQL-editor
-- access).
--
-- Reverses the single policy this migration added. No grant to revoke —
-- migration 011 added none (see its own header, §2.3).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop policy if exists requests_insert on workflow.requests;

commit;
