-- =============================================================================
-- ADTECH Workflow Tracker — Migration 001: project scaffold and schema
-- Brief: ADTECH_WF_Brief_001_Project_Scaffold_And_Schema
-- Addendum folded in: ADTECH_WF_Brief_001A_Stages_And_Approval_Steps_Lookup_Tables
--   (Case A — 001 had not shipped to prod yet, so 001A's tables and column
--   changes live here rather than in a 002. See §1A below, and
--   projects/requests.current_stage_id.)
--
-- Applies BY HAND in the Supabase SQL editor, before any matching code is
-- merged (settled practice carried over from the CMMS — DB sits ahead of
-- code). This migration creates schema `workflow` and everything in it.
-- It creates, alters, and drops NOTHING in `public`. The only `public`
-- object referenced is `public.user_profiles`, purely for identity FKs.
-- Every FK to public.user_profiles is ON DELETE RESTRICT: this app never
-- silently loses or orphans who did what because an identity row vanished
-- out from under it — deactivation (workflow.members.is_active), not
-- deletion, is the intended path, mirroring the stages/approval_steps
-- deactivate-not-delete convention below.
--
-- MANUAL STEP REQUIRED AFTER RUNNING THIS FILE (cannot be done from code):
--   Project Settings > API > Exposed schemas — add `workflow` alongside
--   `public`. PostgREST only serves schemas on that list; until this is
--   done, every query from the app will 404. See the result doc.
-- =============================================================================

create schema if not exists workflow;

comment on schema workflow is
  'ADTECH Workflow Tracker. Separate application from the ADTECH CMMS, '
  'sharing this Supabase project/database but isolated to this schema. '
  'Nothing belonging to this app lives in `public`. See '
  'ADTECH_WF_Brief_001_Project_Scaffold_And_Schema.';

-- -----------------------------------------------------------------------------
-- 0. ORGS  (implied by "every root table carries org_id ... defaulting to a
--    single seeded ADTECH org" — Brief §3 MULTI-TENANCY. Not itemised under
--    §5's table list, added here because org_id needs something valid to
--    default to and reference.)
-- -----------------------------------------------------------------------------

create table workflow.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

comment on table workflow.orgs is
  'Tenant root. One seeded ADTECH row today; multi-tenancy is scaffolded '
  'for cheap future extension, not for use — no tenant-switching UI.';

-- Fixed, well-known id so every other table's org_id default can reference
-- it directly, and so this migration is idempotent-in-spirit on re-read.
insert into workflow.orgs (id, name)
values ('00000000-0000-0000-0000-000000000001', 'ADTECH');

-- -----------------------------------------------------------------------------
-- 1. IDENTITY AND ACCESS
-- -----------------------------------------------------------------------------

create table workflow.members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001'
              references workflow.orgs (id),
  user_id     uuid not null references public.user_profiles (id) on delete restrict,
  team        text not null,
  role        text not null default 'member',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, user_id),
  constraint members_team_check check (team in (
    'sales', 'tender', 'a_and_a', 'finance', 'procurement_local',
    'procurement_overseas', 'logistics', 'qs', 'project_management',
    'tnc', 'shop_drawing', 'qc'
  )),
  constraint members_role_check check (role in ('member', 'manager', 'admin'))
);

comment on table workflow.members is
  'Existence of an active row here IS access to this app. Having a CMMS '
  'account does not grant access — only a workflow.members row does. '
  'Reads public.user_profiles for identity only, never .role (those are '
  'CMMS roles and mean nothing here).';

-- SECURITY DEFINER helpers, scoped to this schema. Do NOT reuse
-- public.is_admin() — that is CMMS role vocabulary.

create function workflow.is_member()
returns boolean
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select exists (
    select 1 from workflow.members m
    where m.user_id = auth.uid() and m.is_active
  );
$$;

create function workflow.is_manager()
returns boolean
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select exists (
    select 1 from workflow.members m
    where m.user_id = auth.uid() and m.is_active
      and m.role in ('manager', 'admin')
  );
$$;

create function workflow.current_team()
returns text
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select m.team from workflow.members m
  where m.user_id = auth.uid() and m.is_active
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- 1A. STAGES AND APPROVAL STEPS  (Brief 001A addendum, folded into 001 —
--     Case A: 001 had not yet shipped to prod, so this lives here rather
--     than in its own 002. Lookup tables, not enums: "discovery output is
--     data, not design" (Brief 001A §1). Both seeded EMPTY — filling them
--     in later is data entry, not a migration.)
-- -----------------------------------------------------------------------------

create table workflow.stages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001'
              references workflow.orgs (id),
  scope_type  text not null,
  code        text not null,
  label_en    text not null,
  label_km    text,
  sequence    integer not null,
  owner_team  text not null,
  is_terminal boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, scope_type, code)
);

comment on table workflow.stages is
  'Per-scope-type stage list. Screen 4a groups the board by WHO MUST ACT '
  'NEXT — "one owner, one clock" — so owner_team is an attribute of the '
  'stage, not inferred by the board (Brief 001A §3). Deliberately no '
  'CHECK on scope_type: the list is not confirmed pending stakeholder '
  'discovery. Seeded with zero rows.';

comment on column workflow.stages.sequence is
  'NOT unique, no unique index. Seed/enter in steps of 10 so a stage '
  'discovered later inserts between two existing ones without '
  'renumbering the list. Sort by sequence, then code as a stable '
  'tiebreak.';

comment on column workflow.stages.owner_team is
  'The team holding the work at this stage — not free text against the '
  'members.team vocabulary by CHECK, since that would re-couple this '
  'table to a list that can independently drift.';

create table workflow.approval_steps (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null default '00000000-0000-0000-0000-000000000001'
                 references workflow.orgs (id),
  applies_to     text not null,
  scope_type     text,
  code           text not null,
  label_en       text not null,
  label_km       text,
  sequence       integer not null,
  approver_team  text not null,
  approver_role  text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  constraint approval_steps_applies_to_check check (
    applies_to in ('project', 'variation', 'material_requisition', 'request')
  )
);

comment on table workflow.approval_steps is
  'Who signs what, in what order. scope_type null = applies to all scope '
  'types. approver_role null = any member of approver_team. Seeded with '
  'zero rows — the one already-known chain (material requisition: QS '
  'then management) is deliberately NOT inserted here; it enters as data '
  'in the same pass as everything else the discovery sessions confirm, '
  'per Brief 001A §3, so there is exactly one moment these tables are '
  'populated rather than two. applies_to is a real enumeration (it names '
  'a fixed set of record kinds this app itself defines, unlike '
  'scope_type/stage/approval codes, which are stakeholder-owned lists) '
  'so it keeps its CHECK constraint.';

create unique index approval_steps_org_applies_scope_code_key
  on workflow.approval_steps (org_id, applies_to, coalesce(scope_type, ''), code);

-- -----------------------------------------------------------------------------
-- 2. CORE ENTITIES
-- -----------------------------------------------------------------------------

create table workflow.clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001'
              references workflow.orgs (id),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table workflow.sites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001'
              references workflow.orgs (id),
  client_id   uuid not null references workflow.clients (id),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table workflow.sites is
  'This app''s own sites table. Does NOT share public.sites with the CMMS.';

create table workflow.projects (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null default '00000000-0000-0000-0000-000000000001'
                              references workflow.orgs (id),
  client_id                   uuid not null references workflow.clients (id),
  site_id                     uuid references workflow.sites (id),
  name                        text not null,
  scope_type                  text,
  stream                      text not null,
  so_number                   text,
  so_assigned_at              timestamptz,
  owner_id                    uuid references public.user_profiles (id) on delete restrict,
  percent_complete            integer not null default 0,
  last_meaningful_movement_at timestamptz,
  status                      text not null default 'open',
  current_stage_id            uuid references workflow.stages (id) on delete restrict,
  opened_at                   timestamptz not null default now(),
  closed_at                   timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint projects_stream_check check (stream in ('elv', 'bms', 'fas', 'other')),
  constraint projects_percent_complete_check check (percent_complete between 0 and 100),
  constraint projects_so_number_format_check check (
    so_number is null or so_number ~ '^AD[0-9]{4}-V?[0-9]{2}[TSCPD]$'
  )
);

comment on table workflow.projects is
  'A tracker project and an SO are the same row (Brief §4.3). so_number is '
  'nullable: a won job with no SO number yet is still a real record '
  '(screen 2b). VAT and non-VAT are separate registers — the full code '
  'string is the unique value, a shared sequence number is not a duplicate.';

comment on column workflow.projects.so_number is
  'Format ADxxxx-xx{T|S|C|P|D}, VAT variant carries V before the year: '
  'AD0746-V26S. Non-VAT: AD0746-26S.';

comment on column workflow.projects.percent_complete is
  'Entered directly by a progress update (Brief §4.2). Never rolled up '
  'from project_items — sub-items have no percent, on purpose.';

comment on column workflow.projects.last_meaningful_movement_at is
  'Bumped only when a progress_updates row against this project has '
  'meets_threshold = true (Brief §4.6). Do not write to this column '
  'directly — see the progress_updates_bump_movement trigger below.';

comment on column workflow.projects.current_stage_id is
  'Nullable: a project created before its scope type''s stage list exists '
  'has no stage, and the board must render that without breaking (Brief '
  '001A §4.2). ON DELETE RESTRICT — a stage in use must not be '
  'deletable; deactivate it (stages.is_active) instead. Distinct from '
  'status: status is the record''s lifecycle (open/closed/cancelled), '
  'stage is where the work sits. Do not merge them.';

create unique index projects_org_so_number_key
  on workflow.projects (org_id, so_number)
  where so_number is not null;

create table workflow.variations (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references workflow.projects (id),
  description       text not null,
  is_approved       boolean not null default false,
  committed_amount  numeric(14, 2),
  raised_at         timestamptz not null default now(),
  approved_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table workflow.variations is
  'Nested under the parent project. Variations are never promoted to '
  'their own project/SO — see Brief §4.3.';

create table workflow.project_items (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references workflow.projects (id),
  title           text not null,
  pic_id          uuid references public.user_profiles (id) on delete restrict,
  scheduled_date  date,
  status          text not null default 'open',
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table workflow.project_items is
  'No percent column — deliberate, see Brief §4.2. pic_id + scheduled_date '
  'together are what make the PIC concurrency breach query possible '
  '(Brief §4.5): group by pic_id, scheduled_date, count(distinct '
  'project_id) > 3. Detection only — no constraint enforces the limit.';

-- -----------------------------------------------------------------------------
-- 3. REQUEST LIFECYCLE (themes 1 and 4)
-- -----------------------------------------------------------------------------

create table workflow.requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default '00000000-0000-0000-0000-000000000001'
                      references workflow.orgs (id),
  client_id           uuid references workflow.clients (id),
  site_id             uuid references workflow.sites (id),
  scope_type          text,
  body                text not null,
  requester_id        uuid not null references public.user_profiles (id) on delete restrict,
  current_owner_id    uuid references public.user_profiles (id) on delete restrict,
  current_stage_id    uuid references workflow.stages (id) on delete restrict,
  destination_team    text,
  destination_unsure  boolean not null default false,
  project_id          uuid references workflow.projects (id),
  opened_at           timestamptz not null default now(),
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint requests_destination_team_check check (
    destination_team is null or destination_team in (
      'sales', 'tender', 'a_and_a', 'finance', 'procurement_local',
      'procurement_overseas', 'logistics', 'qs', 'project_management',
      'tnc', 'shop_drawing', 'qc'
    )
  )
);

comment on column workflow.requests.destination_unsure is
  'Backs screen 1a''s first-class "I''m not sure" button, which routes to '
  'triage.';

comment on column workflow.requests.current_stage_id is
  'Nullable: a request in triage (destination_unsure = true) has no '
  'stage yet (Brief 001A §4.1). ON DELETE RESTRICT — deactivate the '
  'stage instead of deleting it.';

create table workflow.request_handoffs (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references workflow.requests (id),
  from_owner_id  uuid references public.user_profiles (id) on delete restrict,
  to_owner_id    uuid not null references public.user_profiles (id) on delete restrict,
  stage          text,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  created_at     timestamptz not null default now()
);

comment on table workflow.request_handoffs is
  'APPEND-ONLY. Makes screen 1e''s per-leg durations and bounce detection '
  'possible, and lets delay be attributed to a STAGE rather than a '
  'person — do not model this as blame on an individual (Brief §5). No '
  'UPDATE or DELETE policy exists for any client role, by design.';

-- -----------------------------------------------------------------------------
-- 4. PROGRESS REPORTING (theme 6)
-- -----------------------------------------------------------------------------

create table workflow.reason_codes (
  code        text primary key,
  label_en    text not null,
  label_km    text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  stream      text,
  created_at  timestamptz not null default now(),
  constraint reason_codes_stream_check check (
    stream is null or stream in ('elv', 'bms', 'fas', 'other')
  )
);

comment on table workflow.reason_codes is
  'Reference table, not an enum or a CHECK — the design draws this list '
  'hatched (provisional, to be confirmed in stakeholder interviews) and '
  'it needs Khmer labels (Brief §4.4). stream null = applies to all '
  'streams. progress_updates stores the CODE, never the label.';

comment on column workflow.reason_codes.code is
  'Stable, ASCII, never translated.';

insert into workflow.reason_codes (code, label_en, label_km, sort_order, is_active, stream) values
  ('awaiting_client',          'Awaiting client',          '[provisional — km TBD: awaiting_client]',          10, true, null),
  ('awaiting_material',        'Awaiting material',        '[provisional — km TBD: awaiting_material]',        20, true, null),
  ('awaiting_approval',        'Awaiting approval',        '[provisional — km TBD: awaiting_approval]',        30, true, null),
  ('technical_clarification',  'Technical clarification',  '[provisional — km TBD: technical_clarification]',  40, true, null),
  ('manpower',                 'Manpower',                 '[provisional — km TBD: manpower]',                 50, true, null),
  ('site_access',              'Site access',               '[provisional — km TBD: site_access]',              60, true, null),
  ('rework',                   'Rework',                   '[provisional — km TBD: rework]',                   70, true, null),
  ('no_blocker_on_track',      'No blocker — on track',    '[provisional — km TBD: no_blocker_on_track]',      80, true, null);

comment on column workflow.reason_codes.label_km is
  'Placeholder text pending real Khmer translations from stakeholder '
  'interviews — every seeded row is provisional, per Brief §4.4.';

create table workflow.reporting_periods (
  id          uuid primary key default gen_random_uuid(),
  starts_on   date not null,
  ends_on     date not null,
  stream      text,
  created_at  timestamptz not null default now(),
  constraint reporting_periods_stream_check check (
    stream is null or stream in ('elv', 'bms', 'fas', 'other')
  ),
  constraint reporting_periods_range_check check (ends_on >= starts_on),
  unique (stream, starts_on)
);

comment on table workflow.reporting_periods is
  'Null stream = global period. Per-stream periods become possible later '
  'without a migration (Brief §4.7) — the three source Excel trackers are '
  'not dated together, so a single global week and a per-stream week can '
  'give different answers.';

-- Seed global (stream = null) Monday-to-Sunday weekly periods spanning a
-- window around this brief's date (8 Sep 2026), so the app is not empty
-- on day one. Widen or extend with further inserts as needed later.
insert into workflow.reporting_periods (starts_on, ends_on, stream)
select
  d::date as starts_on,
  (d + interval '6 days')::date as ends_on,
  null as stream
from generate_series(
  date_trunc('week', date '2026-07-06'),
  date_trunc('week', date '2026-12-28'),
  interval '7 days'
) as d;

create table workflow.progress_updates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null default '00000000-0000-0000-0000-000000000001'
                  references workflow.orgs (id),
  subject_type    text not null,
  subject_id      uuid not null,
  period_id       uuid references workflow.reporting_periods (id),
  author_id       uuid not null references public.user_profiles (id) on delete restrict,
  recorded_at     timestamptz not null default now(),
  old_percent     integer,
  new_percent     integer,
  delta           integer,
  meets_threshold boolean generated always as (delta is not null and abs(delta) >= 5) stored,
  is_no_change    boolean not null default false,
  reason_code     text not null references workflow.reason_codes (code),
  reason_note     text,
  created_at      timestamptz not null default now(),
  constraint progress_updates_subject_type_check check (subject_type in ('project', 'item')),
  constraint progress_updates_percent_range_check check (
    (old_percent is null or old_percent between 0 and 100) and
    (new_percent is null or new_percent between 0 and 100)
  ),
  constraint progress_updates_item_has_no_percent_check check (
    subject_type = 'project' or (old_percent is null and new_percent is null and delta is null)
  )
);

comment on table workflow.progress_updates is
  'APPEND-ONLY. No UPDATE or DELETE policy for any client role — a '
  'correction is a new row, not an edit (Brief §4.1, mirrors the CMMS '
  'blocked_writes pattern). subject_id is polymorphic (projects.id when '
  'subject_type = ''project'', project_items.id when ''item'') so it '
  'carries no FK — referential integrity there is an application '
  'concern, not a database one, in this migration.';

comment on column workflow.progress_updates.meets_threshold is
  'DERIVED: abs(delta) >= 5, stored for query speed (Brief §4.6). Never '
  'written directly.';

comment on column workflow.progress_updates.reason_code is
  'NOT NULL — the mandatory-reason rule is enforced at the database '
  'level, not only in the form (Brief §4.2/§4.4).';

-- Brief §4.6: "projects.last_meaningful_movement_at is bumped ONLY when
-- meets_threshold is true." Enforced here so it holds regardless of which
-- code path inserts a progress_updates row.
create function workflow.bump_last_meaningful_movement()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if new.subject_type = 'project' and new.meets_threshold then
    update workflow.projects
    set last_meaningful_movement_at = new.recorded_at,
        updated_at = now()
    where id = new.subject_id;
  end if;
  return new;
end;
$$;

create trigger progress_updates_bump_movement
after insert on workflow.progress_updates
for each row
execute function workflow.bump_last_meaningful_movement();

-- -----------------------------------------------------------------------------
-- 5. CATALOGUE (theme 3) — tables only, no UI this brief
-- -----------------------------------------------------------------------------

create table workflow.catalogue_items (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null default '00000000-0000-0000-0000-000000000001'
                      references workflow.orgs (id),
  manufacturer        text not null,
  part_number         text not null,
  description         text,
  lifecycle_step      integer not null default 1,
  successor_item_id   uuid references workflow.catalogue_items (id),
  last_verified_by_id uuid references public.user_profiles (id) on delete restrict,
  last_verified_at    timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint catalogue_items_lifecycle_step_check check (lifecycle_step between 1 and 4)
);

create table workflow.catalogue_events (
  id                 uuid primary key default gen_random_uuid(),
  catalogue_item_id  uuid not null references workflow.catalogue_items (id),
  lifecycle_step     integer not null,
  reason             text,
  effective_date     date not null default current_date,
  recorded_by_id     uuid references public.user_profiles (id) on delete restrict,
  recorded_at        timestamptz not null default now(),
  constraint catalogue_events_lifecycle_step_check check (lifecycle_step between 1 and 4)
);

comment on table workflow.catalogue_events is
  'Lifecycle status is a four-step scale where every step carries a '
  'reason and a date — a status with no reason gets ignored within a '
  'month, which is the whole point (Brief §5).';

-- -----------------------------------------------------------------------------
-- 6. PROCUREMENT AND DEPENDENCIES (theme 2)
-- -----------------------------------------------------------------------------

create table workflow.procurement_lines (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references workflow.projects (id),
  sourcing_started_at timestamptz,
  mr_submitted_at     timestamptz,
  mr_approved_at      timestamptz,
  po_issued_at        timestamptz,
  delivery_received   integer not null default 0,
  delivery_total      integer,
  customs_status      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint procurement_lines_delivery_check check (
    delivery_total is null or (delivery_received between 0 and delivery_total)
  )
);

comment on table workflow.procurement_lines is
  'Two phases, two separate clocks (Brief §5): sourcing may start as soon '
  'as SO + BOQ exist, commitment only after the MR is approved. Delivery '
  'is a fraction (delivery_received/delivery_total), not a tick. Customs '
  'clearance is its own visible step, not folded into "in transit".';

create table workflow.dependency_links (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references workflow.projects (id),
  sequence      integer not null,
  name          text not null,
  days_allowed  integer,
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz not null default now(),
  unique (project_id, sequence)
);

comment on table workflow.dependency_links is
  'Chain: drawing approval, submittal, PO, delivery, installation, T&C '
  '(Brief §5).';

-- =============================================================================
-- ROW LEVEL SECURITY
--
-- RLS is ENABLED on every table in this schema, no exceptions. Where the
-- brief gives an explicit permission rule, the matching policy is written
-- below. Where it does not (most tables' INSERT/UPDATE), NO policy is
-- created for that command — RLS default-denies it. This is deliberate:
-- see the result doc for which write paths are intentionally left closed
-- pending a permission-model decision in a future brief, rather than
-- guessed at here.
-- =============================================================================

alter table workflow.orgs               enable row level security;
alter table workflow.members            enable row level security;
alter table workflow.stages             enable row level security;
alter table workflow.approval_steps     enable row level security;
alter table workflow.clients            enable row level security;
alter table workflow.sites              enable row level security;
alter table workflow.projects           enable row level security;
alter table workflow.variations         enable row level security;
alter table workflow.project_items      enable row level security;
alter table workflow.requests           enable row level security;
alter table workflow.request_handoffs   enable row level security;
alter table workflow.reason_codes       enable row level security;
alter table workflow.reporting_periods  enable row level security;
alter table workflow.progress_updates   enable row level security;
alter table workflow.catalogue_items    enable row level security;
alter table workflow.catalogue_events   enable row level security;
alter table workflow.procurement_lines  enable row level security;
alter table workflow.dependency_links   enable row level security;

-- Read access: any active member may read everything in their (single,
-- seeded) org's worth of data. No narrower read scoping is specified
-- anywhere in the brief.

create policy orgs_select on workflow.orgs
  for select using (workflow.is_member());

create policy members_select on workflow.members
  for select using (workflow.is_member());
create policy members_insert on workflow.members
  for insert with check (workflow.is_manager());
create policy members_update on workflow.members
  for update using (workflow.is_manager()) with check (workflow.is_manager());

-- stages / approval_steps: read-only from the app's perspective for now.
-- No admin UI exists yet (Brief 001A §6) — rows are entered by hand in
-- the SQL editor, i.e. as the table owner/service role, which bypasses
-- RLS entirely. No INSERT/UPDATE policy is created here for the same
-- reason as the other unspecified write paths — see the result doc.
create policy stages_select on workflow.stages
  for select using (workflow.is_member());

create policy approval_steps_select on workflow.approval_steps
  for select using (workflow.is_member());

create policy clients_select on workflow.clients
  for select using (workflow.is_member());

create policy sites_select on workflow.sites
  for select using (workflow.is_member());

create policy projects_select on workflow.projects
  for select using (workflow.is_member());

create policy variations_select on workflow.variations
  for select using (workflow.is_member());

create policy project_items_select on workflow.project_items
  for select using (workflow.is_member());

create policy requests_select on workflow.requests
  for select using (workflow.is_member());

create policy request_handoffs_select on workflow.request_handoffs
  for select using (workflow.is_member());
create policy request_handoffs_insert on workflow.request_handoffs
  for insert with check (workflow.is_member());
-- No UPDATE or DELETE policy — append-only, per Brief §5.

create policy reason_codes_select on workflow.reason_codes
  for select using (workflow.is_member());
create policy reason_codes_insert on workflow.reason_codes
  for insert with check (workflow.is_manager());
create policy reason_codes_update on workflow.reason_codes
  for update using (workflow.is_manager()) with check (workflow.is_manager());

create policy reporting_periods_select on workflow.reporting_periods
  for select using (workflow.is_member());
create policy reporting_periods_insert on workflow.reporting_periods
  for insert with check (workflow.is_manager());
create policy reporting_periods_update on workflow.reporting_periods
  for update using (workflow.is_manager()) with check (workflow.is_manager());

-- progress_updates: append-only, and INSERT is restricted to exactly who
-- Brief §4.7 names — the project's owner, the item's PIC, or a manager.
create policy progress_updates_select on workflow.progress_updates
  for select using (workflow.is_member());
create policy progress_updates_insert on workflow.progress_updates
  for insert with check (
    author_id = auth.uid()
    and (
      workflow.is_manager()
      or (
        subject_type = 'project'
        and exists (
          select 1 from workflow.projects p
          where p.id = subject_id and p.owner_id = auth.uid()
        )
      )
      or (
        subject_type = 'item'
        and exists (
          select 1 from workflow.project_items i
          where i.id = subject_id and i.pic_id = auth.uid()
        )
      )
    )
  );
-- No UPDATE or DELETE policy — append-only, per Brief §4.1.

create policy catalogue_items_select on workflow.catalogue_items
  for select using (workflow.is_member());

create policy catalogue_events_select on workflow.catalogue_events
  for select using (workflow.is_member());

create policy procurement_lines_select on workflow.procurement_lines
  for select using (workflow.is_member());

create policy dependency_links_select on workflow.dependency_links
  for select using (workflow.is_member());
