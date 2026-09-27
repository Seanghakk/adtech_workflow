-- =============================================================================
-- 050 — The seeder gets its definer rights back, and a system cannot be
--       deleted out from under recorded work
-- =============================================================================
--
-- -----------------------------------------------------------------------------
-- 1. WHY "SAVE COVERAGE" DID NOTHING ON PRODUCTION
-- -----------------------------------------------------------------------------
-- Saving coverage failed for EVERY user, silently, from the moment 048
-- landed. Reproduced on rollback-test against production's exact policy set:
--
--   ERROR: new row violates row-level security policy for table "progress_cells"
--   CONTEXT: ... seed_progress_cells ... project_system_floors_after_insert
--
-- workflow.seed_progress_cells inserts all five sub-stages at once — three
-- 'installation' and two 'tnc' — and migration 045 declared it WITHOUT
-- SECURITY DEFINER, so it runs as the caller. Migration 048 then restored
-- the original stage-keyed write policy, under which a project_management
-- member may insert only 'installation' cells and a tnc member only 'tnc'.
--
-- No single team can insert both stages. So the seed always failed, the
-- trigger threw, and the coverage insert rolled back. The Vercel log showed
-- the POST at info level because the action caught the error and returned it
-- as state — and the message rendered inside a broken layout, where nobody
-- could see it. "Nothing happens" was two defects stacked.
--
-- 048 WAS RIGHT. The stage-keyed policy is the rule the pre-D096 table
-- actually had, and this migration does not touch it. What 045 dropped was
-- the seeder's definer rights: workflow.seed_floor_children(), the function
-- it replaced, was SECURITY DEFINER with a pinned search_path on production.
-- Read from production before writing this, not assumed.
--
-- THAT IS THE THIRD SECURITY PROPERTY MIGRATION 045 SILENTLY DROPPED:
--   * the progress_cells write policy         — restored by 048
--   * compute_project_rollup_percent's definer — restored in 045 itself
--   * seed_progress_cells' definer             — here
--
-- Three of a kind is a pattern, not bad luck. The verification file now
-- asserts SECURITY DEFINER and a pinned search_path on every function 045
-- touches, so a fourth cannot happen quietly.
--
-- WHY DEFINER IS THE RIGHT ANSWER HERE, and not a loosening. The gate on
-- creating coverage is workflow.project_system_floors' own PIC-gated policy,
-- and it still applies in full: a person who may not add coverage still
-- cannot. What definer fixes is the SECOND-ORDER write — the cells that
-- coverage implies — which is bookkeeping the database owes the row, not a
-- separate act by the user. The five sub-stages are not the caller's choice;
-- they are what a covered (system, floor) pair MEANS. Checking the caller's
-- team on them asks the wrong question, and 048 never intended to: its
-- policy is about a person RECORDING PROGRESS on a cell, not about a cell
-- existing.
--
-- -----------------------------------------------------------------------------
-- 2. A SYSTEM CANNOT BE DELETED OUT FROM UNDER RECORDED WORK
-- -----------------------------------------------------------------------------
-- v7.4 §6.5 says nothing about deleting a system, so the RULE here is the
-- one given for this work and not one invented from silence: a system may be
-- deleted only when it has no recorded work and no imported BOQ lines.
--
-- It is enforced in the DATABASE, in migration 049's shape, because
-- project_systems -> project_system_floors is ON DELETE CASCADE and coverage
-- -> progress_cells is another, so deleting a system takes its coverage and
-- every cell with it. 049's cell guard would already refuse that, but the
-- error would name a cell nobody was looking at. This refuses at the system
-- and says which system and why.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Definer rights for the functions migration 045 created
-- -----------------------------------------------------------------------------
-- seed_progress_cells is the one that was breaking. The three trigger
-- wrappers get the same treatment for the same reason its predecessor had
-- it: they write on the database's behalf, after the gate on the parent row
-- has already been passed, and a pinned search_path is not optional on a
-- definer function.

create or replace function workflow.seed_progress_cells(p_project_system_id uuid, p_floor_id uuid)
returns void
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
begin
  -- 045 marker: five sub-stages seeded per covered system and floor
  -- 050 marker: seeded with definer rights, as seed_floor_children had
  insert into workflow.progress_cells (project_system_id, floor_id, stage, sub_stage, sequence)
  values
    (p_project_system_id, p_floor_id, 'installation', 'first_fix', 1),
    (p_project_system_id, p_floor_id, 'installation', 'second_fix', 2),
    (p_project_system_id, p_floor_id, 'installation', 'third_fix', 3),
    (p_project_system_id, p_floor_id, 'tnc', 'pre_commissioning', 4),
    (p_project_system_id, p_floor_id, 'tnc', 'commissioning', 5)
  on conflict (project_system_id, floor_id, stage, sub_stage) do nothing;
end;
$function$;

comment on function workflow.seed_progress_cells(uuid, uuid) is
  'Migration 045, definer rights restored by 050. The five sub-stages, seeded
   once per covered (system, floor). SECURITY DEFINER because the cells are
   what a covered pair MEANS, not a separate act by the caller — 048''s
   stage-keyed policy governs a person recording progress, and applying it to
   the seed made coverage unsaveable by anyone. Do not remove it again.';

create or replace function workflow.project_system_floors_after_insert()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
begin
  -- 045 marker: coverage creates cells
  perform workflow.seed_progress_cells(new.project_system_id, new.floor_id);
  return new;
end;
$function$;

create or replace function workflow.project_system_floors_after_update()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
begin
  -- 045 marker: restoring coverage restores the same cells
  if old.removed_at is not null and new.removed_at is null then
    perform workflow.seed_progress_cells(new.project_system_id, new.floor_id);
  end if;
  return new;
end;
$function$;

create or replace function workflow.project_floors_extend_full_coverage()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
declare
  v_floor_count integer;
begin
  -- 045 marker: a new floor joins only the systems that covered every floor
  select count(*) into v_floor_count
    from workflow.project_floors f
   where f.project_id = new.project_id
     and f.id <> new.id;

  insert into workflow.project_system_floors (project_system_id, floor_id, source)
  select ps.id, new.id, 'manual'
    from workflow.project_systems ps
   where ps.project_id = new.project_id
     and v_floor_count > 0
     and (
       select count(*) from workflow.project_system_floors psf
        where psf.project_system_id = ps.id
          and psf.removed_at is null
          and psf.floor_id <> new.id
     ) = v_floor_count
  on conflict (project_system_id, floor_id) do nothing;

  return new;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 2. A system carrying work, or named by imported BOQ lines, cannot be deleted
-- -----------------------------------------------------------------------------

create or replace function workflow.project_systems_refuse_delete_with_work()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $function$
declare
  v_cells int;
  v_inspections int;
  v_boq_lines int;
  v_packages int;
begin
  -- 050 marker: a system carrying work or BOQ lines cannot be deleted
  if workflow.destructive_delete_allowed() then
    return old;
  end if;

  -- Recorded work, by the same definition migration 049 uses for a cell:
  -- a status that has moved, a reason, a photo, or an inspection.
  select count(*) into v_cells
    from workflow.progress_cells c
   where c.project_system_id = old.id
     and (c.status <> 'not_started' or c.reason is not null or c.photo_url is not null);

  select count(*) into v_inspections
    from workflow.qc_inspections qi
    join workflow.progress_cells c on c.id = qi.progress_cell_id
   where c.project_system_id = old.id;

  -- Imported BOQ lines. These link to a system BY NAME, not by id
  -- (shop_drawing_boq_lines.system_type = project_systems.name within the
  -- project) — which is the same coupling that makes renaming a system
  -- consequential, and why the rename copy has to say so.
  select count(*) into v_boq_lines
    from workflow.shop_drawing_boq_lines l
   where l.project_id = old.project_id
     and l.system_type = old.name;

  -- NOT ONE OF THE TWO RULES GIVEN, AND FLAGGED AS SUCH IN THE RESULT.
  -- material_approval_packages.system_id is ON DELETE SET NULL, so deleting
  -- a system would silently blank which system a material approval was for.
  -- That is the quiet kind of loss this brief has spent itself on, so it
  -- refuses here too. Say the word and this clause comes out.
  select count(*) into v_packages
    from workflow.material_approval_packages p
   where p.system_id = old.id;

  if v_cells > 0 or v_inspections > 0 or v_boq_lines > 0 or v_packages > 0 then
    raise exception
      using errcode = 'restrict_violation',
            message = format(
              'System %s cannot be deleted: it has recorded work or is named by other records.',
              old.name),
            detail  = format(
              'cells with work: %s; inspections: %s; imported BOQ lines: %s; material approval packages: %s',
              v_cells, v_inspections, v_boq_lines, v_packages),
            hint    = 'Take its floors out of coverage instead — that keeps the '
                      'records and removes them from progress (v7.4 §6.5).';
  end if;

  return old;
end;
$function$;

drop trigger if exists project_systems_refuse_delete_with_work on workflow.project_systems;
create trigger project_systems_refuse_delete_with_work
  before delete on workflow.project_systems
  for each row
  execute function workflow.project_systems_refuse_delete_with_work();

comment on function workflow.project_systems_refuse_delete_with_work() is
  'Migration 050. v7.4 §6.5 does not describe deleting a system, so this
   enforces the rule given rather than one inferred from silence: no recorded
   work and no imported BOQ lines. In the database, not the app, because
   project_systems cascades to coverage and coverage cascades to cells — an
   application check is one refactor away from letting a delete take all
   three.';

commit;
