-- =============================================================================
-- 049 — Recorded work cannot be deleted, enforced by the database
-- =============================================================================
--
-- Two things, both found by auditing what migration 045 took with it.
--
-- -----------------------------------------------------------------------------
-- 1. THE RULE THE DATABASE STOPPED ENFORCING
-- -----------------------------------------------------------------------------
-- Before 045, every FK into project_floors was ON DELETE RESTRICT. Since a
-- floor was auto-seeded with child rows the moment it was created, the
-- DATABASE made a floor with recorded work undeletable. Full stop.
--
-- 045 made project_system_floors.floor_id ON DELETE CASCADE, and
-- progress_cells hangs off coverage by a cascading composite FK. So deleting
-- a floor began to SUCCEED, taking every system's recorded work on that
-- floor with it, silently. deleteFloor's own check still refused, but that
-- check had gone from a courtesy to the only thing standing there — and its
-- comment still told the reader the database was doing the protecting.
--
-- That is the second time in this brief that a rule lived only in app code
-- while the database had quietly stopped enforcing it (the first was the
-- progress_cells write policy, migration 048). A rule enforced only in
-- application code is one refactor away from being gone.
--
-- -----------------------------------------------------------------------------
-- WHERE THE GUARD GOES, AND WHY NOT ON project_floors ALONE
-- -----------------------------------------------------------------------------
-- The obvious move is ON DELETE RESTRICT again, or a BEFORE DELETE trigger on
-- project_floors. BOTH ARE DEFEATED BY ORDERING, and the app already uses
-- that order: deleteFloor removes coverage, then cells, then drawing items,
-- and only then the floor. By the time a floor-level check runs, every row it
-- would have looked at is already gone, and it passes.
--
-- So the guard goes where the work actually lives — on the rows that ARE the
-- recorded work. Then no route can destroy it: not a direct delete, not the
-- cascade from coverage, not the cascade from a floor, and not a reordering
-- of the three.
--
-- project_floors gets a check too, but only so the common case fails with a
-- message naming the floor rather than a cascade error. The two row-level
-- guards are the actual enforcement.
--
-- -----------------------------------------------------------------------------
-- 2. AN ORPHAN 045 LEFT BEHIND
-- -----------------------------------------------------------------------------
-- CASCADE drops triggers, not functions, so
-- workflow.recalculate_rollup_from_sub_stage() outlived the trigger that
-- called it. Nothing calls it now. It resolves a floor straight to its
-- project, which is the pre-D096 model — harmless until someone attaches it
-- to something, at which point it would recompute rollups on the old
-- assumption that a floor has one status.
--
-- -----------------------------------------------------------------------------
-- THE ESCAPE HATCH, DELIBERATE AND EXPLICIT
-- -----------------------------------------------------------------------------
-- These guards refuse EVERYONE, including postgres — that is the point, and
-- it is what ON DELETE RESTRICT did before. For genuine maintenance there is
-- one documented way through, which cannot be reached by accident:
--
--     begin;
--     set local workflow.allow_destructive_delete = 'on';
--     ...
--     commit;
--
-- SET LOCAL, so it dies with the transaction. No application code sets it and
-- none should; if app code ever needs it, the rule is wrong, not the caller.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Shared: is this transaction deliberately allowed to destroy records?
-- -----------------------------------------------------------------------------

create or replace function workflow.destructive_delete_allowed()
returns boolean
language plpgsql
stable
as $function$
begin
  -- 049 marker: destructive deletes require an explicit opt-in
  -- The second argument makes a missing setting return null rather than
  -- raising, so the common case (nobody set it) is simply "no".
  return coalesce(
    nullif(current_setting('workflow.allow_destructive_delete', true), ''),
    'off'
  ) = 'on';
end;
$function$;

comment on function workflow.destructive_delete_allowed() is
  'Migration 049. True only when a transaction has deliberately run
   "set local workflow.allow_destructive_delete = ''on''". The guards in this
   migration refuse every role without it, exactly as the ON DELETE RESTRICT
   constraints did before migration 045 removed them.';

-- -----------------------------------------------------------------------------
-- Guard 1 — a progress cell carrying work cannot be deleted
-- -----------------------------------------------------------------------------

create or replace function workflow.progress_cells_refuse_delete_with_work()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
declare
  v_inspections int;
  v_floor_label text;
begin
  -- 049 marker: a progress cell carrying work cannot be deleted
  if workflow.destructive_delete_allowed() then
    return old;
  end if;

  -- SECURITY DEFINER matters here. A guard that reads through the caller's
  -- RLS would see nothing for a user who cannot select the row, and would
  -- then cheerfully allow the delete. The check must see everything.
  select count(*) into v_inspections
    from workflow.qc_inspections qi
   where qi.progress_cell_id = old.id;

  if old.status <> 'not_started'
     or old.reason is not null
     or old.photo_url is not null
     or v_inspections > 0 then

    select f.label into v_floor_label
      from workflow.project_floors f
     where f.id = old.floor_id;

    raise exception
      using errcode = 'restrict_violation',
            message = format(
              'Floor %s has recorded progress that cannot be deleted.',
              coalesce(v_floor_label, '?')),
            detail  = format(
              'progress cell %s: status %s, reason %s, photo %s, inspections %s',
              old.id, old.status,
              case when old.reason is null then 'none' else 'set' end,
              case when old.photo_url is null then 'none' else 'set' end,
              v_inspections),
            hint    = 'Take the floor out of the system''s coverage instead. '
                      'That keeps the records and removes them from progress, '
                      'and putting the floor back restores them (v7.4 §6.5).';
  end if;

  return old;
end;
$function$;

comment on function workflow.progress_cells_refuse_delete_with_work() is
  'Migration 049. Restores, at the row that actually holds the work, the
   protection migration 045 removed when it turned the floor foreign keys
   into CASCADE. Deliberately NOT a check on project_floors alone: the app
   deletes coverage and cells before the floor, so a floor-level check runs
   after the evidence is gone. This one cannot be reordered around.';

create trigger progress_cells_refuse_delete_with_work
  before delete on workflow.progress_cells
  for each row
  execute function workflow.progress_cells_refuse_delete_with_work();

-- -----------------------------------------------------------------------------
-- Guard 2 — a floor drawing item carrying work cannot be deleted
-- -----------------------------------------------------------------------------

create or replace function workflow.shop_drawing_items_refuse_delete_with_work()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
begin
  -- 049 marker: a drawing item carrying work cannot be deleted
  if workflow.destructive_delete_allowed() then
    return old;
  end if;

  if old.status <> 'not_started' then
    raise exception
      using errcode = 'restrict_violation',
            message = 'This drawing item has recorded progress and cannot be deleted.',
            detail  = format('shop drawing item %s: status %s', old.id, old.status),
            hint    = 'Recorded progress is not removed by deleting rows.';
  end if;

  return old;
end;
$function$;

create trigger shop_drawing_items_refuse_delete_with_work
  before delete on workflow.shop_drawing_items
  for each row
  execute function workflow.shop_drawing_items_refuse_delete_with_work();

-- -----------------------------------------------------------------------------
-- Guard 3 — the readable error, for the case people actually hit
-- -----------------------------------------------------------------------------
-- Not the enforcement. Guards 1 and 2 are. This exists so that deleting a
-- floor that still has its work fails saying so, rather than surfacing
-- whichever cascade happened to trip first.

create or replace function workflow.project_floors_refuse_delete_with_work()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
declare
  v_cells int;
  v_drawings int;
  v_material int;
begin
  -- 049 marker: a floor with recorded work cannot be deleted
  if workflow.destructive_delete_allowed() then
    return old;
  end if;

  select count(*) into v_cells
    from workflow.progress_cells c
   where c.floor_id = old.id
     and (c.status <> 'not_started' or c.reason is not null or c.photo_url is not null);

  select count(*) into v_drawings
    from workflow.shop_drawing_items s
   where s.floor_id = old.id
     and s.status <> 'not_started';

  select count(*) into v_material
    from workflow.qc_inspection_floors qif
   where qif.floor_id = old.id;

  if v_cells > 0 or v_drawings > 0 or v_material > 0 then
    raise exception
      using errcode = 'restrict_violation',
            message = format(
              'Floor %s has recorded progress or QC inspections and cannot be removed.',
              old.label),
            detail  = format(
              'cells with work: %s; drawing items with work: %s; material inspections: %s',
              v_cells, v_drawings, v_material),
            hint    = 'Take the floor out of each system''s coverage instead '
                      '(v7.4 §6.5) — that keeps the records.';
  end if;

  return old;
end;
$function$;

create trigger project_floors_refuse_delete_with_work
  before delete on workflow.project_floors
  for each row
  execute function workflow.project_floors_refuse_delete_with_work();

-- -----------------------------------------------------------------------------
-- The orphan
-- -----------------------------------------------------------------------------
-- No trigger references it (verified against the live schema before writing
-- this). Dropped without CASCADE deliberately: if anything DOES depend on it,
-- this migration should fail loudly rather than quietly remove that too.

drop function if exists workflow.recalculate_rollup_from_sub_stage();

commit;
