-- =============================================================================
-- ADTECH Workflow Tracker — Migration 031: CAD system code lookup
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §3 item 3
--
-- CHECKED THE LIVE SCHEMA FIRST: no table anywhere carries this list.
-- workflow.teams is shaped similarly (code/label_en/label_km/sort_order/
-- is_active) but is a DIFFERENT concept — organisational teams
-- (project_management, shop_drawing, tnc, qc, sales, a_and_a...), not
-- CAD systems (FIRE, SUPP, FINT...) — reusing it would conflate two
-- unrelated vocabularies. workflow.tender_boq_lines/shop_drawing_boq_
-- lines/shop_drawing_items already carry a free-text `system_type`-
-- shaped concept in places (tender_boq_lines.system_type, shop_drawing_
-- boq_lines.system_type), but as plain ungoverned text, not FKs to any
-- lookup — exactly the "hardcoded enum" shape v7.1's own standing rule 1
-- forbids for a new list like this one.
--
-- SCOPE, DELIBERATELY NARROW: this migration creates and seeds the
-- lookup table only. It does NOT touch tender_boq_lines.system_type or
-- shop_drawing_boq_lines.system_type, and does NOT add a new system-code
-- column to shop_drawing_items (which has no system concept at all
-- today). The Concept Note Rev 3 (§6.1 item 3) itself names tying those
-- free-text columns to this list as a real action, not carried out here
-- — checked live on production first: both tables have ZERO rows today
-- (confirmed by direct count, not assumed), so there is no real data to
-- validate a mapping against, and inventing one on zero rows would be
-- exactly the kind of silent guess Brief 096 §5 forbids. Reported as a
-- stopped-on item, for a later brief once real BOQ data exists to check
-- a mapping against. See this brief's own Result doc §9.
--
-- SHAPE: same as workflow.scope_types (migration 012) — code as primary
-- key (stable, short, uppercase, never renamed), label_en/label_km,
-- sort_order, is_active, no org_id (a fixed, org-wide vocabulary, not a
-- per-tenant one — matching scope_types' own reasoning exactly). RLS:
-- SELECT for any active member, INSERT/UPDATE for a manager or admin
-- only — copied verbatim from scope_types' own policies. No DELETE
-- policy; retire a row via is_active, same convention.
--
-- MAINTAINED IN THE APP at /lookups (src/app/(app)/lookups) — the
-- existing lookup admin screen already reads/writes reason_codes,
-- scope_types, and stages the same way; wiring this new table into that
-- screen's UI is application work for a later brief (this migration adds
-- no screen, per Brief 096 §5's own "no UI work" instruction), but no
-- new admin surface is needed — the existing one already knows this
-- shape.
-- =============================================================================

begin;

create table if not exists workflow.cad_systems (
  code        text primary key,
  label_en    text not null,
  label_km    text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table workflow.cad_systems is
  'The CAD system-code vocabulary (Concept Note Rev 3 Part 1) — 23 fixed
   codes used in drawing numbers and the AutoCAD export, seeded below.
   Same shape as workflow.scope_types (migration 012) on purpose: a
   lookup table, not a hardcoded enum, per v7.1''s own standing rule 1.
   RLS: SELECT for any active member, INSERT/UPDATE for a manager or
   admin only. No DELETE policy; retire a row via is_active.';

comment on column workflow.cad_systems.code is
  'Stable, uppercase, never renamed after creation — same convention as
   workflow.scope_types.code. Not yet referenced by any other table (see
   this migration''s own header on why linking existing system_type
   columns is deliberately out of scope here).';

-- Full names taken verbatim from "ADTECH Shop Drawing CAD Standard, Part
-- 1: Foundation" (Rev 2, 22 Sep 2026) §3 SYSTEM CODES — the actual
-- source document, read directly rather than guessed. Grouped there by
-- discipline (A Security/T, B Life Safety/F, C Automation/E, D ICT/T);
-- sort_order here preserves that same grouping and order.
insert into workflow.cad_systems (code, label_en, label_km, sort_order, is_active) values
  -- B. Life Safety (discipline F)
  ('FIRE', 'Fire Alarm',                  '[provisional — km TBD: FIRE]', 10,  true),
  ('SUPP', 'Fire Suppression',            '[provisional — km TBD: SUPP]', 20,  true),
  ('FINT', 'Fire Intercom / EVC',         '[provisional — km TBD: FINT]', 30,  true),
  ('PAVA', 'Public Address / Voice Alarm','[provisional — km TBD: PAVA]', 40,  true),
  -- A. Security (discipline T)
  ('ACCS', 'Access Control',              '[provisional — km TBD: ACCS]', 50,  true),
  ('INTR', 'Intrusion',                   '[provisional — km TBD: INTR]', 60,  true),
  ('CCTV', 'CCTV',                        '[provisional — km TBD: CCTV]', 70,  true),
  ('CARP', 'Carparking',                  '[provisional — km TBD: CARP]', 80,  true),
  ('PGSS', 'Parking Guidance',            '[provisional — km TBD: PGSS]', 90,  true),
  ('VMSS', 'Visitor Management',          '[provisional — km TBD: VMSS]', 100, true),
  ('NURS', 'Nurse Call',                  '[provisional — km TBD: NURS]', 110, true),
  ('DTAS', 'Disabled Toilet Alarm',       '[provisional — km TBD: DTAS]', 120, true),
  -- C. Automation (discipline E)
  ('BMSS', 'Building Management System',  '[provisional — km TBD: BMSS]', 130, true),
  ('LCTL', 'Lighting Control',            '[provisional — km TBD: LCTL]', 140, true),
  ('SMHM', 'Smart Home / KNX',            '[provisional — km TBD: SMHM]', 150, true),
  ('ENMS', 'Energy Management / Metering','[provisional — km TBD: ENMS]', 160, true),
  -- D. ICT (discipline T)
  ('STRC', 'Structured Cabling',          '[provisional — km TBD: STRC]', 170, true),
  ('DNET', 'Data Network',                '[provisional — km TBD: DNET]', 180, true),
  ('WIFI', 'WiFi',                        '[provisional — km TBD: WIFI]', 190, true),
  ('IPTL', 'IP Telephone',                '[provisional — km TBD: IPTL]', 200, true),
  ('CATV', 'CATV / IPTV',                 '[provisional — km TBD: CATV]', 210, true),
  ('UPSS', 'UPS and Ancillary',           '[provisional — km TBD: UPSS]', 220, true),
  ('AVCF', 'AV and Conference',           '[provisional — km TBD: AVCF]', 230, true)
on conflict (code) do nothing;

alter table workflow.cad_systems enable row level security;

drop policy if exists cad_systems_select on workflow.cad_systems;
create policy cad_systems_select on workflow.cad_systems
  for select using (workflow.is_member());

drop policy if exists cad_systems_insert on workflow.cad_systems;
create policy cad_systems_insert on workflow.cad_systems
  for insert with check (workflow.is_manager());

drop policy if exists cad_systems_update on workflow.cad_systems;
create policy cad_systems_update on workflow.cad_systems
  for update using (workflow.is_manager()) with check (workflow.is_manager());

commit;
