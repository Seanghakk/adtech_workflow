-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 024
-- Brief: ADTECH_WF_Brief_059_Photo_Evidence_On_Floor_SubStage_Completion
--
-- Single column drop, IF EXISTS-guarded so this is safe to run whether
-- migration 024 was fully applied, never applied, or already rolled back.
-- Any photo_url values on existing rows are lost on rollback — that data
-- loss is inherent to dropping the column, not a defect in this script.
-- =============================================================================

begin;

alter table workflow.floor_sub_stages drop column if exists photo_url;

commit;
