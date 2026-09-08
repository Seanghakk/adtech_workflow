-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 001
-- Brief: ADTECH_WF_Brief_001_Project_Scaffold_And_Schema
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 001_init_workflow_schema.sql. Every query inspects live catalog state
-- (pg_class / pg_policies / information_schema), never the migration
-- text — a false claim that RLS was "on" shipped once on the CMMS this
-- way and is exactly what this file exists to rule out.
-- =============================================================================

-- 1. All 16 tables exist in schema `workflow`.
-- Expect exactly this list, 16 rows:
--   catalogue_events, catalogue_items, clients, dependency_links,
--   members, orgs, procurement_lines, progress_updates, project_items,
--   projects, reason_codes, reporting_periods, request_handoffs,
--   requests, sites, variations
select table_name
from information_schema.tables
where table_schema = 'workflow'
order by table_name;


-- 2. RLS is ENABLED on every one of those 16 tables.
-- Expect rls_enabled = true on all 16 rows, none missing.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'workflow' and c.relkind = 'r'
order by c.relname;


-- 3. Expected policies exist BY NAME (24 total).
-- Expect the exact set below, one row each:
--   orgs_select
--   members_select, members_insert, members_update
--   clients_select
--   sites_select
--   projects_select
--   variations_select
--   project_items_select
--   requests_select
--   request_handoffs_select, request_handoffs_insert
--   reason_codes_select, reason_codes_insert, reason_codes_update
--   reporting_periods_select, reporting_periods_insert, reporting_periods_update
--   progress_updates_select, progress_updates_insert
--   catalogue_items_select
--   catalogue_events_select
--   procurement_lines_select
--   dependency_links_select
select tablename, policyname, cmd
from pg_policies
where schemaname = 'workflow'
order by tablename, policyname;


-- 4. progress_updates and request_handoffs have NO update/delete policy
--    for any client role — append-only is enforced by absence, not by a
--    denying policy.
-- Expect ZERO rows.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'workflow'
  and tablename in ('progress_updates', 'request_handoffs')
  and cmd in ('UPDATE', 'DELETE');


-- 5. Seeded reason_codes rows are present (8 rows, all provisional).
-- Expect: awaiting_client, awaiting_material, awaiting_approval,
--         technical_clarification, manpower, site_access, rework,
--         no_blocker_on_track — in that sort_order, all is_active = true.
select code, label_en, sort_order, is_active, stream
from workflow.reason_codes
order by sort_order;


-- 6. Reporting periods were seeded (global, stream IS NULL).
-- Expect roughly 26 weekly rows spanning 6 Jul 2026 – 3 Jan 2027.
select count(*) as global_periods_seeded,
       min(starts_on) as earliest_starts_on,
       max(ends_on) as latest_ends_on
from workflow.reporting_periods
where stream is null;


-- 7. No object this migration creates exists in `public` (name-collision
--    sanity check — the authoritative check is that the migration file
--    itself contains zero DDL against `public`, which is a text read,
--    not a query).
-- Expect ZERO rows.
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'orgs', 'members', 'clients', 'sites', 'projects', 'variations',
    'project_items', 'requests', 'request_handoffs', 'reason_codes',
    'reporting_periods', 'progress_updates', 'catalogue_items',
    'catalogue_events', 'procurement_lines', 'dependency_links'
  );


-- 8. Helper functions and the movement-bump trigger function live in
--    `workflow`, not `public`.
-- Expect 4 rows, all with nspname = 'workflow'.
select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('is_member', 'is_manager', 'current_team', 'bump_last_meaningful_movement')
order by 1, 2;


-- 9. The single seeded org exists with the fixed id every other table's
--    org_id column defaults to.
-- Expect 1 row: 00000000-0000-0000-0000-000000000001 | ADTECH
select id, name from workflow.orgs;
