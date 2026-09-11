-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 004
-- Brief: ADTECH_WF_Fable_Brief_001_Data_Model_And_Theme_6 §4.5
--
-- Reverses 004_so_registers.sql: drops the pair-unique index and the two
-- new CHECK constraints, restores migration 001's original org+so_number
-- unique index, drops the so_register_id column (and with it, every value
-- the backfill step wrote — this is the one non-recoverable part; re-
-- running the migration recomputes the same values from so_number, so
-- nothing is actually lost), and drops workflow.so_registers itself.
--
-- Does not touch `public`, does not touch any other table. RLS policy
-- so_registers_select is dropped implicitly when its table is dropped —
-- no separate DROP POLICY needed.
--
-- CAVEAT CARRIED FORWARD FROM MIGRATION 002'S ROLLBACK, NOT REPEATED HERE
-- IN FULL: this file does not touch pgrst.db_schemas or any role-level
-- setting, so the usual "only run when nobody is using the CMMS" caution
-- does not apply to this particular rollback — it is scoped entirely to
-- objects this migration itself created.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop index if exists workflow.projects_org_so_number_register_key;

create unique index projects_org_so_number_key
  on workflow.projects (org_id, so_number)
  where so_number is not null;

alter table workflow.projects
  drop constraint if exists projects_so_number_format_check;

alter table workflow.projects
  drop constraint if exists projects_so_register_pairing_check;

alter table workflow.projects
  drop column if exists so_register_id;

drop table if exists workflow.so_registers;

commit;
