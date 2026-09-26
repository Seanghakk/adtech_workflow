-- =============================================================================
-- 048 — Two rules migration 045 lost, found by auditing the dropped table
-- =============================================================================
--
-- Migration 045 dropped workflow.floor_sub_stages with CASCADE. 047 already
-- restored the rollup trigger that went with it — found by accident, during
-- the end-to-end pass. This migration is the result of doing the audit
-- properly instead: enumerating every trigger, policy, constraint, function
-- and foreign key that hung off that table on PRODUCTION (which still holds
-- the pre-045 state) and checking each one is either recreated or
-- deliberately gone.
--
-- Two were neither.
--
-- -----------------------------------------------------------------------------
-- LOSS 1 — the stage/sub-stage shape check
-- -----------------------------------------------------------------------------
-- floor_sub_stages_shape_check enforced that the pair is real:
--   installation → first_fix | second_fix | third_fix
--   tnc          → pre_commissioning | commissioning
-- 045 carried over the stage check and the status check but not this one, so
-- a cell could be written with stage 'installation' and sub_stage
-- 'commissioning', or any string at all. Nothing in the app does that today;
-- the constraint exists so nothing ever can.
--
-- -----------------------------------------------------------------------------
-- LOSS 2 — the write policy, which I made BROADER
-- -----------------------------------------------------------------------------
-- Brief 106 §2: "RLS on everything new, matching the permissions the design
-- states. Never broader." I did not meet that. The old policy was STAGE-KEYED
-- and had no bypasses at all:
--
--   (stage = 'installation' AND current_team() = 'project_management')
--   OR (stage = 'tnc'        AND current_team() = 'tnc')
--
-- 045's progress_cells_write reads:
--
--   is_superadmin()
--   OR current_team() = any(array['project_management','tnc'])
--   OR the project's PIC
--
-- which widens it three ways at once: project management could write TNC
-- cells and vice versa, superadmin gained a bypass it never had here, and so
-- did the PIC. D096 changed the SHAPE of a cell, not who may write one, so
-- this restores the original rule exactly.
--
-- The stage keying is the substantive part: commissioning is not the
-- installation team's to record, and a floor now carries several systems'
-- cells, so a wrong-team write is harder to spot than it was.
-- =============================================================================

begin;

-- ---- Loss 1 -----------------------------------------------------------------

alter table workflow.progress_cells
  add constraint progress_cells_shape_check
  check (
    (stage = 'installation' and sub_stage in ('first_fix', 'second_fix', 'third_fix'))
    or (stage = 'tnc' and sub_stage in ('pre_commissioning', 'commissioning'))
  );

comment on constraint progress_cells_shape_check on workflow.progress_cells is
  'Migration 048. Restores floor_sub_stages_shape_check, which migration 045
   dropped with its table and did not carry over. The five sub-stages are how
   installation works, not configuration — see Brief 106b on why they stayed a
   (stage, sub_stage) pair rather than becoming a lookup.';

-- ---- Loss 2 -----------------------------------------------------------------

drop policy if exists progress_cells_write on workflow.progress_cells;

-- Deliberately NOT "for all": the old table had separate INSERT and UPDATE
-- policies and no DELETE policy at all, so deleting a cell directly was
-- refused. Cells are removed by removing coverage (045's cascade), which is
-- PIC-gated on project_system_floors. Recreating a blanket FOR ALL would
-- quietly grant a delete nobody had.
create policy progress_cells_insert on workflow.progress_cells
  for insert with check (
    (stage = 'installation' and workflow.current_team() = 'project_management')
    or (stage = 'tnc' and workflow.current_team() = 'tnc')
  );

create policy progress_cells_update on workflow.progress_cells
  for update using (
    (stage = 'installation' and workflow.current_team() = 'project_management')
    or (stage = 'tnc' and workflow.current_team() = 'tnc')
  ) with check (
    (stage = 'installation' and workflow.current_team() = 'project_management')
    or (stage = 'tnc' and workflow.current_team() = 'tnc')
  );

comment on table workflow.progress_cells is
  'Migration 043/045/048. One system, one floor, one sub-stage — the unit of
   recorded progress after D096. Its write policies are migration 045-era
   floor_sub_stages'' own, restored verbatim by 048: stage-keyed, with no
   superadmin and no PIC bypass, because D096 changed what a cell IS and not
   who may write one.';

commit;
