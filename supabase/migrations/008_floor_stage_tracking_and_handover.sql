-- =============================================================================
-- ADTECH Workflow Tracker — Migration 008: floor/stage-level progress
-- tracking through handover
-- Brief: ADTECH_WF_Brief_007_Floor_Stage_Tracking_And_Handover, read
-- together with ADTECH_WF_Brief_007_Amendment_A_Rollup_And_Screen_6a
-- (the amendment wins wherever the two conflict — see its own §1-§4).
--
-- THE LARGEST SCHEMA ROUND SO FAR — several new tables, two new triggers
-- on an existing hot path (progress_updates), and an amendment to a
-- function every screen that shows percent_complete already depends on.
-- Amendment §5.1 calls a rollback test against a non-production target
-- "a requirement, not a suggestion," specifically because this project
-- has written a rollback file for every migration and never once run
-- one. THIS SESSION CANNOT RUN THAT TEST — no psql/DATABASE_URL, no
-- Supabase SQL editor access, same standing limitation this project has
-- had since Brief 001 (see every prior migration's own header). Stated
-- here plainly rather than silently skipped: Seanghakk needs to run
-- supabase/rollback/008_floor_stage_tracking_and_handover_rollback.sql
-- against a throwaway/staging project (or a local Supabase instance)
-- BEFORE applying this file to prod, per the amendment's own instruction
-- — not treated as optional because this session couldn't do it itself.
--
-- §2.1's decision is what makes this migration safe to apply even
-- without that test having run yet, for what it's worth: every project
-- that exists today has zero rows in the new workflow.project_floors
-- table (this migration creates the table, it does not backfill any
-- project into it), so every trigger and function added here is
-- unreachable for every existing project until someone deliberately adds
-- a floor row. Confirmed directly (§5.2 of the amendment): screen 4a
-- (Fable Brief 009, merged) selects percent_complete straight off
-- workflow.projects with no awareness of floors at all — nothing it
-- reads changes for any project that has no floor rows, which today is
-- all of them.
--
-- SCOPE, PER BOTH DOCUMENTS: schema + migration only. No UI screens.
--
-- WHAT THIS FILE DOES, eight new tables plus one amended function:
--
--  1. workflow.project_floors — the base tracked unit under a project.
--  2. workflow.shop_drawing_items — schematic/typical (project-scope) and
--     layout/detail_connection (floor-scope), one status each.
--  3. workflow.floor_sub_stages — installation's 3 fix stages + TNC's 2
--     stages, per floor.
--  4. workflow.qc_inspections + workflow.qc_inspection_floors — QC as a
--     SOFT gate (Amendment §3.1): a sub-stage can be marked done without
--     a passed inspection; the absence is a rollup/UI concern for a
--     later brief, not enforced here or at the RLS level.
--  5. workflow.project_handover_items — the six-deliverable consolidation
--     checklist (Amendment §4.1: built here, no gating logic on top).
--  6. workflow.checklist_templates + workflow.checklist_items —
--     system-type-scoped checklist content. Seeded with ONLY the FAS
--     example given (battery calc, voltage drop calc, cause-and-effect
--     matrix) — every other system type is left EMPTY on purpose
--     (Amendment §3.5: "do NOT generate, infer, or fill in checklist
--     content for any other system type... that content comes from him
--     directly"). Same seeded-empty discipline as workflow.stages and
--     workflow.approval_steps in migration 001.
--  7. workflow.projects gains percent_calculated and percent_override_at
--     (both nullable, additive columns — the existing table is extended,
--     not restructured, per both documents' own instruction).
--  8. workflow.bump_last_meaningful_movement() — CREATE OR REPLACE of the
--     SAME function/trigger migration 003 already amended once, not a
--     second competing mechanism (matching migration 003's own stated
--     reasoning for why it amended migration 001's version instead of
--     adding a new one). See §8 below for exactly what changes and what
--     stays byte-for-byte identical.
--
-- workflow.stages / workflow.approval_steps — DETERMINATION, per
-- Amendment §4.2's explicit instruction not to leave two competing
-- notions of "stage" silently unmerged: this migration's model sits
-- ALONGSIDE workflow.stages, it does not supersede it. workflow.stages
-- (keyed by scope_type, one current_stage_id per project) answers "who
-- must act next on this project as a whole" at the project's own
-- lifecycle granularity — still seeded empty, still a future decision,
-- untouched here. workflow.floor_sub_stages/shop_drawing_items answer a
-- different, finer-grained question: detailed per-floor progress WITHIN
-- whatever the project's current lifecycle stage is. Both can be true
-- of the same project at once. Not merged this round, as instructed.
--
-- WRITE PERMISSIONS — NOT DECIDED HERE, STATED PLAINLY, NOT SILENTLY
-- SKIPPED: every new table below gets a SELECT policy (is_member() +
-- can_view_project(), same shape migration 004 already established for
-- every other project-child table) but NO insert/update/delete policy.
-- This matches the existing precedent for workflow.stages/
-- workflow.approval_steps exactly (migration 001: "read-only from the
-- app's perspective for now... rows entered by hand in the SQL editor as
-- owner, which bypasses RLS") — rows in every new table here can only be
-- entered/changed by hand until a follow-up UI brief defines who is
-- actually allowed to update a floor's sub-stage (the project's PIC? a
-- new floor-level role? unspecified by either document), same as this
-- brief's own §2.4/Amendment §2.4 defers the override CONTROL to that
-- follow-up brief. The rollup functions still work today because they
-- run SECURITY DEFINER, the identical mechanism workflow.projects' own
-- percent_complete already depends on (that table has had no UPDATE
-- policy at all since migration 003 — see that file's own comment).
--
-- Wrapped in one transaction, matching every migration in this project.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.project_floors
-- -----------------------------------------------------------------------------

create table workflow.project_floors (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references workflow.projects (id) on delete restrict,
  label       text not null,
  sort_order  integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, label)
);

comment on table workflow.project_floors is
  'The base tracked unit under a project (Brief 007 §1) — floors, not
   zones. Zone grouping is anticipated as a future additive layer OVER
   floors, deliberately not built now (Brief 007 / Amendment §3.4); this
   table makes no schema choice that would block adding a zone_id FK
   here later. label is free text, not an integer — projects can have
   non-numeric floor labels ("B1", "Roof"); sort_order is the real
   ordering field. A project with zero rows here is a valid, ordinary
   state (Amendment §2.1), not an incomplete setup: it means that
   project''s percent_complete stays an ENTERED value, exactly as every
   project behaves today.';

alter table workflow.project_floors enable row level security;

drop policy if exists project_floors_select on workflow.project_floors;
create policy project_floors_select on workflow.project_floors
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- -----------------------------------------------------------------------------
-- 2. workflow.shop_drawing_items — Brief 007 §2. Two scopes, four drawing
--    types, split 2/2 between them. A plain UNIQUE constraint can't
--    express "one per (project, drawing_type) at project scope, one per
--    (floor, drawing_type) at floor scope" because floor_id is NULL for
--    every project-scope row and Postgres treats NULL as distinct from
--    NULL in a unique constraint — hence the two partial indexes below
--    instead of one table-level UNIQUE.
-- -----------------------------------------------------------------------------

create table workflow.shop_drawing_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references workflow.projects (id) on delete restrict,
  floor_id      uuid references workflow.project_floors (id) on delete restrict,
  scope         text not null,
  drawing_type  text not null,
  status        text not null default 'not_started',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint shop_drawing_items_status_check check (status in ('not_started', 'in_progress', 'done')),
  constraint shop_drawing_items_scope_check check (scope in ('project', 'floor')),
  -- Brief 007 §2's own split, enforced, not just documented: schematic /
  -- typical_section can ONLY be project-scoped (floor_id null);
  -- layout / detail_connection can ONLY be floor-scoped (floor_id set).
  -- The team's current practice of duplicating typical/section drawings
  -- into every floor — which the client considers redundant — is what
  -- this constraint makes structurally impossible to repeat.
  constraint shop_drawing_items_shape_check check (
    (scope = 'project' and floor_id is null and drawing_type in ('schematic', 'typical_section'))
    or
    (scope = 'floor' and floor_id is not null and drawing_type in ('layout', 'detail_connection'))
  )
);

create unique index shop_drawing_items_project_scope_key
  on workflow.shop_drawing_items (project_id, drawing_type)
  where scope = 'project';

create unique index shop_drawing_items_floor_scope_key
  on workflow.shop_drawing_items (floor_id, drawing_type)
  where scope = 'floor';

comment on table workflow.shop_drawing_items is
  'Brief 007 §2. project_id is always set (even for floor-scoped rows —
   denormalized on purpose so every row can be scoped/rolled-up without
   a join through project_floors first). Each drawing type carries its
   OWN status (Brief''s own instruction: "do not force a single shared
   status across drawing types"). Floor-scoped rows (layout,
   detail_connection) are seeded automatically when a floor is created —
   see workflow.seed_floor_children() below — so a floor''s rollup bucket
   is never missing an item it should have.';

alter table workflow.shop_drawing_items enable row level security;

drop policy if exists shop_drawing_items_select on workflow.shop_drawing_items;
create policy shop_drawing_items_select on workflow.shop_drawing_items
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- -----------------------------------------------------------------------------
-- 3. workflow.floor_sub_stages — Brief 007 §3/§4. Installation's 3 fix
--    stages plus TNC's 2 stages, one generic table (not four/five
--    separate ones) — same "one shape, a stage column narrows it" pattern
--    workflow.stages itself already uses for scope_type.
-- -----------------------------------------------------------------------------

create table workflow.floor_sub_stages (
  id          uuid primary key default gen_random_uuid(),
  floor_id    uuid not null references workflow.project_floors (id) on delete restrict,
  stage       text not null,
  sub_stage   text not null,
  sequence    integer not null,
  status      text not null default 'not_started',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint floor_sub_stages_status_check check (status in ('not_started', 'in_progress', 'done')),
  constraint floor_sub_stages_stage_check check (stage in ('installation', 'tnc')),
  constraint floor_sub_stages_shape_check check (
    (stage = 'installation' and sub_stage in ('first_fix', 'second_fix', 'third_fix'))
    or
    (stage = 'tnc' and sub_stage in ('pre_commissioning', 'commissioning'))
  ),
  unique (floor_id, stage, sub_stage)
);

comment on table workflow.floor_sub_stages is
  'Brief 007 §3 (installation: first_fix/second_fix/third_fix) and §4
   (tnc: pre_commissioning/commissioning), per floor. sequence is the
   1-based order within its own stage (1-3 for installation, 1-2 for
   tnc) — display/ordering only, nothing here enforces that an earlier
   sub_stage must complete before a later one starts (not asked for by
   either document; QC is the only gate specified, and Amendment §3.1
   makes even that soft). All 5 rows are seeded automatically when a
   floor is created (workflow.seed_floor_children() below), so a floor''s
   rollup bucket always has a complete, fixed set of dimensions from the
   moment it exists.';

alter table workflow.floor_sub_stages enable row level security;

drop policy if exists floor_sub_stages_select on workflow.floor_sub_stages;
create policy floor_sub_stages_select on workflow.floor_sub_stages
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- -----------------------------------------------------------------------------
-- 4. workflow.qc_inspections + workflow.qc_inspection_floors — Brief 007
--    §5, resolved as a SOFT gate by Amendment §3.1: "a sub-stage may be
--    marked complete without a passed QC inspection, but the missing
--    inspection is visibly flagged and rolls up as an exception... do
--    not enforce this at the RLS level." Nothing in this migration blocks
--    floor_sub_stages.status from reaching 'done' regardless of whether a
--    matching qc_inspections row exists or what it says — the "visibly
--    flagged" half of that instruction is a rollup/UI concern for the
--    follow-up brief this round explicitly defers to (§2.4).
--
--    Material inspection is per-shipment at PROJECT level (Amendment
--    §3.2), not owned by any one floor — "one delivery commonly serves
--    several floors" — hence the separate many-to-many join table rather
--    than a floor_id column on qc_inspections itself.
-- -----------------------------------------------------------------------------

create table workflow.qc_inspections (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references workflow.projects (id) on delete restrict,
  inspection_type     text not null,
  -- Required for installation/commissioning (gates one specific floor's
  -- specific sub-stage instance, per Brief 007 §5); null for material
  -- (project-level, floors referenced via the join table below instead).
  floor_sub_stage_id  uuid references workflow.floor_sub_stages (id) on delete restrict,
  status              text not null default 'pending',
  inspector_id        uuid references public.user_profiles (id) on delete restrict,
  inspected_at        timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint qc_inspections_type_check check (inspection_type in ('material', 'installation', 'commissioning')),
  constraint qc_inspections_status_check check (status in ('pending', 'pass', 'fail')),
  constraint qc_inspections_shape_check check (
    (inspection_type = 'material' and floor_sub_stage_id is null)
    or
    (inspection_type in ('installation', 'commissioning') and floor_sub_stage_id is not null)
  )
);

comment on table workflow.qc_inspections is
  'Brief 007 §5, SOFT gate per Amendment §3.1 — status here never blocks
   floor_sub_stages.status, and nothing in this schema round enforces the
   pairing beyond the shape check above. CONVENTION, not a DB constraint
   (would need a cross-table trigger for marginal benefit at this stage):
   an ''installation''-type row should reference a floor_sub_stage whose
   own stage is ''installation'', and ''commissioning'' should reference
   one whose stage is ''tnc'' (pre_commissioning or commissioning) — left
   as a documented expectation, not enforced, consistent with how much
   else in this round is deliberately left flexible pending real use.';

alter table workflow.qc_inspections enable row level security;

drop policy if exists qc_inspections_select on workflow.qc_inspections;
create policy qc_inspections_select on workflow.qc_inspections
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = qc_inspections.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

create table workflow.qc_inspection_floors (
  qc_inspection_id  uuid not null references workflow.qc_inspections (id) on delete restrict,
  floor_id          uuid not null references workflow.project_floors (id) on delete restrict,
  primary key (qc_inspection_id, floor_id)
);

comment on table workflow.qc_inspection_floors is
  'Amendment §3.2 — a material inspection/shipment references the floors
   it serves without being owned by any one of them. Meaningful only for
   qc_inspections rows where inspection_type = ''material''; not enforced
   by a constraint (would need a trigger to check the parent row''s type)
   but rows should not be created against installation/commissioning
   inspections, which already have their own floor via floor_sub_stage_id.';

alter table workflow.qc_inspection_floors enable row level security;

drop policy if exists qc_inspection_floors_select on workflow.qc_inspection_floors;
create policy qc_inspection_floors_select on workflow.qc_inspection_floors
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.qc_inspections qi
      join workflow.projects p on p.id = qi.project_id
      where qi.id = qc_inspection_floors.qc_inspection_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- -----------------------------------------------------------------------------
-- 5. workflow.project_handover_items — Brief 007 §6, six deliverables,
--    project-level consolidation, no per-floor concept. Amendment §4.1:
--    build this structure, do NOT build gating/readiness logic on top —
--    see this migration's own header note on how the separate draft
--    brief (Mandatory Stage Documents And Handover Readiness) would sit
--    over this table once it is finished.
-- -----------------------------------------------------------------------------

create table workflow.project_handover_items (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references workflow.projects (id) on delete restrict,
  deliverable   text not null,
  status        text not null default 'not_started',
  document_url  text,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint project_handover_items_deliverable_check check (deliverable in (
    'material_approval',
    'final_bom_spares',
    'tc_document',
    'as_built_drawing',
    'training_om_manual',
    'warranty_documents'
  )),
  constraint project_handover_items_status_check check (status in ('not_started', 'in_progress', 'done')),
  unique (project_id, deliverable)
);

comment on table workflow.project_handover_items is
  'Brief 007 §6''s six-deliverable checklist, verbatim. Deliberately NOT
   auto-seeded on project creation (unlike project_floors'' children,
   which ARE auto-seeded) — floor tracking is explicitly opt-in per
   project (Amendment §2.1), and nothing in either document says every
   project must go through this handover checklist the same way, so rows
   here are created by hand/future UI as needed rather than assumed
   universal. No gating/readiness logic on top of this table this round
   (Amendment §4.1) — a draft brief (Mandatory Stage Documents And
   Handover Readiness) proposes a soft-flag-mid-project / hard-block-at-
   handover shape; once finished, that logic would most naturally live as
   a computed check reading these six rows'' status (e.g. "hard block"
   = not every row here is ''done''), not a rewrite of this table.';

alter table workflow.project_handover_items enable row level security;

drop policy if exists project_handover_items_select on workflow.project_handover_items;
create policy project_handover_items_select on workflow.project_handover_items
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- -----------------------------------------------------------------------------
-- 6. workflow.checklist_templates + workflow.checklist_items — Brief 007
--    §7. system_type is plain text, NOT a CHECK-constrained enum and NOT
--    a new lookup table of its own: the brief is explicit that the full
--    list of system types (FAS, BMS, security, ...) and which standard
--    anchors each one "was not specified... needs to come from him
--    directly" (Brief 007 / restated Amendment §3.5). Constraining or
--    even enumerating that list here would be inventing it. applies_to
--    is likewise free text (expected values include, but are not
--    constrained to: shop_drawing, installation_first_fix,
--    installation_second_fix, installation_third_fix,
--    tnc_pre_commissioning, tnc_commissioning, qc_material,
--    qc_installation, qc_commissioning) for the same reason — this
--    structure's own shape is still settling.
-- -----------------------------------------------------------------------------

create table workflow.checklist_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001'
              references workflow.orgs (id),
  system_type text not null,
  applies_to  text not null,
  label_en    text not null,
  label_km    text,
  sort_order  integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, system_type, applies_to)
);

comment on table workflow.checklist_templates is
  'Brief 007 §7. Deliberately seeded with ONLY the FAS example given —
   see the two rows inserted below. Every other system_type is left
   EMPTY on purpose, same discipline as workflow.stages/approval_steps
   (migration 001): a lookup table with zero rows for a given key is a
   valid, honest "not decided yet" state, not a bug to silently patch
   with invented content. label_km left NULL, same reasoning as every
   other bilingual lookup table here — a native-speaker pass, not a
   guess.';

create table workflow.checklist_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references workflow.checklist_templates (id) on delete restrict,
  code        text not null,
  label_en    text not null,
  label_km    text,
  sort_order  integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (template_id, code)
);

alter table workflow.checklist_templates enable row level security;
alter table workflow.checklist_items enable row level security;

-- Global lookup tables, not project-scoped — same bare is_member() shape
-- as workflow.teams/stages/approval_steps, no can_view_project() join.
drop policy if exists checklist_templates_select on workflow.checklist_templates;
create policy checklist_templates_select on workflow.checklist_templates
  for select using (workflow.is_member());

drop policy if exists checklist_items_select on workflow.checklist_items;
create policy checklist_items_select on workflow.checklist_items
  for select using (workflow.is_member());

-- THE ONLY CONTENT SEEDED IN THIS ROUND — the FAS example the brief
-- itself gives, split across the two workflow stages it actually
-- belongs to (battery/voltage-drop calculations are design-stage
-- checklist items; the cause-and-effect matrix is a commissioning-stage
-- artifact) — a judgment call in HOW to organize the three given items,
-- not an invention of new content. Flagged in the result doc regardless.
insert into workflow.checklist_templates (system_type, applies_to, label_en, sort_order) values
  ('fas', 'shop_drawing', 'FAS design checklist', 10),
  ('fas', 'tnc_commissioning', 'FAS commissioning checklist', 20);

insert into workflow.checklist_items (template_id, code, label_en, sort_order)
select id, 'battery_calculation', 'Battery calculation', 10
from workflow.checklist_templates where system_type = 'fas' and applies_to = 'shop_drawing'
union all
select id, 'voltage_drop_calculation', 'Voltage drop calculation', 20
from workflow.checklist_templates where system_type = 'fas' and applies_to = 'shop_drawing'
union all
select id, 'cause_and_effect_matrix', 'Cause-and-effect matrix', 10
from workflow.checklist_templates where system_type = 'fas' and applies_to = 'tnc_commissioning';

-- -----------------------------------------------------------------------------
-- 7. workflow.projects — additive columns only (not a restructure).
-- -----------------------------------------------------------------------------

alter table workflow.projects
  add column percent_calculated integer,
  add column percent_override_at timestamptz;

alter table workflow.projects
  add constraint projects_percent_calculated_check
  check (percent_calculated is null or percent_calculated between 0 and 100);

comment on column workflow.projects.percent_calculated is
  'The current rollup value (Amendment §2), maintained by workflow.
   recalculate_project_rollup() — NULL for a project with no floor rows
   (rollup does not apply, Amendment §2.1). Distinct from percent_complete:
   this is always "what the floors currently say," even while an active
   override (percent_override_at is not null) means percent_complete is
   showing a manually entered value instead.';

comment on column workflow.projects.percent_override_at is
  'When not null, a PIC has overridden the calculated rollup on a
   project WITH floor rows (Amendment §2.2) and percent_complete is
   currently showing that entered value rather than percent_calculated.
   Cleared back to null automatically the moment any floor_sub_stages or
   shop_drawing_items row underneath this project changes (Amendment
   §2.3 — "the project reverts to the calculated value at that point").
   Always null for a project with no floor rows; the override concept
   does not exist for them.';

-- -----------------------------------------------------------------------------
-- 8. THE ROLLUP ITSELF.
-- -----------------------------------------------------------------------------

create or replace function workflow.compute_project_rollup_percent(p_project_id uuid)
returns integer
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  -- Amendment §3.3's proposed default, accepted as-is: "equal weight
  -- across floors and equal weight across the tracked dimensions per
  -- floor... do not spend this round refining it." ONE bucket per floor
  -- (whatever mix of shop-drawing/installation/tnc items it holds,
  -- averaged together) plus ONE bucket for the project-level shop-
  -- drawing items (schematic/typical_section) — this project-level
  -- bucket sitting as an equal peer alongside each floor bucket is THIS
  -- MIGRATION'S OWN RESOLUTION of something neither document states
  -- explicitly (both describe weighting "per floor," not how the
  -- project-level items factor into the total) — flagged in the result
  -- doc as a decision open to revision, per the amendment's own standing
  -- instruction for the whole rollup formula.
  --
  -- A bucket that genuinely has zero items (e.g. no project-level
  -- shop-drawing rows created yet) contributes no rows to `items` and so
  -- is silently absent from the average, rather than counting as 0% or
  -- raising an error — the same "an empty set renders gracefully as
  -- empty" principle this project already applies to lookup tables.
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
$$;

comment on function workflow.compute_project_rollup_percent(uuid) is
  'Pure calculation, no writes — see workflow.recalculate_project_rollup()
   for the function that actually applies this to a project row. Returns
   NULL when there is nothing to average (no floor rows and no
   project-level shop-drawing rows at all), which callers must treat as
   "rollup does not apply," never as 0%.';

create or replace function workflow.recalculate_project_rollup(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
declare
  v_pct integer;
begin
  -- Amendment §2.1: a project with zero floor rows keeps its ENTERED
  -- percent untouched — this function does not run the calculation at
  -- all for it, let alone write anything.
  if not exists (
    select 1 from workflow.project_floors where project_id = p_project_id
  ) then
    return;
  end if;

  v_pct := workflow.compute_project_rollup_percent(p_project_id);

  -- Every call here — whether triggered by a new floor, a shop-drawing
  -- status change, or a sub-stage status change — represents "the detail
  -- underneath this project just changed," which per Amendment §2.3 is
  -- exactly the event that expires any active override. percent_complete
  -- is therefore always set to the fresh calculated value here, and
  -- percent_override_at is always cleared, regardless of whether an
  -- override happened to be active a moment ago.
  update workflow.projects
  set percent_calculated = v_pct,
      percent_complete = coalesce(v_pct, percent_complete),
      percent_override_at = null,
      updated_at = now()
  where id = p_project_id;
end;
$$;

comment on function workflow.recalculate_project_rollup(uuid) is
  'The one place "floor detail changed, recompute and expire any
   override" happens (Amendment §2.3) — called from workflow.
   seed_floor_children() (a floor was added) and from the AFTER INSERT OR
   UPDATE OF status triggers on shop_drawing_items and floor_sub_stages
   below. SECURITY DEFINER, same mechanism workflow.projects.
   percent_complete has depended on exclusively since migration 003 (that
   table has never had an UPDATE policy) — this is not a new write path
   alongside the existing one, it extends the same one.';

-- -----------------------------------------------------------------------------
-- 9. Auto-seed a floor's children the moment it is created, so a floor's
--    rollup bucket always has its full, fixed set of dimensions (2
--    shop-drawing + 5 sub-stage rows) rather than growing them lazily —
--    see workflow.shop_drawing_items' and workflow.floor_sub_stages' own
--    comments for why. The five floor_sub_stages inserts and two
--    shop_drawing_items inserts below each fire their own AFTER INSERT
--    recalculation trigger (§10) in addition to the explicit call at the
--    end of this function — redundant (this data set is tiny; several
--    recalculations of the same project in one transaction is
--    inexpensive) but harmless, not a bug: an intermediate firing may
--    compute against a partially-seeded floor, but the explicit call at
--    the very end of this function runs after both INSERTs above have
--    fully completed, so the value actually left standing once this
--    trigger returns is always computed against the complete 7-row set.
-- -----------------------------------------------------------------------------

create or replace function workflow.seed_floor_children()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
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
$$;

comment on function workflow.seed_floor_children() is
  'AFTER INSERT on workflow.project_floors. Seeds the fixed 7-row
   dimension set every floor is expected to have (Brief 007 §2/§3/§4)
   and recalculates the parent project''s rollup so a brand-new floor
   (all its rows at 0%) is immediately reflected rather than silently
   absent until someone edits it.';

drop trigger if exists project_floors_seed_children on workflow.project_floors;

create trigger project_floors_seed_children
after insert on workflow.project_floors
for each row
execute function workflow.seed_floor_children();

-- -----------------------------------------------------------------------------
-- 10. Recalculate on every status change to the two dimension tables.
-- -----------------------------------------------------------------------------

create or replace function workflow.recalculate_rollup_from_shop_drawing()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  perform workflow.recalculate_project_rollup(new.project_id);
  return new;
end;
$$;

drop trigger if exists shop_drawing_items_recalculate_rollup on workflow.shop_drawing_items;

create trigger shop_drawing_items_recalculate_rollup
after insert or update of status on workflow.shop_drawing_items
for each row
execute function workflow.recalculate_rollup_from_shop_drawing();

create or replace function workflow.recalculate_rollup_from_sub_stage()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
declare
  v_project_id uuid;
begin
  select f.project_id into v_project_id
  from workflow.project_floors f
  where f.id = new.floor_id;

  perform workflow.recalculate_project_rollup(v_project_id);
  return new;
end;
$$;

drop trigger if exists floor_sub_stages_recalculate_rollup on workflow.floor_sub_stages;

create trigger floor_sub_stages_recalculate_rollup
after insert or update of status on workflow.floor_sub_stages
for each row
execute function workflow.recalculate_rollup_from_sub_stage();

-- -----------------------------------------------------------------------------
-- 11. workflow.bump_last_meaningful_movement() — CREATE OR REPLACE of the
--     SAME function/trigger (created in migration 001, already amended
--     once by migration 003), per this project's own established
--     convention: amend the one function that owns percent_complete
--     rather than add a second mechanism that could disagree with it.
--
--     Migration 003's version (unchanged logic, quoted here so this file
--     is a complete standalone record of what fires on progress_updates,
--     same as migration 003 did for migration 001's original):
--
--       if new.subject_type = 'project' and new.new_percent is not null then
--         update workflow.projects
--         set percent_complete = new.new_percent,
--             last_meaningful_movement_at = case
--               when new.meets_threshold then new.recorded_at
--               else last_meaningful_movement_at
--             end,
--             updated_at = now()
--         where id = new.subject_id;
--       end if;
--
--     WHAT CHANGES: one more assignment, percent_override_at. When the
--     project being updated has floor rows, this insert IS an override
--     (Amendment §2.2 — "on a project with floor rows, a PIC may still
--     override the calculated percent... the override itself triggers
--     [the mandatory reason]") and percent_override_at is stamped with
--     this update's own recorded_at. When it has no floor rows, this is
--     an ordinary entered-percent update exactly as today, and
--     percent_override_at stays null (irrelevant for those projects).
--     last_meaningful_movement_at's threshold-gated bump is completely
--     unchanged — the override concept only touches which number
--     percent_complete shows and whether it counts as an override for
--     rollup-expiry purposes, never the stall clock.
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
        percent_override_at = case
          when exists (
            select 1 from workflow.project_floors where project_id = new.subject_id
          ) then new.recorded_at
          else null
        end,
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
  'AFTER INSERT on workflow.progress_updates. Still the ONLY write path
   to projects.percent_complete (Brief 002/migration 003 — projects has
   no UPDATE policy, by design). Migration 008 (Amendment §2.2) adds
   percent_override_at: stamped with this row''s recorded_at when the
   project being updated has floor rows (this insert IS an override on a
   rollup-tracked project), left null otherwise (an ordinary
   entered-percent project, unchanged behaviour). last_meaningful_
   movement_at''s threshold-gated bump (Brief 001 §4.6) and percent_
   complete''s unconditional set-to-new_percent (Brief 002 §4 rule 1) are
   both byte-for-byte unchanged from migration 003''s version.';

-- Trigger itself is unchanged (same name, same timing, same function) —
-- re-stated so this file is a complete, standalone record, same
-- convention migration 003 followed for the identical reason.
drop trigger if exists progress_updates_bump_movement on workflow.progress_updates;

create trigger progress_updates_bump_movement
after insert on workflow.progress_updates
for each row
execute function workflow.bump_last_meaningful_movement();

commit;
