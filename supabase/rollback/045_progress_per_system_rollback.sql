-- =============================================================================
-- ROLLBACK for migration 045 — progress per system
-- =============================================================================
--
-- Returns the database to its pre-045 shape: the per-floor model driving the
-- completion figure, qc_inspections keyed on floor_sub_stage_id, and no
-- coverage or progress-cell tables.
--
-- THIS IS MUCH SMALLER THAN IT WOULD HAVE BEEN. Staged 045 never drops
-- workflow.floor_sub_stages or qc_inspections.floor_sub_stage_id, so this
-- file does not have to rebuild them from a schema dump and hope. The old
-- rows are still sitting there. That is the single biggest reason the staged
-- version is safer: its rollback is mostly "remove what was added".
--
-- WHAT THIS DESTROYS, STATED PLAINLY. Any progress recorded against
-- workflow.progress_cells AFTER 045 was applied is lost — those rows have no
-- home in the per-floor model, because a cell knows which system it belongs
-- to and a floor_sub_stage cannot. There is no honest mapping back: choosing
-- one system's status to write onto the shared floor row is exactly the
-- information loss D096 existed to fix. So this rollback is safe immediately
-- after 045, and increasingly lossy the longer the app has been used on the
-- new model. Run the rollback check; it reports the count.
--
-- ONE TRANSACTION, COMMITTED ONCE, AT THE END. Nothing here commits early:
-- a COMMIT in the middle would leave the database half-rolled-back if a later
-- statement failed, which is worse than either state.
-- =============================================================================

begin;

-- ---- 1. the guards and triggers that hang off the new tables ---------------
-- Dropped before the tables so the intent is visible in this file rather than
-- happening silently through CASCADE. 045's own CASCADE is what cost this
-- brief migrations 047 and 048.

drop trigger if exists project_floors_extend_full_coverage on workflow.project_floors;
drop function if exists workflow.project_floors_extend_full_coverage();

drop trigger if exists project_system_floors_after_insert on workflow.project_system_floors;
drop function if exists workflow.project_system_floors_after_insert();

drop trigger if exists project_system_floors_after_update on workflow.project_system_floors;
drop function if exists workflow.project_system_floors_after_update();

drop function if exists workflow.seed_progress_cells(uuid, uuid);

-- ---- 2. qc_inspections goes back to the old key -----------------------------
-- The column is removed, so any inspection recorded against a cell after 045
-- loses its link. The rollback check counts those before they go.

alter table workflow.qc_inspections
  drop constraint if exists qc_inspections_shape_check;

alter table workflow.qc_inspections
  drop column if exists progress_cell_id;

-- Exactly the pre-045 definition, read from production on 26 Sep 2026.
alter table workflow.qc_inspections
  add constraint qc_inspections_shape_check
    check (
      (inspection_type = 'material' and floor_sub_stage_id is null)
      or (inspection_type in ('installation', 'commissioning') and floor_sub_stage_id is not null)
    );

-- ---- 3. the new tables ------------------------------------------------------
-- progress_cells first: it hangs off coverage by composite FK, so dropping
-- coverage first would need a CASCADE, and this file does not use one.

drop table if exists workflow.progress_cells;
drop table if exists workflow.project_system_floors;

-- ---- 4. the per-floor seeding comes back ------------------------------------
-- Restores workflow.seed_floor_children() and its trigger exactly as
-- migration 008 defined them, so a new floor again gets its five sub-stage
-- rows and its two project-level drawing rows.

-- Copied VERBATIM from production on 26 Sep 2026, not reconstructed. My own
-- reconstruction of this function was wrong in three ways before I read it:
-- the two inserts are in the other order, the tnc sub-stages use sequence
-- 1 and 2 rather than 4 and 5, and it ends by recomputing the rollup. A
-- rollback assembled from memory of a migration file is how a restore
-- quietly returns the wrong thing.
create or replace function workflow.seed_floor_children()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
begin
  insert into workflow.shop_drawing_items (project_id, floor_id, scope, drawing_type)
  values
    (new.project_id, new.id, 'floor', 'layout'),
    (new.project_id, new.id, 'floor', 'detail_connection');

  insert into workflow.floor_sub_stages (floor_id, stage, sub_stage, sequence)
  values
    (new.id, 'installation', 'first_fix', 1),
    (new.id, 'installation', 'second_fix', 2),
    (new.id, 'installation', 'third_fix', 3),
    (new.id, 'tnc', 'pre_commissioning', 1),
    (new.id, 'tnc', 'commissioning', 2);

  perform workflow.recalculate_project_rollup(new.project_id);
  return new;
end;
$function$;

drop trigger if exists project_floors_seed_children on workflow.project_floors;
create trigger project_floors_seed_children
  after insert on workflow.project_floors
  for each row
  execute function workflow.seed_floor_children();

-- ---- 5. the completion figure goes back to per-floor buckets -----------------
-- The pre-045 body, read from production on 26 Sep 2026 rather than
-- reconstructed from migration 008, because later migrations had already
-- amended it and the repo file is not what production was running.
--
-- SECURITY DEFINER and the pinned search_path are part of that definition.
-- The function is exposed as a PostgREST RPC, so without them a caller
-- computes the figure through their own RLS view and gets a smaller number.

create or replace function workflow.compute_project_rollup_percent(p_project_id uuid)
returns integer
language sql
stable
security definer
set search_path = workflow, pg_temp
as $function$
  with items as (
    select 'project'::text as bucket_key, status
    from workflow.shop_drawing_items
    where project_id = p_project_id and scope = 'project'

    union all

    select sd.floor_id::text, sd.status
    from workflow.shop_drawing_items sd
    join workflow.project_floors f on f.id = sd.floor_id
    where f.project_id = p_project_id and sd.scope = 'floor'

    union all

    select fs.floor_id::text, fs.status
    from workflow.floor_sub_stages fs
    join workflow.project_floors f on f.id = fs.floor_id
    where f.project_id = p_project_id
  ),
  bucket_pct as (
    select
      bucket_key,
      avg(case status when 'done' then 100 when 'in_progress' then 50 else 0 end) as pct
    from items
    group by bucket_key
  )
  select round(avg(pct))::integer from bucket_pct;
$function$;

comment on table workflow.floor_sub_stages is
  'Migration 008. One status per floor per sub-stage. Restored to service by
   the 045 rollback: 045 had frozen it as an archive and stopped writing to
   it, and this puts the seeding trigger back.';

commit;
