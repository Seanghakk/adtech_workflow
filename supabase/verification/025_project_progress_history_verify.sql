-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 025
-- Brief: ADTECH_WF_Brief_077_Revise_PR48_Progress_History_And_Start_Date
--
-- STANDING TRAP (carried forward from every prior verify file in this
-- project): run through a superuser/service-role session and you bypass
-- RLS entirely — nothing here proves anything about app-level access,
-- only about the objects' shape. Query 7 below specifically needs a real
-- authenticated member session to actually exercise RLS.
-- =============================================================================

-- 1. workflow.project_progress_history exists with exactly the expected
-- shape. Expect 6 rows: id, project_id, percent_calculated,
-- percent_complete, recorded_at, source, changed_by (7 rows if you count
-- id — the point is all 7 columns are present with the right types).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'project_progress_history'
order by ordinal_position;

-- 2. Constraints: percent_calculated 0-100 (nullable), percent_complete
-- 0-100 (not null), source is one of the four known values, project_id
-- FK is RESTRICT. Expect 4 check/FK constraints plus the primary key.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.project_progress_history'::regclass
order by contype;

-- 3. The project_id/recorded_at index exists.
select indexname, indexdef
from pg_indexes
where schemaname = 'workflow' and tablename = 'project_progress_history';

-- 4. RLS is enabled, and EXACTLY ONE policy exists (select only) — no
-- client-writable policy of any kind. Expect relrowsecurity = t, and
-- exactly 1 row from pg_policies.
select relrowsecurity
from pg_class
where oid = 'workflow.project_progress_history'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'project_progress_history';

-- 5. workflow.projects now carries exactly ONE trigger — the new one.
-- Expect exactly 1 row.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'workflow.projects'::regclass and not tgisinternal;

-- 6. Confirm recalculate_project_rollup() and bump_last_meaningful_
-- movement() are BYTE-FOR-BYTE UNCHANGED by this migration — their own
-- source should read identically to migrations 008/003's own bodies
-- (eyeball this against those files directly; no automated diff here).
select proname, prosrc
from pg_proc
where pronamespace = 'workflow'::regnamespace
  and proname in ('recalculate_project_rollup', 'bump_last_meaningful_movement');

-- 7. BACKFILL SANITY — run once, right after applying:
--   a. One 'backfill_current' row per existing project. Expect this
--      count to equal `select count(*) from workflow.projects`.
select count(*) as backfill_current_rows
from workflow.project_progress_history
where source = 'backfill_current';

--   b. One 'backfill_progress_update' row per existing progress_updates
--      row (subject_type='project', new_percent not null). Expect this
--      count to equal that same filtered count on progress_updates.
select count(*) as backfill_progress_update_rows
from workflow.project_progress_history
where source = 'backfill_progress_update';

select count(*) as source_progress_updates_rows
from workflow.progress_updates
where subject_type = 'project' and new_percent is not null;

--   c. No row anywhere has source 'floor_rollup' or 'manual' yet — those
--      only appear once the live trigger fires for the first time after
--      this migration is applied. Expect 0 rows immediately after
--      applying, before any real progress update happens.
select count(*) as live_rows_so_far
from workflow.project_progress_history
where source in ('floor_rollup', 'manual');

-- =============================================================================
-- BEHAVIOURAL CHECK — proves the trigger works. Run as a real
-- authenticated member session (not the migration owner), per this
-- brief's own numbered apply procedure (see the Result doc for the exact
-- steps to paste and what to expect at each one).
-- =============================================================================

-- 8. One concrete change should produce exactly one new history row.
-- Example, using the manual-override path (any project the caller is
-- PIC of works; substitute a real project id):
--   insert into workflow.progress_updates (subject_type, subject_id, author_id, new_percent, is_no_change, reason_code)
--   values ('project', '<a project id you are PIC of>', auth.uid(), 42, false, 'awaiting_client');
--
--   select project_id, percent_calculated, percent_complete, recorded_at, source, changed_by
--   from workflow.project_progress_history
--   where project_id = '<same project id>'
--   order by recorded_at desc
--   limit 1;
--   -- expect: exactly one NEW row, percent_complete = 42, source = 'manual',
--   -- changed_by = your own auth.uid(), recorded_at ~= just now.
