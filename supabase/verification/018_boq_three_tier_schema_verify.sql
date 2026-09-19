-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 018
-- Brief: ADTECH_WF_Brief_027_BOQ_Schema_Three_Tier §5
-- Revised per ADTECH_WF_Brief_035_BOQ_Schema_Revisions — updated for the
-- new workflow.shop_drawing_boq_location_map table, the now-nullable
-- shop_drawing_boq_line_locations.floor_id, and numeric(14,2) quantity
-- columns throughout (was integer). Every "six tables"/"six rows" count
-- below is now seven.
--
-- Run against a throwaway Supabase project carrying migrations 001-017
-- FIRST (rollback-test-first, this repo's own standing process), then
-- reapply and run again against the real target. Run the rest AFTER
-- applying.
--
-- STANDING TRAP (carried forward from every prior round's own verify
-- file): these queries go through pg_policies (the view), never the raw
-- pg_policy catalog — a block run in the SQL editor executes as table
-- owner and bypasses RLS entirely, so nothing here can PROVE a policy
-- blocks or admits anyone. §5's own "real test" needs a real signed-in
-- account through the app, not the SQL editor.
-- =============================================================================

-- 0. PRE-FLIGHT — confirms the premise every SELECT policy in this
--    migration depends on: that projects_select and can_view_project()
--    are exactly what migration 004 says they are, not superseded by a
--    later migration since. Expect can_view_project to exist as a
--    function taking (uuid, boolean).
select proname, pronargs
from pg_proc
where proname = 'can_view_project' and pronamespace = 'workflow'::regnamespace;


-- 1. All seven tables exist with the right column shapes.
-- Expect exactly the columns listed per table, matching the migration's
-- own DDL — spot-check nullability on the columns that matter most:
-- tender_boq_location_map.floor_id AND shop_drawing_boq_location_map.floor_id
-- AND shop_drawing_boq_line_locations.floor_id all nullable (TRUE) — the
-- last one CHANGED from NOT NULL per Brief 035 §1, confirm it actually
-- took. Every quantity column (total_quantity, requested_quantity, both
-- per-location quantity columns, contract_boq_lines.quantity) should show
-- data_type = 'numeric', not 'integer' — confirm Brief 035 §3 actually
-- took too. Every other FK/quantity column stays NOT nullable (FALSE)
-- except the freeform Contract BOQ fields (section_label, brand) and the
-- optional brand/model/part_number/remarks columns on Tender/Shop Drawing
-- BOQ lines.
select table_name, column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'workflow'
  and table_name in (
    'tender_boq_lines', 'tender_boq_line_locations', 'tender_boq_location_map',
    'contract_boq_lines',
    'shop_drawing_boq_lines', 'shop_drawing_boq_line_locations', 'shop_drawing_boq_location_map'
  )
order by table_name, ordinal_position;


-- 2. Every FK, its target, and its delete rule. Expect ON DELETE
--    RESTRICT for all of them, no exceptions — matching this schema's
--    established convention for parent-row FKs.
select
  tc.table_name,
  kcu.column_name,
  ccu.table_schema as ref_schema,
  ccu.table_name as ref_table,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
where tc.table_schema = 'workflow'
  and tc.table_name in (
    'tender_boq_lines', 'tender_boq_line_locations', 'tender_boq_location_map',
    'contract_boq_lines',
    'shop_drawing_boq_lines', 'shop_drawing_boq_line_locations', 'shop_drawing_boq_location_map'
  )
  and tc.constraint_type = 'FOREIGN KEY'
order by tc.table_name, kcu.column_name;


-- 3. Primary keys — expect a single-column uuid PK on tender_boq_lines,
--    contract_boq_lines, and shop_drawing_boq_lines; a two-column
--    composite PK on tender_boq_line_locations, tender_boq_location_map,
--    shop_drawing_boq_location_map, and (CHANGED per Brief 035 §1)
--    shop_drawing_boq_line_locations — its PK columns are now
--    (shop_drawing_boq_line_id, location_label), not
--    (shop_drawing_boq_line_id, floor_id) as originally built; confirm
--    location_label shows up here, not floor_id.
select tc.table_name, kcu.column_name, kcu.ordinal_position
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
where tc.table_schema = 'workflow'
  and tc.table_name in (
    'tender_boq_lines', 'tender_boq_line_locations', 'tender_boq_location_map',
    'contract_boq_lines',
    'shop_drawing_boq_lines', 'shop_drawing_boq_line_locations', 'shop_drawing_boq_location_map'
  )
  and tc.constraint_type = 'PRIMARY KEY'
order by tc.table_name, kcu.ordinal_position;


-- 4. RLS is actually ENABLED on all seven tables, not just carrying
--    policies that read correctly — Brief 022 Amendment B's own standing
--    lesson (the sibling ADTECH CMMS had RLS toggled off in production
--    once while every policy still read as correct). Expect
--    relrowsecurity = true on all seven rows.
select relname, relrowsecurity
from pg_class
where relnamespace = 'workflow'::regnamespace
  and relname in (
    'tender_boq_lines', 'tender_boq_line_locations', 'tender_boq_location_map',
    'contract_boq_lines',
    'shop_drawing_boq_lines', 'shop_drawing_boq_line_locations', 'shop_drawing_boq_location_map'
  )
order by relname;


-- 5. Exactly one SELECT policy per table, no INSERT/UPDATE/DELETE policy
--    anywhere yet. Expect 7 rows total, all cmd = 'r' (select).
-- The five project-scoped policies (tender_boq_lines_select,
-- contract_boq_lines_select, shop_drawing_boq_lines_select,
-- tender_boq_location_map_select, shop_drawing_boq_location_map_select)
-- should each mention BOTH is_member() and can_view_project in their qual
-- text. The two child-table policies (tender_boq_line_locations_select,
-- shop_drawing_boq_line_locations_select) should each mention is_member()
-- AND an exists-join through their own parent table's name — if either
-- mentions only one of the two, the Brief 022 Amendment A/B pattern this
-- migration copied was not applied correctly.
select schemaname, tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'workflow'
  and tablename in (
    'tender_boq_lines', 'tender_boq_line_locations', 'tender_boq_location_map',
    'contract_boq_lines',
    'shop_drawing_boq_lines', 'shop_drawing_boq_line_locations', 'shop_drawing_boq_location_map'
  )
order by tablename, cmd;


-- 6. §5's own "confirm total-quantity variance is queryable directly" —
--    a real query, not a claim. Run once real Tender BOQ and Shop
--    Drawing BOQ rows exist for the same project; on a freshly migrated
--    database with zero rows this returns nothing, which is the expected
--    empty state, not a failure. Matches items by (project_id,
--    system_type, part_number) — CONFIRMED per Brief 035 §2 as the
--    intentional matching key, not a placeholder awaiting a real shared
--    item code (the migration's own §1 comment explains why no such code
--    was added). Reliable only when both tiers' data entry actually
--    populated the same part_number for the same physical item — that
--    remains a data-entry discipline question, not a schema gap.
select
  t.project_id,
  t.system_type,
  t.part_number,
  sum(t.total_quantity) as tender_total,
  (
    select sum(s.total_quantity)
    from workflow.shop_drawing_boq_lines s
    where s.project_id = t.project_id
      and s.system_type = t.system_type
      and s.part_number = t.part_number
  ) as shop_drawing_total
from workflow.tender_boq_lines t
where t.part_number is not null
group by t.project_id, t.system_type, t.part_number;


-- 7. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as real signed-in accounts:
--   a. As an active member who can view a project (per can_view_project),
--      confirm all seven tables SELECT normally for that project's rows.
--   b. As a sales-restricted member who canNOT view a given project,
--      confirm all seven tables return zero rows for it, same as
--      procurement_lines/dependency_links already behave for that
--      project.
--   c. Confirm no insert/update/delete is possible against any of the
--      seven tables through the app's own anon/authenticated credentials —
--      RLS should refuse all of them, since no write policy exists yet.
-- These verdicts belong to Seanghakk — see the Result doc's own numbered
-- hand-verification script.
