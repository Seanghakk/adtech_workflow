-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 001
-- Brief: ADTECH_WF_Brief_001_Project_Scaffold_And_Schema
-- Addendum folded in: ADTECH_WF_Brief_001A_Stages_And_Approval_Steps_Lookup_Tables
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 001_init_workflow_schema.sql. Every query inspects live catalog state
-- (pg_class / pg_policies / information_schema), never the migration
-- text — a false claim that RLS was "on" shipped once on the CMMS this
-- way and is exactly what this file exists to rule out.
-- =============================================================================

-- 1. All 18 tables exist in schema `workflow`.
-- Expect exactly this list, 18 rows:
--   approval_steps, catalogue_events, catalogue_items, clients,
--   dependency_links, members, orgs, procurement_lines, progress_updates,
--   project_items, projects, reason_codes, reporting_periods,
--   request_handoffs, requests, sites, stages, variations
select table_name
from information_schema.tables
where table_schema = 'workflow'
order by table_name;


-- 2. RLS is ENABLED on every one of those 18 tables.
-- Expect rls_enabled = true on all 18 rows, none missing.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'workflow' and c.relkind = 'r'
order by c.relname;


-- 3. Expected policies exist BY NAME (26 total).
-- Expect the exact set below, one row each:
--   orgs_select
--   members_select, members_insert, members_update
--   stages_select
--   approval_steps_select
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
    'catalogue_events', 'procurement_lines', 'dependency_links',
    'stages', 'approval_steps'
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


-- =============================================================================
-- Brief 001A additions (stages / approval_steps, folded into 001 — Case A)
-- =============================================================================

-- 10. stages and approval_steps contain ZERO rows — seeded empty on purpose.
-- Expect both counts = 0.
select
  (select count(*) from workflow.stages) as stages_row_count,
  (select count(*) from workflow.approval_steps) as approval_steps_row_count;


-- 11. requests.current_stage_id and projects.current_stage_id exist, are
--     nullable, and their FK is RESTRICT — read from the catalog
--     (confdeltype), not the migration text. confdeltype 'r' = RESTRICT.
-- Expect 2 rows (requests, projects), both is_nullable = true and
-- confdeltype = 'r'.
select
  con.conrelid::regclass as table_name,
  a.attname as column_name,
  not a.attnotnull as is_nullable,
  con.confdeltype
from pg_constraint con
join pg_attribute a
  on a.attrelid = con.conrelid
 and a.attnum = con.conkey[1]
where con.contype = 'f'
  and con.confrelid = 'workflow.stages'::regclass
order by table_name;


-- 12. Every FK from workflow.* to public.user_profiles is ON DELETE
--     RESTRICT (per this round's decision — no silent orphaning of who
--     did what if an identity row is ever removed).
-- Expect 10 rows, confdeltype = 'r' on every one: workflow.members,
-- projects, project_items, requests (x2: requester_id, current_owner_id),
-- request_handoffs (x2: from_owner_id, to_owner_id), progress_updates,
-- catalogue_items, catalogue_events.
select
  cl.relname as table_name,
  con.conname,
  con.confdeltype
from pg_constraint con
join pg_class cl on cl.oid = con.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where n.nspname = 'workflow'
  and con.contype = 'f'
  and con.confrelid = 'public.user_profiles'::regclass
order by cl.relname;


-- 13. No CHECK constraint enumerates scope_type, a stage code, or an
--     approval code anywhere (Brief 001A §7). This is a full listing to
--     eyeball rather than a yes/no — automatically proving an absence of
--     meaning isn't possible from the catalog alone. The only expected
--     "enumeration-shaped" CHECKs in this list are ones this migration's
--     own comments already call out as intentional and NOT stakeholder-
--     owned lists: members_team_check, members_role_check,
--     requests_destination_team_check (workflow's own team vocabulary,
--     unrelated to scope_type/stage/approval codes), projects_stream_check
--     (also team/product vocabulary, not a discovered list),
--     progress_updates_subject_type_check, reason_codes_stream_check,
--     reporting_periods_stream_check, and approval_steps_applies_to_check
--     (a fixed set of record kinds this app defines, not a discovered
--     list — see the comment on workflow.approval_steps). None of these
--     should mention a stage code, an approval_steps.code value, or
--     enumerate scope_type's actual values (elv/bms/fas/other appearing
--     only in the *_stream checks is expected and is a separate, already-
--     settled decision from Brief 001 §4.3, not a stage/approval list).
select
  cl.relname as table_name,
  con.conname,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class cl on cl.oid = con.conrelid
join pg_namespace n on n.oid = cl.relnamespace
where n.nspname = 'workflow'
  and con.contype = 'c'
order by cl.relname, con.conname;
