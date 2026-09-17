-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 015
-- Brief: ADTECH_WF_Brief_022_Procurement_Line_Identity_Owner_And_Floors §6
-- Amended: ADTECH_WF_Brief_022_Amendment_C_Rollback_File_Fails_On_Unapplied_State
--
-- REQUIRED before migration 015 is applied to prod, per this repo's own
-- process: run this against the throwaway Supabase project that already
-- carries migrations 001-013 (Seanghakk runs it — this session has no
-- psql/DATABASE_URL/SQL-editor access). Migration 014 (PR #14) may or may
-- not be applied there — this rollback does not touch anything migration
-- 014 added (procurement_lines_insert/update), only what migration 015
-- itself adds, so it is safe either way.
--
-- AMENDMENT C: the prior version of this file opened with
--   revoke delete on workflow.procurement_line_floors from authenticated;
-- followed by two individual `drop policy if exists ... on
-- workflow.procurement_line_floors` statements, all three run BEFORE the
-- `drop table if exists` below. REVOKE has no IF EXISTS form and DROP
-- POLICY's IF EXISTS guards only the policy name, not the table it names —
-- both still have to resolve workflow.procurement_line_floors first. Run
-- against a throwaway project carrying migrations 001-013 with migration
-- 015 never applied (procurement_line_floors not created), the REVOKE
-- statement — the first of the three, and the only one of the three with
-- no guard at all — failed with:
--   ERROR: 42P01: relation "workflow.procurement_line_floors" does not exist
-- confirmed 17 Sep 2026 on `adtech-workflow-rollback-test`.
--
-- FIX: `drop table if exists workflow.procurement_line_floors` removes the
-- table, both its policies, and its DELETE grant in one guarded statement —
-- dropping a table drops everything defined on it, so the separate REVOKE
-- and DROP POLICY statements were both redundant (when the table exists)
-- and unsafe (when it doesn't). This is the same shape migration 005's
-- rollback already uses for workflow.so_registers (whose SELECT policy is
-- dropped implicitly with the table, no separate DROP POLICY there either)
-- — the original version of this file cited that precedent but didn't
-- fully follow it for the DELETE grant and the insert/delete policies.
--
-- Handles all three states migration 015 could be found in: not applied at
-- all (drop table if exists / drop column if exists are no-ops — verified
-- 17 Sep 2026), fully applied (removes everything below), and partially
-- applied — e.g. the table created but a policy or the grant not yet, or
-- the columns added but the table not created — since `drop table if
-- exists` only depends on the table's own existence, not the state of
-- anything defined on it, and the two column drops are independently
-- guarded and target workflow.procurement_lines, which always exists.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop table if exists workflow.procurement_line_floors;

alter table workflow.procurement_lines drop column if exists assigned_to;
alter table workflow.procurement_lines drop column if exists description;

commit;
