-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 008
-- Brief: ADTECH_WF_Brief_007_Floor_Stage_Tracking_And_Handover +
-- Amendment A
--
-- Amendment §5.1 calls running THIS FILE, against a non-production
-- target, before applying migration 008 to prod, "a requirement, not a
-- suggestion" — the first rollback this project will have ever actually
-- executed, after seven prior migrations each shipped one untested. Run
-- it there first. This session could not run it itself (no psql/
-- DATABASE_URL/SQL-editor access, the same standing limitation every
-- migration in this repo has had since Brief 001) — see migration 008's
-- own header for the full reasoning on why applying without that test
-- run is still lower-risk than it looks (every existing project has zero
-- floor rows, so every trigger/function this reverses is unreachable for
-- any of them today).
--
-- Reverses, in dependency order: the amended progress_updates trigger
-- function (back to migration 003's exact text), the new triggers and
-- functions, workflow.projects' two new columns, then the eight new
-- tables (dropped in FK-safe order — data goes with them; no separate
-- DELETE needed).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Revert workflow.bump_last_meaningful_movement() to migration 003's
--    exact version — no percent_override_at reference, since the column
--    it would write to is dropped later in this same file.
-- -----------------------------------------------------------------------------

create or replace function workflow.bump_last_meaningful_movement()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if new.subject_type = 'project' and new.new_percent is not null then
    update workflow.projects
    set percent_complete = new.new_percent,
        last_meaningful_movement_at = case
          when new.meets_threshold then new.recorded_at
          else last_meaningful_movement_at
        end,
        updated_at = now()
    where id = new.subject_id;
  end if;
  return new;
end;
$$;

comment on function workflow.bump_last_meaningful_movement() is
  'AFTER INSERT on workflow.progress_updates. Brief 002/§3/§4: this is '
  'the ONLY write path to projects.percent_complete — the app never '
  'issues a direct UPDATE (projects has no UPDATE policy, by design). '
  'percent_complete is set to new_percent UNCONDITIONALLY, every insert, '
  'whatever the delta (rule 1). last_meaningful_movement_at is bumped '
  'ONLY when meets_threshold is true (Brief 001 §4.6, rule 4). No-op for '
  'subject_type = ''item''. Restored to this exact text by migration '
  '008''s rollback.';

-- Trigger itself unchanged throughout (same name/timing/function) —
-- re-stated for a complete standalone record, same as the migration did.
drop trigger if exists progress_updates_bump_movement on workflow.progress_updates;

create trigger progress_updates_bump_movement
after insert on workflow.progress_updates
for each row
execute function workflow.bump_last_meaningful_movement();

-- -----------------------------------------------------------------------------
-- 2. Drop the new triggers and their functions.
-- -----------------------------------------------------------------------------

drop trigger if exists shop_drawing_items_recalculate_rollup on workflow.shop_drawing_items;
drop trigger if exists floor_sub_stages_recalculate_rollup on workflow.floor_sub_stages;
drop trigger if exists project_floors_seed_children on workflow.project_floors;

drop function if exists workflow.recalculate_rollup_from_shop_drawing();
drop function if exists workflow.recalculate_rollup_from_sub_stage();
drop function if exists workflow.seed_floor_children();
drop function if exists workflow.recalculate_project_rollup(uuid);
drop function if exists workflow.compute_project_rollup_percent(uuid);

-- -----------------------------------------------------------------------------
-- 3. workflow.projects — drop the two additive columns (and their check
--    constraint, dropped implicitly with the column it's on).
-- -----------------------------------------------------------------------------

alter table workflow.projects
  drop column if exists percent_calculated,
  drop column if exists percent_override_at;

-- -----------------------------------------------------------------------------
-- 4. Drop the eight new tables, in FK-dependency order (children before
--    parents). Data goes with them — no separate DELETE needed.
-- -----------------------------------------------------------------------------

drop table if exists workflow.qc_inspection_floors;
drop table if exists workflow.qc_inspections;
drop table if exists workflow.checklist_items;
drop table if exists workflow.checklist_templates;
drop table if exists workflow.project_handover_items;
drop table if exists workflow.floor_sub_stages;
drop table if exists workflow.shop_drawing_items;
drop table if exists workflow.project_floors;

commit;
