-- =============================================================================
-- ADTECH Workflow Tracker — Migration 020: Contract BOQ location breakdown
-- + PIC write access
-- Brief: ADTECH_WF_Brief_046_Amendment_A_Migration_And_Write_Policies §2/§3
--
-- CONFIRMED AGAINST THE LIVE REPO FIRST: migration 018's seven BOQ tables
-- and migration 019's superadmin bypass are both already merged into main.
-- Migration 018 is confirmed live on production per Seanghakk's own direct
-- query against the real project (Amendment A §1.1) — no longer a blocker.
-- Migration 019's live production status is NOT separately re-confirmed by
-- this migration (out of scope here); this migration is written to be
-- idempotent regardless (see the DROP POLICY IF EXISTS pattern below), the
-- same discipline every migration in this repo already follows for exactly
-- this reason.
--
-- CORRECTION TO RESULT 046's OWN PREMISE, found by reading migration 019
-- directly rather than trusted from that earlier, code-only read: Result
-- 046 said contract_boq_lines has "zero write policies... for anyone."
-- That was accurate for ordinary members but incomplete — migration 019
-- (Brief 040) already added three TEMPORARY, superadmin-only policies to
-- contract_boq_lines (contract_boq_lines_insert/update/delete, each
-- `using/with check (workflow.is_superadmin())`). This migration does not
-- remove those — the superadmin bypass is a deliberate, separate testing
-- aid (Brief 040) — it EDITS each of the three to also admit the PIC,
-- mirroring migration 019's own established convention for every other
-- PIC-/team-keyed table it touched (OR the bypass into the existing
-- policy, not a second parallel policy) applied here in the other
-- direction: OR-ing the real PIC condition into an existing
-- superadmin-only policy. Quoted verbatim below, per this repo's own
-- "quote what a DROP removes" convention (migrations 008's
-- bump_last_meaningful_movement, 017's six qc_* policies).
--
--   -- contract_boq_lines_insert (migration 019, Brief 040 §4)
--   create policy contract_boq_lines_insert on workflow.contract_boq_lines
--     for insert with check (workflow.is_superadmin());
--
--   -- contract_boq_lines_update (migration 019, Brief 040 §4)
--   create policy contract_boq_lines_update on workflow.contract_boq_lines
--     for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
--
--   -- contract_boq_lines_delete (migration 019, Brief 040 §4)
--   create policy contract_boq_lines_delete on workflow.contract_boq_lines
--     for delete using (workflow.is_superadmin());
--
-- WRITE ACCESS SCOPE — PIC-only, decided by Seanghakk (Amendment A §1.2),
-- mirroring the existing requireProjectPic() gate update/floor-actions.ts
-- already uses for every other writable project-scoped table (migration
-- 009). Confirmed migration 009's write policies ARE expressed at the RLS
-- layer, not server-side-gating-with-permissive-RLS (read directly before
-- writing this) — copied that exact shape:
--   exists (select 1 from workflow.projects p
--           where p.id = <table>.project_id and p.pic_id = (select auth.uid()))
-- No manager bypass — matches every PIC-keyed table in this schema
-- (migrations 006/009/017 all deliberately omit one; a project with no PIC
-- stays un-writable by anyone until a PIC is assigned, the same
-- consequence those migrations already accepted).
--
-- LOCATION TABLE — contract_boq_line_locations, per Amendment A §2. Mirrors
-- workflow.tender_boq_line_locations exactly: composite PK (no surrogate
-- id), location_label free text (NOT a foreign key to workflow.
-- project_floors — reconciled later via a mapping table, matching Tender
-- BOQ's own reasoning in migration 018, not required to match a real floor
-- row at entry time). Deliberately NOT given Shop Drawing BOQ's nullable
-- floor_id column — Amendment A §2 asks to flag rather than silently add
-- one, and nothing about Contract BOQ's own use case argues for it, so it
-- was not added.
--
-- NOT DONE, OUT OF SCOPE PER AMENDMENT A §3: no location_map table for
-- Contract BOQ (unlike Tender/Shop Drawing BOQ) — Amendment A does not ask
-- for one, and this table's location_label reconciliation is not part of
-- this round's scope. No write policies added to any of the other five BOQ
-- tables (Tender or Shop Drawing tiers) — untouched, per Amendment A §3's
-- explicit instruction. Superadmin's own scope is NOT extended to
-- contract_boq_line_locations (the new table) — Amendment A does not ask
-- for this either; flagged as a real, if minor, consistency gap in this
-- round's Result doc rather than decided silently (superadmin can write
-- contract_boq_lines but not its own location child rows after this
-- migration).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.contract_boq_line_locations — new table, per §2.
-- -----------------------------------------------------------------------------

create table workflow.contract_boq_line_locations (
  contract_boq_line_id  uuid not null references workflow.contract_boq_lines (id) on delete restrict,
  location_label         text not null,
  quantity                numeric(14, 2) not null,
  primary key (contract_boq_line_id, location_label)
);

comment on table workflow.contract_boq_line_locations is
  'Migration 020 / Brief 046 Amendment A §2. Mirrors workflow.
   tender_boq_line_locations exactly — composite PK, free-text
   location_label, not a foreign key to workflow.project_floors. Closes
   the location-breakdown gap Result 046 flagged: contract_boq_lines
   (migration 018) was deliberately built with no location column at all;
   Seanghakk confirmed the floor-aware requirement stands and the gap is
   closed here with a new table, not by dropping the requirement.';

alter table workflow.contract_boq_line_locations enable row level security;

-- SELECT — not explicitly specified by Amendment A's own text, but
-- required for the list/breakdown view Brief 046 §2.4 asks for; a table
-- with RLS enabled and no SELECT policy is unreadable by anyone but the
-- owner. Mirrors tender_boq_line_locations_select exactly (migration 018)
-- — is_member() ALONGSIDE the exists-join, deliberately redundant, same
-- reasoning as that policy's own comment.
create policy contract_boq_line_locations_select on workflow.contract_boq_line_locations
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.contract_boq_lines c
      where c.id = contract_boq_line_locations.contract_boq_line_id
    )
  );

comment on policy contract_boq_line_locations_select on workflow.contract_boq_line_locations is
  'Same is_member() + exists-join shape as tender_boq_line_locations_select
   (migration 018) — see that policy''s own comment for the full
   reasoning.';

-- INSERT/UPDATE/DELETE — PIC-only, joined through contract_boq_lines to
-- projects.pic_id, same join shape as workflow.floor_sub_stages'
-- floor_id -> project_floors.project_id -> projects.pic_id pattern
-- (migration 009) applied one level down.
create policy contract_boq_line_locations_insert on workflow.contract_boq_line_locations
  for insert with check (
    exists (
      select 1 from workflow.contract_boq_lines c
      join workflow.projects p on p.id = c.project_id
      where c.id = contract_boq_line_locations.contract_boq_line_id
        and p.pic_id = (select auth.uid())
    )
  );

create policy contract_boq_line_locations_update on workflow.contract_boq_line_locations
  for update using (
    exists (
      select 1 from workflow.contract_boq_lines c
      join workflow.projects p on p.id = c.project_id
      where c.id = contract_boq_line_locations.contract_boq_line_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.contract_boq_lines c
      join workflow.projects p on p.id = c.project_id
      where c.id = contract_boq_line_locations.contract_boq_line_id
        and p.pic_id = (select auth.uid())
    )
  );

create policy contract_boq_line_locations_delete on workflow.contract_boq_line_locations
  for delete using (
    exists (
      select 1 from workflow.contract_boq_lines c
      join workflow.projects p on p.id = c.project_id
      where c.id = contract_boq_line_locations.contract_boq_line_id
        and p.pic_id = (select auth.uid())
    )
  );

-- DELETE grant — migration 002's default privileges cover SELECT/INSERT/
-- UPDATE automatically for a table created after it; DELETE has never been
-- auto-granted anywhere in this schema (migration 009's own header),
-- explicit grant required. Matches migrations 009/019's established
-- pattern.
grant delete on workflow.contract_boq_line_locations to authenticated;

-- -----------------------------------------------------------------------------
-- 2. workflow.contract_boq_lines — edit the three existing (migration 019,
--    superadmin-only) policies to also admit the project's PIC. See this
--    file's own header for the quoted pre-change text and reasoning.
-- -----------------------------------------------------------------------------

drop policy if exists contract_boq_lines_insert on workflow.contract_boq_lines;
create policy contract_boq_lines_insert on workflow.contract_boq_lines
  for insert with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = contract_boq_lines.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists contract_boq_lines_update on workflow.contract_boq_lines;
create policy contract_boq_lines_update on workflow.contract_boq_lines
  for update using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = contract_boq_lines.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = contract_boq_lines.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists contract_boq_lines_delete on workflow.contract_boq_lines;
create policy contract_boq_lines_delete on workflow.contract_boq_lines
  for delete using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = contract_boq_lines.project_id
        and p.pic_id = (select auth.uid())
    )
  );

comment on policy contract_boq_lines_insert on workflow.contract_boq_lines is
  'Migration 020 / Brief 046 Amendment A. Real write access, PIC-of-the-
   project only, ORed alongside migration 019''s existing TEMPORARY
   superadmin bypass (kept, not removed — Brief 040''s testing aid is a
   separate, still-live concern). No manager bypass, matching every other
   PIC-keyed table in this schema (migrations 006/009/017).';

commit;
