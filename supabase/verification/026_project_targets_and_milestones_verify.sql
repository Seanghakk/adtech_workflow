-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 026
-- Brief: ADTECH_WF_Brief_077_Revise_PR48_Progress_History_And_Start_Date
--
-- NOT URGENT — this migration's own apply procedure can follow migration
-- 025's (see that migration's Result-doc procedure; this one's can be
-- written up later, per brief §5's own instruction).
--
-- STANDING TRAP (carried forward from every prior verify file in this
-- project): run through a superuser/service-role session and you bypass
-- RLS entirely — nothing here proves anything about app-level access,
-- only about the objects' shape. Queries 8-10 below specifically need to
-- run AS a real member to actually exercise RLS/the functions.
-- =============================================================================

-- 1. workflow.projects.start_date AND .target_date both exist, nullable,
-- date. Expect exactly 2 rows.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow'
  and table_name = 'projects'
  and column_name in ('start_date', 'target_date')
order by column_name;

-- 2. workflow.projects still carries EXACTLY ONE RLS policy
-- (projects_select) — this migration must not have added a second one.
-- Expect exactly 1 row.
select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'projects';

-- 3. workflow.set_project_dates(uuid, date, date) exists, SECURITY
-- DEFINER — and the OLD single-column set_project_target_date does NOT
-- exist (confirms the rename, not an added second function). Expect
-- exactly 1 row from the first query, 0 rows from the second.
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow' and p.proname = 'set_project_dates';

select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow' and p.proname = 'set_project_target_date';

-- 4. workflow.project_effective_start_date(uuid) exists.
select p.proname, p.prosecdef, p.provolatile
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow' and p.proname = 'project_effective_start_date';

-- 5. workflow.project_milestones exists with exactly the expected shape.
-- Expect 7 rows.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'project_milestones'
order by ordinal_position;

-- 6. Constraints on workflow.project_milestones.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.project_milestones'::regclass
order by contype;

-- 7. RLS enabled, exactly 4 policies (select/insert/update/delete), and
-- DELETE is explicitly granted.
select relrowsecurity
from pg_class
where oid = 'workflow.project_milestones'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'project_milestones'
order by cmd;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow'
  and table_name = 'project_milestones'
  and grantee = 'authenticated'
order by privilege_type;

-- 8. The BEFORE INSERT OR UPDATE trigger exists.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'workflow.project_milestones'::regclass
  and not tgisinternal;

-- =============================================================================
-- BEHAVIOURAL CHECKS — run as a real authenticated member, not the
-- migration owner. Replace <...> with real ids from the rollback-test
-- database. NOT run as part of this drafting session.
-- =============================================================================

-- 9a. Effective start, no start_date set: falls back to opened_at's date.
--   select workflow.project_effective_start_date('<a project id with no start_date>');
--   select opened_at::date from workflow.projects where id = '<same id>';
--   -- expect: both queries return the same date.

-- 9b. Setting start_date changes the effective start.
--   select workflow.set_project_dates('<project id, as its PIC>', '2026-08-01', '2026-12-01');
--   select workflow.project_effective_start_date('<same id>');
--   -- expect: 2026-08-01

-- 9c. start_date >= target_date is refused.
--   select workflow.set_project_dates('<project id, as its PIC>', '2026-12-01', '2026-11-01');
--   -- expect: exception "The start date (...) must be before the target date (...)."

-- 9d. Non-PIC, non-manager is refused.
--   select workflow.set_project_dates('<project id you are NOT PIC/manager of>', '2026-08-01', '2026-12-01');
--   -- expect: exception "Only this project's PIC or a manager/admin may set its start/target dates."

-- 10a. Milestone before effective start is refused (Brief 077's own new
-- rule 3) — with effective start at 2026-08-01 (from 9b):
--   insert into workflow.project_milestones (project_id, target_date, target_percent, created_by)
--   values ('<same project id>', '2026-07-15', 10, auth.uid());
--   -- expect: exception "... falls before the project's own effective start date (2026-08-01)."

-- 10b. Milestone within [effective start, target_date] succeeds.
--   insert into workflow.project_milestones (project_id, target_date, target_percent, created_by)
--   values ('<same project id>', '2026-10-01', 40, auth.uid());
--   -- expect: success
