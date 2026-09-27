-- =============================================================================
-- ROLLBACK for migration 050
-- =============================================================================
--
-- READ THIS BEFORE RUNNING IT. Reverting 050 puts back the state in which
-- SAVING COVERAGE IS IMPOSSIBLE FOR EVERY USER. seed_progress_cells returns
-- to SECURITY INVOKER, so it inserts 'tnc' cells as the caller, and 048's
-- stage-keyed policy refuses them for anyone whose team is not tnc — and
-- refuses the 'installation' cells for anyone whose team is. The trigger
-- throws and the coverage insert rolls back, silently, exactly as it did on
-- production on 27 Sep 2026.
--
-- It also removes the guard that stops a system being deleted out from under
-- recorded work and imported BOQ lines.
--
-- A rollback's job is to undo its migration, not to be a good idea. This one
-- is a bad idea; it is here because the repo's convention is that every
-- migration has one that has actually been run.
--
-- One transaction, committed once, at the end.
-- =============================================================================

begin;

-- ---- the delete guard goes --------------------------------------------------

drop trigger if exists project_systems_refuse_delete_with_work on workflow.project_systems;
drop function if exists workflow.project_systems_refuse_delete_with_work();

-- ---- definer rights go back off, as migration 045 had them ------------------
-- ALTER rather than CREATE OR REPLACE: the bodies are 045's already and
-- restating them here would mean two copies of the same SQL drifting apart.

alter function workflow.seed_progress_cells(uuid, uuid) security invoker;
alter function workflow.project_system_floors_after_insert() security invoker;
alter function workflow.project_system_floors_after_update() security invoker;
alter function workflow.project_floors_extend_full_coverage() security invoker;

commit;
