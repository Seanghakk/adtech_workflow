-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 014
-- Brief: ADTECH_WF_Brief_019_Screen_2c_Procurement_Line §3
--
-- REQUIRED before migration 014 is applied to prod, per this repo's own
-- process (see migrations 009/010/011/012's own rollback files): run this
-- against the throwaway Supabase project that already carries migrations
-- 001-013 (Seanghakk runs it — this session has no psql/DATABASE_URL/
-- SQL-editor access).
--
-- Reverses both new policies. Does not touch procurement_lines_select
-- (migration 001, untouched by this migration) and does not touch
-- workflow.current_team() (migration 001's own helper, reused here, not
-- modified).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop policy if exists procurement_lines_update on workflow.procurement_lines;
drop policy if exists procurement_lines_insert on workflow.procurement_lines;

commit;
