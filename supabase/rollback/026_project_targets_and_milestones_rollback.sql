-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 026
-- Brief: ADTECH_WF_Brief_077_Revise_PR48_Progress_History_And_Start_Date
--
-- Reverses migration 026 in dependency order: the milestones trigger
-- before the function it calls (which itself calls
-- project_effective_start_date, so that function is dropped after);
-- the milestones table (drops its own policies/index/constraints as
-- dependent objects); set_project_dates; project_effective_start_date;
-- finally both new columns on workflow.projects. Every DROP is IF
-- EXISTS-guarded, safe whether migration 026 was fully applied,
-- partially applied, or already rolled back.
--
-- Does NOT touch migration 025 (project_progress_history) — that is a
-- separate migration with its own separate rollback file, deliberately
-- independent per Brief 077 §2's own "nothing in 025 may depend on
-- anything in 026" instruction (and the reverse holds too: this
-- rollback does not assume 025 was ever applied or rolled back).
--
-- DATA LOSS, INHERENT NOT A DEFECT: any start_date/target_date values on
-- workflow.projects and every row in workflow.project_milestones are
-- lost. That is what dropping a column / dropping a table means, same
-- as every other rollback file in this project.
-- =============================================================================

begin;

drop trigger if exists project_milestone_before_write on workflow.project_milestones;
drop function if exists workflow.project_milestone_before_write();

drop table if exists workflow.project_milestones;

drop function if exists workflow.set_project_dates(uuid, date, date);

drop function if exists workflow.project_effective_start_date(uuid);

alter table workflow.projects
  drop column if exists start_date,
  drop column if exists target_date;

commit;
