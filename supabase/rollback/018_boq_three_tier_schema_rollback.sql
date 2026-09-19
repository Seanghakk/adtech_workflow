-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 018
-- Brief: ADTECH_WF_Brief_027_BOQ_Schema_Three_Tier §6
--
-- REQUIRED before migration 018 is applied to prod, per this repo's own
-- process: run this against the throwaway Supabase project first (Seanghakk
-- runs it — this session has no psql/DATABASE_URL/SQL-editor access).
--
-- DROP TABLE IF EXISTS ONLY, no separate REVOKE/DROP POLICY statements —
-- migration 015's own rollback (Amendment C, read directly before writing
-- this) documents exactly why: REVOKE has no IF EXISTS form, and DROP
-- POLICY's IF EXISTS guards only the policy name, not the table it names —
-- both still fail with "relation does not exist" if run against a
-- database where migration 018 was never applied. Dropping a table drops
-- everything defined on it (policies, comments) in one guarded statement,
-- so nothing else is needed here.
--
-- ORDER MATTERS: child tables before their parents, so a not-yet-dropped
-- FK never blocks a DROP TABLE. tender_boq_line_locations references
-- tender_boq_lines; shop_drawing_boq_line_locations references
-- shop_drawing_boq_lines; tender_boq_location_map references
-- workflow.projects and workflow.project_floors only (both pre-existing,
-- untouched by this migration), so its own position relative to the other
-- five is not load-bearing, but it is still listed with the children for
-- readability.
--
-- Handles all three states migration 018 could be found in: not applied
-- at all (every DROP TABLE IF EXISTS is a no-op), fully applied (removes
-- all six tables), and partially applied (each DROP TABLE IF EXISTS only
-- depends on that one table's own existence, independent of the others).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop table if exists workflow.tender_boq_line_locations;
drop table if exists workflow.shop_drawing_boq_line_locations;
drop table if exists workflow.tender_boq_location_map;

drop table if exists workflow.tender_boq_lines;
drop table if exists workflow.contract_boq_lines;
drop table if exists workflow.shop_drawing_boq_lines;

commit;
