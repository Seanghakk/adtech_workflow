-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 025
-- Brief: ADTECH_WF_Brief_075_Project_Targets_For_Progress_Chart_Investigate_And_Draft
--
-- Reverses migration 025 in dependency order (trigger before the function
-- it calls, table before the column it references nothing else touches).
-- Every DROP is IF EXISTS-guarded, safe to run whether migration 025 was
-- fully applied, partially applied, or already rolled back.
--
-- DATA LOSS, INHERENT NOT A DEFECT: any target_date values on
-- workflow.projects and every row in workflow.project_milestones are
-- lost. That is what dropping a column / dropping a table means, same as
-- every other rollback file in this project.
-- =============================================================================

begin;

drop trigger if exists project_milestone_before_write on workflow.project_milestones;
drop function if exists workflow.project_milestone_before_write();

drop table if exists workflow.project_milestones;

drop function if exists workflow.set_project_target_date(uuid, date);

alter table workflow.projects drop column if exists target_date;

commit;
