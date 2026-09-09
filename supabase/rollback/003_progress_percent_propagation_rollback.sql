-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 003
-- Brief: ADTECH_WF_Brief_002_Auth_Shell_And_Screen_6a §3
--
-- Reverses 003_progress_percent_propagation.sql:
-- - Drops the new BEFORE INSERT trigger/function
--   (workflow.compute_progress_update_delta) entirely — it did not exist
--   before this migration.
-- - Restores workflow.bump_last_meaningful_movement() to its migration-001
--   form (timestamp bump only, no percent_complete write). Does NOT drop
--   progress_updates_bump_movement itself — that trigger predates this
--   migration and must keep existing, just pointing at the restored
--   function body.
--
-- Does not touch `public`, does not touch any row already written by the
-- amended trigger while it was live — a projects.percent_complete value
-- already propagated by this migration stays as it is; this rollback only
-- changes what happens to the NEXT insert.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop trigger if exists progress_updates_compute_delta on workflow.progress_updates;
drop function if exists workflow.compute_progress_update_delta();

create or replace function workflow.bump_last_meaningful_movement()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if new.subject_type = 'project' and new.meets_threshold then
    update workflow.projects
    set last_meaningful_movement_at = new.recorded_at,
        updated_at = now()
    where id = new.subject_id;
  end if;
  return new;
end;
$$;

comment on function workflow.bump_last_meaningful_movement() is
  'Brief §4.6: "projects.last_meaningful_movement_at is bumped ONLY when '
  'meets_threshold is true." Enforced here so it holds regardless of '
  'which code path inserts a progress_updates row.';

-- progress_updates_bump_movement trigger itself is untouched — it already
-- exists from migration 001 and keeps firing, now against the restored
-- function body above.

commit;
