-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 023
-- Brief: ADTECH_WF_Brief_057_Photo_Evidence_on_Progress_Updates
--
-- Single column drop, IF EXISTS-guarded so this is safe to run whether
-- migration 023 was fully applied, never applied, or already rolled back.
-- Any photo_url values on existing rows are lost on rollback — that data
-- loss is inherent to dropping the column, not a defect in this script.
-- =============================================================================

begin;

alter table workflow.progress_updates drop column if exists photo_url;

commit;
