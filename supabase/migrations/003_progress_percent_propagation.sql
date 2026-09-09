-- =============================================================================
-- ADTECH Workflow Tracker — Migration 003: percent-complete propagation
-- Brief: ADTECH_WF_Brief_002_Auth_Shell_And_Screen_6a §3
--
-- CHECKED FIRST, PER THE BRIEF: workflow.bump_last_meaningful_movement()
-- (migration 001) already exists and already fires AFTER INSERT on
-- workflow.progress_updates. Read in full before writing anything here.
-- What it already does: bump projects.last_meaningful_movement_at, but
-- ONLY when meets_threshold — i.e. exactly Brief 001 §4.6, and nothing
-- more. What it does NOT do: touch projects.percent_complete at all.
-- Before this brief, nothing anywhere ever wrote to that column outside
-- its DEFAULT 0 — there was no propagation mechanism for it in existence,
-- correct or otherwise, because Brief 002 is the first brief to specify
-- one ("inserting a row into progress_updates is the ONLY way a
-- percentage ever changes"). So this is completing a function that
-- implements one part of a two-part job (Brief 001 §4.6's timestamp rule)
-- with the other part Brief 002 §4 newly specifies (percent propagation),
-- not two mechanisms disagreeing about who owns percent_complete. Amending
-- this SAME function/trigger is therefore the right move, not a second,
-- competing mechanism — see Result 002 for the full reasoning trail.
--
-- WHAT THIS MIGRATION ADDS, ON TOP OF THE EXISTING BUMP LOGIC:
--
-- 1. workflow.bump_last_meaningful_movement() (CREATE OR REPLACE, same
--    name, same trigger, same AFTER INSERT firing) now also sets
--    projects.percent_complete = new_percent on every project-scoped
--    insert, unconditionally — Brief 002 §4 rule 1: percent_complete
--    ALWAYS reflects the latest submitted value, whatever the delta.
--    last_meaningful_movement_at keeps its existing threshold-gated
--    behaviour, untouched.
--
-- 2. A NEW, SEPARATE BEFORE INSERT trigger/function,
--    workflow.compute_progress_update_delta(), added for a reason the
--    brief doesn't spell out but the schema makes unavoidable: old_percent
--    and delta are plain stored columns, not generated ones (only
--    meets_threshold is `generated always as`). Something has to compute
--    them. Trusting the client for old_percent would let a stale or
--    malicious client insert a wrong delta into an APPEND-ONLY audit
--    table — permanently, since progress_updates has no UPDATE/DELETE
--    policy. This trigger overrides NEW.old_percent with the row's
--    CURRENT live percent_complete (read inside the same trigger, so it
--    is authoritative regardless of what the client sent) and computes
--    NEW.delta from that against the client-supplied NEW.new_percent.
--    Brief §4 rule 2 says every update is stored with its TRUE delta —
--    a server-computed delta is the only way that claim can actually
--    hold. This does not touch `is_no_change` or `reason_code`, both of
--    which stay exactly what the client submits.
--
-- Neither trigger touches `public`. Idempotent by construction: both are
-- CREATE OR REPLACE FUNCTION / CREATE OR REPLACE TRIGGER-equivalent
-- (`drop trigger if exists` + `create trigger`), safe to re-run.
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor, same as every
-- migration in this project — see supabase/verification/
-- 003_progress_percent_propagation_verify.sql for the checks to run
-- after applying, and Result 002 for why a live INSERT-based behavioural
-- test isn't included there (projects/project_items are empty in prod
-- today — seed_dev.sql plus exercising 6a itself is the real test).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. BEFORE INSERT — compute the true old_percent/delta server-side.
-- -----------------------------------------------------------------------------
create or replace function workflow.compute_progress_update_delta()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if new.subject_type = 'project' and new.new_percent is not null then
    select p.percent_complete into new.old_percent
    from workflow.projects p
    where p.id = new.subject_id;

    new.delta := new.new_percent - new.old_percent;
  end if;

  return new;
end;
$$;

comment on function workflow.compute_progress_update_delta() is
  'BEFORE INSERT on workflow.progress_updates. Overwrites NEW.old_percent '
  'with the project''s live percent_complete and derives NEW.delta from '
  'it, so a client can never insert a false delta into this append-only '
  'table by sending a stale/wrong old_percent (Brief 002 §3/§4). Only '
  'NEW.new_percent is trusted from the client. No-op for subject_type '
  '= ''item'' or when new_percent is null — progress_updates_item_has_'
  'no_percent_check already forces those to stay null.';

drop trigger if exists progress_updates_compute_delta on workflow.progress_updates;

create trigger progress_updates_compute_delta
before insert on workflow.progress_updates
for each row
execute function workflow.compute_progress_update_delta();

-- -----------------------------------------------------------------------------
-- 2. AFTER INSERT — amend the existing movement-bump function to also
--    propagate percent_complete. Same function name, same trigger
--    (progress_updates_bump_movement, created in migration 001) — this
--    is a CREATE OR REPLACE, not a new trigger.
-- -----------------------------------------------------------------------------
create or replace function workflow.bump_last_meaningful_movement()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if new.subject_type = 'project' and new.new_percent is not null then
    update workflow.projects
    set percent_complete = new.new_percent,
        last_meaningful_movement_at = case
          when new.meets_threshold then new.recorded_at
          else last_meaningful_movement_at
        end,
        updated_at = now()
    where id = new.subject_id;
  end if;
  return new;
end;
$$;

comment on function workflow.bump_last_meaningful_movement() is
  'AFTER INSERT on workflow.progress_updates. Brief 002 §3/§4: this is '
  'the ONLY write path to projects.percent_complete — the app never '
  'issues a direct UPDATE (projects has no UPDATE policy, by design). '
  'percent_complete is set to new_percent UNCONDITIONALLY, every insert, '
  'whatever the delta (rule 1). last_meaningful_movement_at is bumped '
  'ONLY when meets_threshold is true (Brief 001 §4.6, rule 4) — a sub-'
  '5-point creep keeps updating the visible percentage while its stall '
  'clock keeps running, on purpose. No-op for subject_type = ''item''.';

-- Trigger itself is unchanged from migration 001 (same name, same
-- timing, same function) — re-stated here only so this file is a
-- complete, standalone record of what fires on progress_updates.
drop trigger if exists progress_updates_bump_movement on workflow.progress_updates;

create trigger progress_updates_bump_movement
after insert on workflow.progress_updates
for each row
execute function workflow.bump_last_meaningful_movement();

commit;
