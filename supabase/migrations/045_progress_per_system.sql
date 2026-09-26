-- =============================================================================
-- 045 — Progress per system (Brief 106 / v7.4 D096, schema items 17a 15–20)
-- =============================================================================
--
-- Progress is recorded per floor today: five sub-stages, one status each,
-- covering every system on that floor at once. When the CCTV crew has finished
-- cabling on L07 and the access control crew has not started, someone has to
-- pick one status for two realities, and whatever they pick is wrong for one
-- team. The mandatory reason then records one story where there are two.
--
-- After this migration a cell is ONE SYSTEM, ONE FLOOR, ONE SUB-STAGE, and each
-- system carries the floors it covers.
--
-- THIS MIGRATION IS STAGED. IT DESTROYS NOTHING. Read this before changing it.
--
-- The first version dropped workflow.floor_sub_stages and
-- qc_inspections.floor_sub_stage_id outright, on the strength of 17a item 18
-- — "everything in the app today is test data". IT FAILED ON PRODUCTION, and
-- the failure was the smaller half of the problem.
--
-- Measured on production afterwards: floor_sub_stages held 30 rows, FOUR OF
-- THEM CARRYING RECORDED WORK, and a QC inspection pointed into it. 17a item
-- 18 was true of rollback-test and false of production, and I had written it
-- into this file as though it were a fact about the system. A migration does
-- not get to delete work because a design note said there would not be any.
--
-- So now:
--   * the old table and the old column STAY, as a frozen archive that
--     nothing writes to (section 6);
--   * the inspection constraint accepts EITHER model while the app crosses
--     over (section 5);
--   * existing projects get coverage, so nobody opens the app to a blank
--     matrix (section 9);
--   * migration 050 re-points the archived rows once coverage exists, and
--     only then drops anything.
--
-- Every trigger here is dropped-if-exists before being created, so this file
-- can be re-run safely after a failed attempt. That is not hypothetical: it
-- already happened once.
--
-- WHAT "NOT APPLICABLE" NOW IS. It is the ABSENCE of a cell — a floor outside
-- a system's coverage. Brief 101 found the app could not produce §11.2's
-- seventh legend state at all; coverage is what finally makes it real. It is
-- never stored as a status, which is why status keeps exactly three values.
--
-- ONE DECISION TAKEN HERE, FLAGGED IN THE RESULT. 17a item 20 writes the cell
-- key as "sub_stage_id", but no sub-stage lookup table is defined anywhere in
-- the design — no columns, no seed, no admin screen — and the five sub-stages
-- are fixed text pairs today, already keyed in application code. This keeps
-- the (stage, sub_stage) pair rather than inventing an unspecified table.
-- Adding a lookup later is additive; guessing one now would reshape every
-- reader twice.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Floor coverage per system — 17a item 19
-- -----------------------------------------------------------------------------

create table if not exists workflow.project_system_floors (
  id                uuid primary key default gen_random_uuid(),
  project_system_id uuid not null references workflow.project_systems (id) on delete cascade,
  floor_id          uuid not null references workflow.project_floors (id) on delete cascade,

  -- §6.5 — the import proposes coverage from the shop drawing template's
  -- floors per system; a person can correct it. Which one set it is shown in
  -- the "Set by" column, so it is recorded rather than inferred.
  source            text not null default 'manual',

  added_by          uuid references auth.users (id) on delete set null,
  added_at          timestamptz not null default now(),

  -- §6.5 — "Removing a floor with recorded work … keeps those records but
  -- takes them out of progress; adding B1 back restores them." So removal is
  -- a timestamp, never a DELETE: the progress cells hang off this row by a
  -- composite foreign key, and deleting it would take the recorded work with
  -- it. That is the whole mechanism behind "adding B1 back restores them".
  removed_at        timestamptz,

  constraint project_system_floors_unique unique (project_system_id, floor_id),
  -- 'migrated' is this migration's own backfill (section 9). It is a third
  -- value on purpose: calling it 'manual' would claim a person chose these
  -- floors, and nobody did. The setup screen renders it in amber and asks
  -- for it to be checked.
  constraint project_system_floors_source_check
    check (source in ('import', 'manual', 'migrated'))
);

comment on table workflow.project_system_floors is
  'Migration 045 / Brief 106, v7.4 §6.5 and 17a item 19. Which floors each
   system covers. REAL DATA, not a computed guess: a system covers a floor or
   it does not, and a progress cell exists only where it does. §11.2''s "not
   applicable" is the absence of coverage and is never stored as a status.';

comment on column workflow.project_system_floors.removed_at is
  'v7.4 §6.5. Set instead of deleting the row, so the progress cells that hang
   off it by composite FK survive. Removing a floor takes its work out of
   progress; adding the floor back restores the same records rather than
   starting them again from nothing.';

-- The composite key the progress cell points at. A plain unique constraint
-- cannot be the target of a composite FK unless it names exactly these two
-- columns in this order, which the constraint above does.

-- -----------------------------------------------------------------------------
-- 2. The progress cell — 17a item 20. Replaces floor_sub_stages.
-- -----------------------------------------------------------------------------

create table if not exists workflow.progress_cells (
  id                uuid primary key default gen_random_uuid(),
  project_system_id uuid not null,
  floor_id          uuid not null,

  -- See the header: the (stage, sub_stage) pair, not a lookup id.
  stage             text not null,
  sub_stage         text not null,
  sequence          integer not null,

  -- 17a item 20 — "still the only three stored statuses". Awaiting QC, QC
  -- passed, QC failed and stalled are all DERIVED (§11.1), never stored, so
  -- the matrix and the phone cannot disagree about a cell.
  status            text not null default 'not_started',
  reason            text,

  photo_url         text,

  updated_by        uuid references auth.users (id) on delete set null,
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),

  constraint progress_cells_unique unique (project_system_id, floor_id, stage, sub_stage),
  constraint progress_cells_status_check
    check (status in ('not_started', 'in_progress', 'done')),
  constraint progress_cells_stage_check
    check (stage in ('installation', 'tnc')),

  -- 17a item 20 — "a cell cannot exist outside coverage". A composite FK, not
  -- an application check, so no route can create one: not the seed trigger,
  -- not the import, not a direct write.
  constraint progress_cells_within_coverage
    foreign key (project_system_id, floor_id)
    references workflow.project_system_floors (project_system_id, floor_id)
    on delete cascade
);

comment on table workflow.progress_cells is
  'Migration 045 / Brief 106, 17a item 20. One system, one floor, one
   sub-stage — the unit of recorded progress after D096. Replaces
   workflow.floor_sub_stages, which keyed only floor × sub-stage and so forced
   one status onto every system working that floor.';

comment on constraint progress_cells_within_coverage on workflow.progress_cells is
  'A cell cannot exist outside its system''s coverage. Enforced by the database
   rather than by whichever code path happens to create cells, because there
   are three of them (the floor seed trigger, the BOQ import, and the coverage
   editor) and an application check would have to be right in all three.';

-- -----------------------------------------------------------------------------
-- 3. Seeding — the five sub-stages, per covered (system, floor)
-- -----------------------------------------------------------------------------

create or replace function workflow.seed_progress_cells(p_project_system_id uuid, p_floor_id uuid)
returns void
language plpgsql
as $function$
begin
  -- 045 marker: five sub-stages seeded per covered system and floor
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
  'Migration 045. The five sub-stages, seeded once per covered (system, floor).
   ON CONFLICT DO NOTHING so that re-adding a floor to a system restores its
   existing cells rather than failing or resetting them — §6.5''s "adding B1
   back restores them".';

-- Coverage added → its cells appear.
create or replace function workflow.project_system_floors_after_insert()
returns trigger
language plpgsql
as $function$
begin
  -- 045 marker: coverage creates cells
  perform workflow.seed_progress_cells(new.project_system_id, new.floor_id);
  return new;
end;
$function$;

drop trigger if exists project_system_floors_after_insert on workflow.project_system_floors;
create trigger project_system_floors_after_insert
  after insert on workflow.project_system_floors
  for each row
  execute function workflow.project_system_floors_after_insert();

-- Coverage un-removed → the same cells come back, because they were never
-- deleted. Nothing to do but re-seed any that never existed.
create or replace function workflow.project_system_floors_after_update()
returns trigger
language plpgsql
as $function$
begin
  -- 045 marker: restoring coverage restores the same cells
  if old.removed_at is not null and new.removed_at is null then
    perform workflow.seed_progress_cells(new.project_system_id, new.floor_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists project_system_floors_after_update on workflow.project_system_floors;
create trigger project_system_floors_after_update
  after update of removed_at on workflow.project_system_floors
  for each row
  execute function workflow.project_system_floors_after_update();

-- -----------------------------------------------------------------------------
-- 4. A new floor joins every system that already covers every floor — §6.5
-- -----------------------------------------------------------------------------

create or replace function workflow.project_floors_extend_full_coverage()
returns trigger
language plpgsql
as $function$
declare
  v_floor_count integer;
begin
  -- 045 marker: a new floor joins only the systems that covered every floor
  -- §6.5: "A new floor joins every system that already covers every floor,
  -- and no other." Counted BEFORE this floor, which is why the comparison is
  -- against floors that are not the new one.
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

comment on function workflow.project_floors_extend_full_coverage() is
  'Migration 045 / v7.4 §6.5. A floor added later joins the systems that
   covered EVERY floor before it, and no others — a system scoped to the
   basement does not silently acquire L27. The screen states which systems it
   joined and which it did not, so the rule is visible rather than surprising.';

drop trigger if exists project_floors_extend_full_coverage on workflow.project_floors;
create trigger project_floors_extend_full_coverage
  after insert on workflow.project_floors
  for each row
  execute function workflow.project_floors_extend_full_coverage();

-- -----------------------------------------------------------------------------
-- 5. Re-point QC inspections at the cell — 17a item 21
-- -----------------------------------------------------------------------------

alter table workflow.qc_inspections
  add column if not exists progress_cell_id uuid
    references workflow.progress_cells (id) on delete cascade;

-- STAGED, AND THIS IS THE CORRECTION THAT MATTERS.
--
-- The first version of this migration dropped floor_sub_stage_id here and
-- then demanded progress_cell_id be NOT NULL for installation and
-- commissioning inspections. It FAILED ON PRODUCTION, and it could never
-- have succeeded:
--
--   * progress_cell_id is a brand new column, so it is null on every
--     existing row; and
--   * nothing in this migration creates coverage for a project that has no
--     systems, so at this point in the transaction there may be NO
--     progress_cells at all — there is no cell for an inspection to point
--     at. The constraint was unsatisfiable by construction, not merely
--     unsatisfied.
--
-- The comment that used to sit here said "there are no inspections to carry
-- (checked before writing this migration, and the verification asserts it
-- again)". Both halves were wrong. It was checked on rollback-test, which
-- has zero inspections, and written as though it were a fact about the
-- system; and no check in the verification file counted inspection rows.
-- Production had one installation inspection and it stopped the migration.
--
-- So the old link is KEPT, not dropped. floor_sub_stage_id stays, the old
-- rows stay, and the constraint accepts EITHER model while the app moves
-- across. Migration 050 re-points the rows once coverage exists and then
-- tightens this to progress_cell_id alone. Nothing is destroyed to make a
-- constraint pass.
alter table workflow.qc_inspections
  drop constraint if exists qc_inspections_shape_check;

alter table workflow.qc_inspections
  add constraint qc_inspections_shape_check
    check (
      (inspection_type = 'material'
        and progress_cell_id is null
        and floor_sub_stage_id is null)
      or (inspection_type in ('installation', 'commissioning')
        and (progress_cell_id is not null or floor_sub_stage_id is not null))
    );

comment on constraint qc_inspections_shape_check on workflow.qc_inspections is
  'Migration 045, STAGED. An installation or commissioning inspection must
   point at something — the new cell OR the old sub-stage — and a material
   inspection at neither. Deliberately accepts both models: this migration
   cannot re-point existing rows, because coverage (and therefore any cell to
   point at) may not exist yet. Migration 050 tightens this to
   progress_cell_id alone once the re-pointing has actually happened.';

comment on column workflow.qc_inspections.progress_cell_id is
  'Migration 045 / 17a item 21. Replaces floor_sub_stage_id: an inspection is
   against one system''s cell, because a floor''s CCTV and its access control
   are inspected separately. MATERIAL INSPECTION IS UNCHANGED — it stays
   project-level, with no system and no floor, which is why this column is
   null for it and the shape constraint still says so.';

-- -----------------------------------------------------------------------------
-- 6. The old model stops being WRITTEN to. It is not destroyed.
-- -----------------------------------------------------------------------------
--
-- The seeding trigger goes, so a new floor no longer creates old-model rows:
-- from here on, cells come from coverage. But workflow.floor_sub_stages
-- ITSELF STAYS, with every row in it.
--
-- The first version of this migration dropped it with CASCADE. On production
-- that table holds 30 rows, FOUR OF THEM CARRYING RECORDED WORK, and one QC
-- inspection points into it. The justification for dropping was 17a item 18
-- — "everything in the app today is test data" — which is true of
-- rollback-test and is NOT true of production. A migration does not get to
-- delete work because a design note said there would not be any.
--
-- The table is now a frozen archive: nothing writes to it, migration 050
-- reads it to re-point the inspections and the recorded statuses once
-- coverage exists, and only then does it go.
--
-- The CASCADE is also what silently took the rollup trigger (migration 047)
-- and the shape check and write policies (migration 048). Not dropping the
-- table removes that whole class of loss from this migration.

drop trigger if exists project_floors_seed_children on workflow.project_floors;
drop function if exists workflow.seed_floor_children() cascade;

comment on table workflow.floor_sub_stages is
  'FROZEN ARCHIVE as of migration 045. The pre-D096 model: one status per
   floor per sub-stage, with no system, which is why it is being replaced by
   workflow.progress_cells. NOTHING WRITES TO THIS TABLE ANY MORE — the
   seeding trigger was removed by 045. It is kept, with its rows, because
   production holds real recorded work here and one QC inspection still
   points at it. Migration 050 re-points those and then drops this table.
   Do not add new readers.';

-- -----------------------------------------------------------------------------
-- 7. The completion figure — 17a item 23
-- -----------------------------------------------------------------------------

-- SECURITY DEFINER and the pinned search_path are CARRIED OVER, not new.
-- The pre-045 function had both and the first version of this migration
-- silently dropped them — the same shape as the write policy 048 had to
-- restore. It matters here because this function is exposed as a PostgREST
-- RPC: without definer rights a caller computes the figure through their own
-- RLS view of progress_cells and gets a smaller number than the project's
-- real one, with nothing on screen to say the two disagree.
create or replace function workflow.compute_project_rollup_percent(p_project_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = workflow, pg_temp
as $function$
declare
  v_avg numeric;
begin
  -- 045 marker: one bucket per covered system and floor, plus project drawings
  -- §22.2 / 17a item 23. THE MEANING IS UNCHANGED from what Brief 103
  -- established: work recorded, in progress counts half, QC ignored entirely.
  -- Only the denominator changes — a bucket was one FLOOR, and is now one
  -- COVERED (system, floor) PAIR. Floors outside a system's coverage
  -- contribute nothing, because they were never that system's work.
  with buckets as (
    select avg(
             case c.status
               when 'done' then 100
               when 'in_progress' then 50
               else 0
             end
           ) as bucket_pct
      from workflow.progress_cells c
      join workflow.project_system_floors psf
        on psf.project_system_id = c.project_system_id
       and psf.floor_id = c.floor_id
      join workflow.project_systems ps on ps.id = c.project_system_id
     where ps.project_id = p_project_id
       and psf.removed_at is null
     group by c.project_system_id, c.floor_id

    union all

    select avg(
             case sdi.status
               when 'done' then 100
               when 'in_progress' then 50
               else 0
             end
           )
      from workflow.shop_drawing_items sdi
     where sdi.project_id = p_project_id
       and sdi.floor_id is null
    having count(*) > 0
  )
  select avg(bucket_pct) into v_avg from buckets;

  return coalesce(round(v_avg)::integer, 0);
end;
$function$;

comment on function workflow.compute_project_rollup_percent(uuid) is
  'Migration 045 / v7.4 §22.2, 17a item 23. Rewritten for D096. Same meaning as
   Brief 103 documented — done 100, in progress 50, everything else 0, QC
   ignored — with one bucket per COVERED (system, floor) pair plus one for
   project-level drawings. A system''s uncovered floors are not counted
   against it, which is the point of coverage being real data.';

-- -----------------------------------------------------------------------------
-- 8. RLS — matching what the design states, never broader
-- -----------------------------------------------------------------------------

alter table workflow.project_system_floors enable row level security;
alter table workflow.progress_cells        enable row level security;

-- Readable by anyone who can see the project, using the SAME expression
-- contract_boq_lines and material approval already use.
create policy project_system_floors_select on workflow.project_system_floors
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = project_system_floors.project_system_id
         and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- §6.5 — "Permissions: PIC-gated, as §6.4." Coverage is project structure, and
-- structure is the PIC's. Deliberately NOT the progress teams: recording
-- progress and deciding what a system covers are different powers.
create policy project_system_floors_write on workflow.project_system_floors
  for all using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = project_system_floors.project_system_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = project_system_floors.project_system_id
         and p.pic_id = (select auth.uid())
    )
  );

create policy progress_cells_select on workflow.progress_cells
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = progress_cells.project_system_id
         and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- Progress is recorded by the same people who recorded it before this
-- migration: the project management team for installation, TNC for testing
-- and commissioning, or the PIC. Carried over from floor_sub_stages' own
-- policy rather than re-decided here — D096 changed the SHAPE of a cell, not
-- who may write one.
create policy progress_cells_write on workflow.progress_cells
  for all using (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['project_management', 'tnc'])
    or exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = progress_cells.project_system_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['project_management', 'tnc'])
    or exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = progress_cells.project_system_id
         and p.pic_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- 9. Existing projects get coverage, so nobody opens the app to a blank screen
-- -----------------------------------------------------------------------------
--
-- Without this, every project that existed before D096 has no coverage, and
-- therefore no cells: an empty matrix and a completion figure computed from
-- drawings alone. That is not an acceptable state to land people in.
--
-- THE RULE: every system covers every floor of its own project. That is the
-- most that is knowable here, and it is the safe direction to be wrong in.
-- Over-covering shows a floor that may not be that system's work — visible,
-- and corrected in setup in seconds. Under-covering HIDES work, and nothing
-- on screen would say so. So the default is maximal, flagged, and easy to
-- narrow, rather than minimal and silent.
--
-- The 'migrated' source is what makes it honest: the setup screen shows
-- these in amber with "check this", instead of claiming a person set them.
--
-- MEASURED ON PRODUCTION BEFORE WRITING THIS: it will insert ZERO rows
-- today, because no project on production has any systems at all
-- (project_systems is empty). This is still correct, and it is still
-- necessary — it is what keeps any project that DOES have systems whole,
-- here and in every other environment. But it does not by itself prevent
-- the blank screen on production: nothing can, until that project's systems
-- exist. Creating them in setup is the step, and it is a small one.
--
-- Idempotent, so re-running this migration cannot double up or overwrite a
-- correction someone has already made.

insert into workflow.project_system_floors (project_system_id, floor_id, source)
select ps.id, f.id, 'migrated'
  from workflow.project_systems ps
  join workflow.project_floors f on f.project_id = ps.project_id
on conflict (project_system_id, floor_id) do nothing;

-- The insert trigger from section 3 has now seeded five cells for each pair,
-- so the matrix and the figure have something to show the moment this
-- migration commits.

create index if not exists project_system_floors_system_idx
  on workflow.project_system_floors (project_system_id);
create index if not exists project_system_floors_floor_idx
  on workflow.project_system_floors (floor_id);
create index if not exists progress_cells_system_floor_idx
  on workflow.progress_cells (project_system_id, floor_id);
create index if not exists progress_cells_floor_idx
  on workflow.progress_cells (floor_id);

commit;
