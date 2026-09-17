-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 015
-- Brief: ADTECH_WF_Brief_022_Procurement_Line_Identity_Owner_And_Floors §6
--
-- REQUIRED before migration 015 is applied to prod, per this repo's own
-- process: run this against the throwaway Supabase project that already
-- carries migrations 001-013 (Seanghakk runs it — this session has no
-- psql/DATABASE_URL/SQL-editor access). Migration 014 (PR #14) may or may
-- not be applied there — this rollback does not touch anything migration
-- 014 added (procurement_lines_insert/update), only what migration 015
-- itself adds, so it is safe either way.
--
-- Reverses, in dependency order: the DELETE grant and both policies on
-- workflow.procurement_line_floors, the table itself (dropping it also
-- drops its own select policy — no separate DROP POLICY needed for that
-- one, matching migration 005's rollback for workflow.so_registers), then
-- procurement_lines.assigned_to and procurement_lines.description
-- (dropping a column drops its own comment along with it).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

revoke delete on workflow.procurement_line_floors from authenticated;

drop policy if exists procurement_line_floors_delete on workflow.procurement_line_floors;
drop policy if exists procurement_line_floors_insert on workflow.procurement_line_floors;

drop table if exists workflow.procurement_line_floors;

alter table workflow.procurement_lines drop column if exists assigned_to;
alter table workflow.procurement_lines drop column if exists description;

commit;
