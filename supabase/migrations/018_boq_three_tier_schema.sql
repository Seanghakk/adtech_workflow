-- =============================================================================
-- ADTECH Workflow Tracker — Migration 018: three-tier BOQ schema
-- Brief: ADTECH_WF_Brief_027_BOQ_Schema_Three_Tier
-- Product decision: ADTECH_WF_BOQ_Architecture_And_MR_Gating_Decision
--
-- SCHEMA ONLY, NO UI THIS ROUND — same convention migration 001 used for
-- workflow.catalogue_items/catalogue_events ("tables only, no UI this
-- brief"). Brief 026 (material requisition) depends on this and is not
-- started here; this migration only makes sure the BOQ line tables exist
-- with what an MR line will need to reference (§1 below).
--
-- THREE TABLES, NOT ONE POLYMORPHIC TABLE, per the brief's own §1: Tender
-- BOQ and Shop Drawing BOQ share a shape (system-scoped, full part
-- number, per-location quantity); Contract BOQ is deliberately looser
-- (project-scoped only, brand-only, no location, no pricing). Forcing
-- these into one table with a tier column would leave most columns null
-- most of the time depending on tier — the same reasoning this schema
-- already avoided elsewhere (e.g. procurement_lines vs. dependency_links
-- staying separate tables rather than one "activity" table).
--
-- NO PRICING COLUMNS ANYWHERE IN THIS MIGRATION. Confirmed directly from
-- the design doc §1: Contract BOQ carries pricing/VAT/discount in the
-- real source documents, and it is DELIBERATELY excluded here — this
-- schema is for material requisition and variance tracking, not costing.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.tender_boq_lines + workflow.tender_boq_line_locations — §1
--
-- system_type is plain text, unconstrained — NOT a new lookup table.
-- Confirmed directly against workflow.checklist_templates (migration 008,
-- Brief 007 §7): that table already established this exact convention for
-- the identical reason ("the full list of system types... was not
-- specified... needs to come from him directly" — constraining or even
-- enumerating the list here would be inventing it). Reused, not
-- reinvented, per this brief's own instruction not to build a second
-- lookup table if an equivalent pattern already exists.
--
-- Per-location quantity is a CHILD TABLE (tender_boq_line_locations), not
-- one column per location: the location list is open-ended and
-- project-specific (floors, basements, roof levels, AND lift-specific
-- locations — confirmed from the design doc §3, not a fixed enum), so a
-- fixed column layout cannot hold it.
--
-- location_label is FREE TEXT here, not a foreign key to
-- workflow.project_floors — Tender BOQ data is entered before a project
-- necessarily HAS real floor rows (floor rows are PIC-defined at kickoff,
-- per the still-evolving Brief 007 floor-entry UI; design doc §5). See
-- workflow.tender_boq_location_map below (§3) for the manual reconciliation
-- step this requires once real floor rows exist.
--
-- part_number/model are both included per this brief's own explicit
-- column list (§1). NOTE: the design doc's own recount of the real Shop
-- Drawing BOQ sample lists "item, description, model, brand, unit, total
-- qty, remarks" without separately calling out "item" as its own column
-- beyond the row itself — this migration does NOT add a separate
-- item_no/item_code column, since neither document confirms one exists as
-- a distinct field and this session has no access to the real sample
-- files to check. Flagged in the Result rather than guessed.
-- -----------------------------------------------------------------------------

create table workflow.tender_boq_lines (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references workflow.projects (id) on delete restrict,
  system_type         text not null,
  description         text not null,
  brand               text,
  model               text,
  part_number         text,
  unit                text not null,
  total_quantity      integer not null,
  remarks             text,
  -- §4 — running total of quantity requested via MR lines referencing
  -- this row. Plain application-maintained column, matching
  -- workflow.procurement_lines.delivery_received's own shape (migration
  -- 001) rather than a DB trigger — this schema has exactly one
  -- trigger-based propagation anywhere (bump_last_meaningful_movement,
  -- migration 001/003), reserved for a much higher-frequency "activity"
  -- signal, not a simple running sum. No writer exists yet — Brief 026's
  -- own MR write path is what will update this; a cumulative running
  -- total also already resolves the design doc §6 open question about
  -- partial requests (5 of 20 units) without needing a separate flag.
  requested_quantity  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table workflow.tender_boq_lines is
  'Brief 027 / design doc §1. Front-end-phase data (produced during
   tendering, for costing) entering the app AHEAD of the Tender workflow
   itself, which remains unbuilt — a deliberate scope carve-out to make
   variance tracking possible now, not scope creep into that deferred
   phase. Selections may still be provisional at this stage (design doc
   §1) — this table does not model an approval/lock state.';

create table workflow.tender_boq_line_locations (
  tender_boq_line_id  uuid not null references workflow.tender_boq_lines (id) on delete restrict,
  location_label      text not null,
  quantity            integer not null,
  primary key (tender_boq_line_id, location_label)
);

comment on table workflow.tender_boq_line_locations is
  'Composite PK, no surrogate id — same minimal join-table shape
   workflow.procurement_line_floors and workflow.qc_inspection_floors
   already use (migrations 008/015), extended with one data column
   (quantity) since, unlike those two, a location here carries real
   per-row data rather than being a pure membership join. location_label
   is free text, not yet linked to a real project_floors row — see
   workflow.tender_boq_location_map.';

alter table workflow.tender_boq_lines enable row level security;
alter table workflow.tender_boq_line_locations enable row level security;

drop policy if exists tender_boq_lines_select on workflow.tender_boq_lines;
create policy tender_boq_lines_select on workflow.tender_boq_lines
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = tender_boq_lines.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

comment on policy tender_boq_lines_select on workflow.tender_boq_lines is
  'Same can_view_project() project-scoping shape as procurement_lines_select
   and dependency_links_select (both migration 004) — BOQ data is the same
   "maintenance progress monitoring" theme those tables cover, not the
   is_member()-only shape workflow.catalogue_items uses (a different,
   non-project-scoped domain, migration 004''s own header explicitly
   excludes it from this scoping for that reason).';

drop policy if exists tender_boq_line_locations_select on workflow.tender_boq_line_locations;
create policy tender_boq_line_locations_select on workflow.tender_boq_line_locations
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.tender_boq_lines t
      where t.id = tender_boq_line_locations.tender_boq_line_id
    )
  );

comment on policy tender_boq_line_locations_select on workflow.tender_boq_line_locations is
  'is_member() ALONGSIDE the exists-join, deliberately redundant — the
   same twice-amended pattern workflow.procurement_line_floors_select
   settled on (migration 015, Brief 022 Amendments A and B, read directly
   before writing this). The join alone tracks tender_boq_lines_select
   automatically if that policy ever changes, but carries no check of its
   own if RLS is ever disabled on the parent table; is_member() is what
   keeps this table bounded to application members in that case. Do not
   simplify this down to the join alone.';

-- -----------------------------------------------------------------------------
-- 2. workflow.contract_boq_lines — §1
--
-- Deliberately looser than the other two tiers, per design doc §1/§2:
-- project-scoped only (one contract BOQ can span multiple systems in
-- bespoke sections, confirmed from a real sample), an OPTIONAL free-text
-- section_label (to preserve however the source document grouped things —
-- confirmed varies project to project, NOT a case for a rigid importer),
-- brand only (no part_number, no model), no location/floor column at all
-- (confirmed by design this tier never carries floor breakdown), and NO
-- pricing columns (unit price/total price/VAT/discount all confirmed
-- present in the real documents but commercially irrelevant to material
-- requisition — deliberately left out, not an oversight).
-- -----------------------------------------------------------------------------

create table workflow.contract_boq_lines (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references workflow.projects (id) on delete restrict,
  section_label       text,
  description         text not null,
  brand               text,
  unit                text not null,
  quantity            integer not null,
  -- §4's own dual-reference rule (an MR line may reference EITHER this
  -- table or shop_drawing_boq_lines) means this column belongs here too,
  -- even though the brief's own bullet list names it only once, under
  -- Shop Drawing BOQ — a low-risk, consistent extension, not a new
  -- decision (flagged in the Result rather than left silently implicit).
  requested_quantity  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table workflow.contract_boq_lines is
  'Brief 027 / design doc §2. A ONE-TIME COPY of Tender BOQ at the point
   costing finalizes it (floor breakdown summed to one total, part number
   dropped to brand), NOT a live view over it — quantities are confirmed
   to genuinely diverge between tender and contract, so rows here are
   edited independently from creation onward (§2). Whether that copy
   action gets built, or this stays manual entry, is left as a later UX
   decision per the brief''s own instruction — leaning manual entry first,
   matching this tier''s freeform nature; no copy mechanism exists yet.';

alter table workflow.contract_boq_lines enable row level security;

drop policy if exists contract_boq_lines_select on workflow.contract_boq_lines;
create policy contract_boq_lines_select on workflow.contract_boq_lines
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = contract_boq_lines.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- -----------------------------------------------------------------------------
-- 3. workflow.shop_drawing_boq_lines + workflow.shop_drawing_boq_line_locations — §1
--
-- Same shape as Tender BOQ (system-scoped, full part number, per-location
-- quantity via a child table) — design doc §1's own words: "same
-- location-breakdown shape as Shop Drawing BOQ."
--
-- THE ONE REAL STRUCTURAL DIFFERENCE FROM TENDER BOQ: location here is a
-- REAL FOREIGN KEY to workflow.project_floors, not free text. Shop
-- Drawing BOQ is built late — "substantially complete by ~2/3 of the
-- project timeline" (design doc §1) — by which point the project''s real
-- floor rows already exist (PIC-defined at kickoff). Design doc §5 is
-- explicit that ONLY Tender BOQ''s locations need reconciliation, because
-- only Tender BOQ''s locations are guessed before real floor rows exist;
-- Shop Drawing BOQ needs no equivalent mapping table.
--
-- JUDGMENT CALL, flagged rather than silently assumed: floor_id is NOT
-- NULL here, which means a Shop Drawing BOQ line''s location rows cannot
-- be entered for a project before that project has at least one
-- project_floors row. The design doc''s own "often skipped until very
-- close to project end" does not GUARANTEE floor rows always precede
-- Shop Drawing BOQ entry for every project — if that ordering turns out
-- not to hold in practice, this constraint would need loosening (e.g. an
-- interim free-text location shape mirroring Tender BOQ''s own
-- reconciliation pattern). Confirm this ordering assumption is acceptable
-- before this constraint is relied on by a write UI.
-- -----------------------------------------------------------------------------

create table workflow.shop_drawing_boq_lines (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references workflow.projects (id) on delete restrict,
  system_type         text not null,
  description         text not null,
  brand               text,
  model               text,
  part_number         text,
  unit                text not null,
  total_quantity      integer not null,
  remarks             text,
  requested_quantity  integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table workflow.shop_drawing_boq_lines is
  'Brief 027 / design doc §1. The most accurate BOQ — real floor/zone
   breakdown, real part numbers, read (ideally) off approved shop
   drawings. Manual entry only in this schema; automatically extracting
   this off approved drawings is the long-term goal, explicitly NOT
   something to build in the first pass (design doc §1).';

create table workflow.shop_drawing_boq_line_locations (
  shop_drawing_boq_line_id  uuid not null references workflow.shop_drawing_boq_lines (id) on delete restrict,
  floor_id                  uuid not null references workflow.project_floors (id) on delete restrict,
  quantity                  integer not null,
  primary key (shop_drawing_boq_line_id, floor_id)
);

comment on table workflow.shop_drawing_boq_line_locations is
  'Real FK to workflow.project_floors, unlike tender_boq_line_locations''
   free-text location_label — see this migration''s own §3 header for why
   the two tiers differ here. No cross-project check that floor_id
   actually belongs to shop_drawing_boq_line_id''s own project — the same
   documented-expectation-not-DB-rule choice migration 008 already made
   for qc_inspection_floors'' type/floor pairing, not enforced here either.';

alter table workflow.shop_drawing_boq_lines enable row level security;
alter table workflow.shop_drawing_boq_line_locations enable row level security;

drop policy if exists shop_drawing_boq_lines_select on workflow.shop_drawing_boq_lines;
create policy shop_drawing_boq_lines_select on workflow.shop_drawing_boq_lines
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_boq_lines.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

drop policy if exists shop_drawing_boq_line_locations_select on workflow.shop_drawing_boq_line_locations;
create policy shop_drawing_boq_line_locations_select on workflow.shop_drawing_boq_line_locations
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.shop_drawing_boq_lines s
      where s.id = shop_drawing_boq_line_locations.shop_drawing_boq_line_id
    )
  );

comment on policy shop_drawing_boq_line_locations_select on workflow.shop_drawing_boq_line_locations is
  'Same is_member() + exists-join shape as tender_boq_line_locations_select
   above — see that policy''s own comment for the full reasoning.';

-- -----------------------------------------------------------------------------
-- 4. workflow.tender_boq_location_map — §3
--
-- The manual reconciliation step design doc §5 describes: a Tender BOQ
-- location LABEL, guessed before real floor rows exist, mapped onto the
-- project's real floor-row id once the PIC defines it — the same point
-- they define the project's floor rows, per the design doc, NOT a
-- separate task and NOT automatic fuzzy-matching by name (explicitly
-- ruled out). floor_id stays NULLABLE until mapped; an unmapped row is a
-- valid, expected state to be visibly flagged wherever floor-level
-- variance is shown, never silently dropped (design doc §5) — same
-- "empty is a valid state" discipline this schema already applies to
-- workflow.stages/checklist_templates having zero rows for an
-- undecided key.
--
-- project_id lives directly on this table rather than being derived
-- through a tender_boq_line — a mapping is inherently project-wide (one
-- "L1" label means the same real floor for every Tender BOQ line in that
-- project), not per-line, so this table is keyed on (project, label), not
-- on any single tender_boq_lines row.
-- -----------------------------------------------------------------------------

create table workflow.tender_boq_location_map (
  project_id      uuid not null references workflow.projects (id) on delete restrict,
  location_label  text not null,
  floor_id        uuid references workflow.project_floors (id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (project_id, location_label)
);

comment on table workflow.tender_boq_location_map is
  'Brief 027 §3 / design doc §5. floor_id is nullable until the PIC maps
   this label — an unmapped row is the ordinary, expected state before
   floor rows exist for a project, not an error. Total-quantity variance
   (comparing Tender vs. Shop Drawing BOQ totals summed by item) needs NO
   row here at all and is directly queryable without depending on this
   table — only FLOOR-LEVEL variance needs it (design doc §5, confirmed in
   this migration''s own Result).';

alter table workflow.tender_boq_location_map enable row level security;

drop policy if exists tender_boq_location_map_select on workflow.tender_boq_location_map;
create policy tender_boq_location_map_select on workflow.tender_boq_location_map
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = tender_boq_location_map.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- -----------------------------------------------------------------------------
-- NO INSERT/UPDATE/DELETE POLICY ON ANY TABLE IN THIS MIGRATION.
--
-- Schema only, per this brief's own scope and the same sequencing this
-- project has used since migration 001: RLS default-denies every write
-- until a future round's brief decides who may write BOQ data (§0's own
-- "no policy created for that command" convention, restated once more).
-- Migration 002's default-privilege grants (alter default privileges...)
-- already cover SELECT/INSERT/UPDATE at the GRANT layer for every table
-- created here automatically — nothing to add for that; RLS is the only
-- thing standing between "grantable" and "actually writable," and none
-- of these six tables have a write policy yet.
-- -----------------------------------------------------------------------------

commit;
