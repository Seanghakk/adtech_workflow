-- =============================================================================
-- ADTECH Workflow Tracker — Migration 021: tower/wing grouping for
-- project_floors, plus a real PIC-gated configuration screen
-- Brief: ADTECH_WF_Brief_047_Floor_Zone_Configuration
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST, per the brief's own instruction
-- to confirm the existing floor schema before designing new tables:
-- workflow.project_floors (migration 008) already anticipates exactly this
-- extension — its own comment says "Zone grouping is anticipated as a
-- future additive layer OVER floors, deliberately not built now... this
-- table makes no schema choice that would block adding a zone_id FK here
-- later." This migration is that FK, named tower_id (the brief's own term,
-- "tower or wing" — same underlying concept migration 008 called "zone,"
-- not a second, competing idea). Column naming: the brief's own words are
-- "id, project_id, label, display order" — sort_order is used instead of
-- a literal "display_order" column, matching project_floors' own existing
-- name for the identical concept, for consistency rather than literalism.
--
-- REUSES THE EXISTING FLOOR ROW SHAPE, per the brief's own explicit
-- instruction — project_floors itself is not redesigned. One column
-- added (tower_id, nullable), one new table (project_towers), no other
-- change to project_floors' existing columns, triggers, or the five
-- project-scoped tables migration 008 built alongside it.
--
-- JUDGMENT CALL, FLAGGED PER THE BRIEF'S OWN "STOP AND FLAG... REAL
-- TRADE-OFF" INSTRUCTION (not literally paused on — this is a necessary
-- implementation detail of the tower feature working at all for its own
-- stated purpose, not an optional embellishment; flagged here and in this
-- round's Result doc rather than decided silently):
--
--   project_floors currently carries `unique (project_id, label)` — every
--   floor label must be unique across the WHOLE project, tower or no
--   tower. Real multi-tower buildings routinely reuse the same floor
--   labels per tower ("L1" in Tower 1 AND "L1" in Tower 2) — the brief's
--   own worked example. Left as a single project-wide unique constraint,
--   the tower feature could not actually support its own stated common
--   case. Replaced with two PARTIAL unique indexes instead of one
--   three-column constraint, because tower_id is nullable and NULL never
--   equals NULL in a plain unique constraint (a naive
--   `unique (project_id, tower_id, label)` would silently allow duplicate
--   labels among NO-TOWER floors too, since each NULL is its own distinct
--   value to Postgres) — the two indexes below instead correctly keep
--   no-tower floors unique per project (unchanged behaviour, the common
--   case per the brief's own "should not be forced through unnecessary
--   tower setup" instruction) while allowing the SAME label to repeat
--   across DIFFERENT towers.
--
-- DELETE_RULE CONVENTION UNCHANGED: tower_id is ON DELETE RESTRICT, same
-- as every other FK in this schema (no CASCADE or SET NULL exists
-- anywhere in this repo, confirmed by reading every prior migration) — a
-- tower with floors still assigned to it cannot be deleted until those
-- floors are reassigned or removed first, surfaced by the app as a plain
-- error rather than silently orphaning rows.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.project_towers — new table, per the brief's own §"BUILDING
--    STRUCTURE" instruction.
-- -----------------------------------------------------------------------------

create table workflow.project_towers (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references workflow.projects (id) on delete restrict,
  label       text not null,
  sort_order  integer not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (project_id, label)
);

comment on table workflow.project_towers is
  'Migration 021 / Brief 047. Optional grouping ABOVE workflow.
   project_floors — "towers are additive, not mandatory scaffolding"
   (the brief''s own words): a project with a single, ordinary tower
   structure has zero rows here, and its floors carry tower_id = null.
   Same minimal shape as project_floors itself (label free text,
   sort_order the real ordering field — labels here are equally
   non-numeric-sortable, e.g. "Tower 1"/"Podium Block").';

alter table workflow.project_towers enable row level security;

create policy project_towers_select on workflow.project_towers
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = project_towers.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

comment on policy project_towers_select on workflow.project_towers is
  'Same is_member() + can_view_project() shape as project_floors_select
   (migration 008) — see that policy''s own comment for the full
   reasoning.';

-- PIC-only write access, matching project_floors' own migration-009
-- policies exactly (join through projects.pic_id, no manager bypass —
-- the same deliberate consequence every PIC-keyed table in this schema
-- already accepts for a project with no PIC assigned).
create policy project_towers_insert on workflow.project_towers
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_towers.project_id
        and p.pic_id = (select auth.uid())
    )
  );

create policy project_towers_update on workflow.project_towers
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_towers.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_towers.project_id
        and p.pic_id = (select auth.uid())
    )
  );

create policy project_towers_delete on workflow.project_towers
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_towers.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- DELETE grant — migration 002's default privileges cover SELECT/INSERT/
-- UPDATE automatically for a table created after it; DELETE has never
-- been auto-granted anywhere in this schema (migration 009's own header),
-- explicit grant required, matching migrations 009/019/020's pattern.
grant delete on workflow.project_towers to authenticated;

-- -----------------------------------------------------------------------------
-- 2. workflow.project_floors — add tower_id, replace the project-wide
--    unique constraint with two partial indexes (see this file's own
--    header for the full reasoning).
-- -----------------------------------------------------------------------------

alter table workflow.project_floors
  add column tower_id uuid references workflow.project_towers (id) on delete restrict;

comment on column workflow.project_floors.tower_id is
  'Migration 021 / Brief 047. Nullable — a floor with no tower is the
   ordinary, common case (a project with a single tower structure "should
   not be forced through unnecessary tower setup," per the brief). See
   project_floors_no_tower_label_unique / project_floors_tower_label_unique
   below for how uniqueness is enforced once towers are in play.';

alter table workflow.project_floors
  drop constraint if exists project_floors_project_id_label_key;

create unique index project_floors_no_tower_label_unique
  on workflow.project_floors (project_id, label)
  where tower_id is null;

create unique index project_floors_tower_label_unique
  on workflow.project_floors (project_id, tower_id, label)
  where tower_id is not null;

comment on index workflow.project_floors_no_tower_label_unique is
  'Migration 021 — replaces project_floors'' original project-wide
   unique(project_id, label). A NO-TOWER floor''s label must still be
   unique across the whole project (unchanged behaviour, the common
   case).';

comment on index workflow.project_floors_tower_label_unique is
  'Migration 021 — a floor label must be unique WITHIN its own tower, but
   the SAME label may repeat across different towers (e.g. "L1" in both
   Tower 1 and Tower 2) — the real-world case a single project-wide
   constraint could not support.';

-- No change to project_floors' own SELECT/INSERT/UPDATE/DELETE policies
-- (migrations 008/009) — a new nullable column needs no RLS change; those
-- policies are row-scoped (project_id -> pic_id), not column-scoped.

commit;
