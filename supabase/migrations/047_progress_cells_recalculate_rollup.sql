-- =============================================================================
-- 047 — Recording progress recalculates the completion figure again
-- =============================================================================
--
-- A REGRESSION MIGRATION 045 INTRODUCED, found by rendering the page rather
-- than by any type or test.
--
-- workflow.floor_sub_stages carried a trigger that called
-- recalculate_project_rollup() whenever a sub-stage's status changed. 045
-- dropped that table with CASCADE, which took the trigger with it, and
-- nothing recreated it on progress_cells. So after 045 the rollup function
-- was correct and NOTHING CALLED IT: projects.percent_calculated froze at
-- whatever it last held, and on a new project stayed NULL — the update
-- screen's Complete block renders an em dash for that.
--
-- Neither tsc nor the test suite could see it. The types check shapes, and
-- the tests check the arithmetic of the function itself, which was never
-- wrong. What broke was that nobody asked it the question any more, and the
-- only way to find that was to record progress and look at the figure.
--
-- The shop_drawing_items trigger survived because that table was untouched,
-- which is why drawings still moved the figure and sub-stages silently did
-- not — the worst shape for a bug like this, because the figure kept
-- changing and looked alive.
-- =============================================================================

begin;

create or replace function workflow.recalculate_rollup_from_progress_cell()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
declare
  v_project_id uuid;
begin
  -- 047 marker: progress recalculates the rollup
  -- A cell reaches its project through its system, not through its floor:
  -- the floor is shared by every system, and the system is what the cell
  -- belongs to.
  select ps.project_id into v_project_id
    from workflow.project_systems ps
   where ps.id = coalesce(new.project_system_id, old.project_system_id);

  if v_project_id is not null then
    perform workflow.recalculate_project_rollup(v_project_id);
  end if;

  return coalesce(new, old);
end;
$function$;

comment on function workflow.recalculate_rollup_from_progress_cell() is
  'Migration 047 / Brief 106b. Replaces the trigger that lived on
   workflow.floor_sub_stages and was dropped with that table by migration
   045. Fires on INSERT, UPDATE and DELETE: coverage changes create and
   remove cells in bulk (§6.5), and each of those changes the denominator
   as surely as a status change does.';

-- DELETE matters as much as UPDATE here. Removing a floor from a system
-- takes its cells out of the figure's denominator, and §6.5 lets that
-- happen from the coverage editor without any status ever changing.
create trigger progress_cells_recalculate_rollup
  after insert or update or delete on workflow.progress_cells
  for each row
  execute function workflow.recalculate_rollup_from_progress_cell();

-- Bring every project back into line in one pass. This is NOT a backfill of
-- lost data — it recomputes a derived figure from rows that are all still
-- there, which is the one kind of catch-up that carries no risk of
-- inventing history.
update workflow.projects p
   set percent_calculated = workflow.compute_project_rollup_percent(p.id);

commit;
