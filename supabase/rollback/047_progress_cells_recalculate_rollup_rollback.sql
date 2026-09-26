-- =============================================================================
-- ROLLBACK for migration 047 — the progress_cells rollup trigger
-- =============================================================================
--
-- Removes the trigger and function 047 added. After this, recording progress
-- against a cell no longer moves projects.percent_calculated — which is
-- precisely the regression 047 existed to fix, so this rollback deliberately
-- restores a broken state. It is here because a rollback's job is to undo its
-- migration, not to be a good idea.
--
-- WHAT IT CANNOT UNDO: 047 ends with an UPDATE that recomputed
-- percent_calculated for every project. Those values are derived, not
-- entered, so there is nothing to "restore" them to — the pre-047 numbers
-- were simply stale copies of an older computation. This file does not try to
-- re-stale them; it leaves the figures as they are and stops them updating.
-- The rollback check asserts that the trigger is gone, not that any number
-- moved back.
--
-- One transaction, committed once, at the end.
-- =============================================================================

begin;

drop trigger if exists progress_cells_recalculate_rollup on workflow.progress_cells;
drop function if exists workflow.recalculate_rollup_from_progress_cell();

commit;
