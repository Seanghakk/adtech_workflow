-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 020
-- Brief: ADTECH_WF_Brief_046_Amendment_A_Migration_And_Write_Policies §2/§3
--
-- REQUIRED before migration 020 is applied to prod, per this repo's own
-- standing process: run this against a non-production target that already
-- carries migrations 001-019 first (Seanghakk runs it — this session has
-- no psql/DATABASE_URL/SQL-editor access).
--
-- TWO PARTS, matching migration 020's own two parts:
--
--   1. DROP TABLE IF EXISTS workflow.contract_boq_line_locations — this
--      alone removes everything migration 020 added on that table (all
--      four policies, the DELETE grant, the table itself) in one guarded
--      statement, same reasoning migration 018's own rollback documents
--      (REVOKE has no IF EXISTS form and DROP POLICY's IF EXISTS guards
--      only the policy name, not the table — dropping the table sidesteps
--      both). No FK ordering concern: nothing else references this table.
--
--   2. Restore contract_boq_lines' three policies to migration 019's exact
--      superadmin-only text, quoted verbatim in migration 020's own header
--      — NOT dropped to nothing, since migration 019 added them first and
--      this rollback must not remove more than migration 020 itself added.
--      Idempotent per this repo's own established convention (migration
--      017's own Amendment A fix): each CREATE is preceded by its own DROP
--      POLICY IF EXISTS on the same name, so this succeeds whether
--      migration 020 was fully applied (the PIC-ORed version is present,
--      dropped and replaced), never applied (migration 019's own version
--      is already there under these names — dropped, then recreated
--      identically, a no-op), or partially applied.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop table if exists workflow.contract_boq_line_locations;

drop policy if exists contract_boq_lines_insert on workflow.contract_boq_lines;
create policy contract_boq_lines_insert on workflow.contract_boq_lines
  for insert with check (workflow.is_superadmin());

drop policy if exists contract_boq_lines_update on workflow.contract_boq_lines;
create policy contract_boq_lines_update on workflow.contract_boq_lines
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());

drop policy if exists contract_boq_lines_delete on workflow.contract_boq_lines;
create policy contract_boq_lines_delete on workflow.contract_boq_lines
  for delete using (workflow.is_superadmin());

commit;
