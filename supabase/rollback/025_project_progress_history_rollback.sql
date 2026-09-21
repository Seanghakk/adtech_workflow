-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 025
-- Brief: ADTECH_WF_Brief_077_Revise_PR48_Progress_History_And_Start_Date
--
-- Drops the trigger before the function it calls, then the table (which
-- also drops its own index and RLS policy as dependent objects — no
-- CASCADE needed, nothing outside this table references it). Every DROP
-- is IF EXISTS-guarded, safe whether migration 025 was fully applied,
-- partially applied, or already rolled back.
--
-- recalculate_project_rollup() and bump_last_meaningful_movement() were
-- never touched by migration 025 — nothing to restore for either.
--
-- DATA LOSS, INHERENT NOT A DEFECT: every row in
-- workflow.project_progress_history (including both backfills) is lost.
-- That is what dropping the table means, same as every other rollback
-- file in this project.
-- =============================================================================

begin;

drop trigger if exists record_project_progress_history on workflow.projects;
drop function if exists workflow.record_project_progress_history();

drop table if exists workflow.project_progress_history;

commit;
