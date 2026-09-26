-- =============================================================================
-- ROLLBACK for migration 049 — the delete guards
-- =============================================================================
--
-- Removes the four BEFORE DELETE guards and the opt-in function, and puts
-- back the orphaned rollup function and its trigger on the archive.
--
-- AFTER THIS FILE, RECORDED WORK CAN BE DELETED AGAIN — by a cascade from a
-- floor, by a cascade from coverage, or directly — with nothing in the
-- database refusing. deleteFloor's application-level check is once again the
-- only thing standing there. That is the state 049 was written to end, so
-- running this is a deliberate step backwards, not housekeeping.
--
-- One transaction, committed once, at the end.
-- =============================================================================

begin;

drop trigger if exists progress_cells_refuse_delete_with_work on workflow.progress_cells;
drop function if exists workflow.progress_cells_refuse_delete_with_work();

drop trigger if exists shop_drawing_items_refuse_delete_with_work on workflow.shop_drawing_items;
drop function if exists workflow.shop_drawing_items_refuse_delete_with_work();

drop trigger if exists floor_sub_stages_refuse_delete_with_work on workflow.floor_sub_stages;
drop function if exists workflow.floor_sub_stages_refuse_delete_with_work();

drop trigger if exists project_floors_refuse_delete_with_work on workflow.project_floors;
drop function if exists workflow.project_floors_refuse_delete_with_work();

drop function if exists workflow.destructive_delete_allowed();

-- 049 dropped this trigger and function to make the archive inert. Putting
-- them back is what "undo 049" means, even though nothing writes the archive
-- any more so the trigger will not fire.
create or replace function workflow.recalculate_rollup_from_sub_stage()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
declare
  v_project_id uuid;
begin
  select f.project_id into v_project_id
  from workflow.project_floors f
  where f.id = new.floor_id;

  perform workflow.recalculate_project_rollup(v_project_id);
  return new;
end;
$function$;

drop trigger if exists floor_sub_stages_recalculate_rollup on workflow.floor_sub_stages;
create trigger floor_sub_stages_recalculate_rollup
  after insert or update of status on workflow.floor_sub_stages
  for each row
  execute function workflow.recalculate_rollup_from_sub_stage();

commit;
