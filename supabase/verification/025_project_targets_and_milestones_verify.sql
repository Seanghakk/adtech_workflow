-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 025
-- Brief: ADTECH_WF_Brief_075_Project_Targets_For_Progress_Chart_Investigate_And_Draft
--
-- STANDING TRAP (carried forward from every prior verify file in this
-- project): run through a superuser/service-role session and you bypass
-- RLS entirely — nothing here proves anything about app-level access,
-- only about the objects' shape. Queries 6-9 below specifically need to
-- run AS a real member (e.g. via the Supabase SQL editor's "Run as
-- authenticated user" / a `set role`+`set request.jwt.claims` session, or
-- equivalent) to actually exercise RLS, not as the migration owner.
-- =============================================================================

-- 1. workflow.projects.target_date exists, nullable, date. Expect exactly
-- 1 row: target_date | date | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow'
  and table_name = 'projects'
  and column_name = 'target_date';

-- 2. workflow.projects still carries EXACTLY ONE policy (projects_select)
-- — this migration must not have added a second one. Expect exactly 1 row.
select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'projects';

-- 3. workflow.set_project_target_date(uuid, date) exists, SECURITY
-- DEFINER. Expect exactly 1 row: prosecdef = t.
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow' and p.proname = 'set_project_target_date';

-- 4. workflow.project_milestones exists with exactly the expected shape.
-- Expect 7 rows: id, project_id, target_date, target_percent, created_by,
-- created_at, updated_at.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'project_milestones'
order by ordinal_position;

-- 5. Constraints on workflow.project_milestones — expect the percent
-- CHECK, the project+date UNIQUE, the project_id FK (RESTRICT), and the
-- primary key. Confirm the FK's delete rule specifically.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.project_milestones'::regclass
order by contype;

-- 6. RLS is enabled and exactly 4 policies exist (select/insert/update/
-- delete), all named project_milestones_*.
select relrowsecurity
from pg_class
where oid = 'workflow.project_milestones'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'project_milestones'
order by cmd;

-- 7. DELETE is explicitly granted to authenticated (not covered by the
-- schema's default privileges — see migration's own comment).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow'
  and table_name = 'project_milestones'
  and grantee = 'authenticated'
order by privilege_type;

-- 8. The BEFORE INSERT OR UPDATE trigger exists and is enabled.
select tgname, tgenabled, tgtype
from pg_trigger
where tgrelid = 'workflow.project_milestones'::regclass
  and not tgisinternal;

-- =============================================================================
-- BEHAVIOURAL CHECKS — run these as a real authenticated member (not the
-- migration owner) to actually exercise RLS and the trigger. Replace
-- <project-with-pic>, <other-member-not-pic-not-manager>, etc. with real
-- ids from the rollback-test database. NOT run as part of this drafting
-- session — see this brief's own Result doc for why (§0/§5: nothing was
-- applied to any database this session).
-- =============================================================================

-- 9a. As the project's own PIC: setting a target date succeeds.
--   select workflow.set_project_target_date('<project-with-pic>', '2026-12-01');
--   select target_date from workflow.projects where id = '<project-with-pic>';
--   -- expect: 2026-12-01

-- 9b. As a member who is neither this project's PIC nor a manager:
-- setting a target date is refused.
--   select workflow.set_project_target_date('<project-with-pic>', '2026-12-15');
--   -- expect: exception "Only this project's PIC or a manager/admin may set its target date."

-- 9c. As a manager (not this project's PIC): setting a target date
-- succeeds too (PIC OR manager, brief §1d).
--   select workflow.set_project_target_date('<project-with-pic>', '2026-12-20');
--   -- expect: success

-- 9d. Milestone insert by the PIC succeeds; by a non-PIC/non-manager
-- member is refused (RLS, not the function this time).
--   insert into workflow.project_milestones (project_id, target_date, target_percent, created_by)
--   values ('<project-with-pic>', '2026-10-01', 30, auth.uid());
--   -- expect: success as PIC/manager, RLS violation as anyone else

-- 9e. Percent-must-rise trigger: insert a second milestone at a LATER
-- date with a LOWER percent than an existing one — expect the trigger's
-- own exception, not a silent insert.
--   insert into workflow.project_milestones (project_id, target_date, target_percent, created_by)
--   values ('<project-with-pic>', '2026-11-01', 10, auth.uid());
--   -- expect: exception "... target percent must rise as target date rises."

-- 9f. Milestone-after-project-target-date trigger: with
-- projects.target_date already set to 2026-12-01 (from 9a), insert a
-- milestone dated AFTER it — expect the trigger's own exception.
--   insert into workflow.project_milestones (project_id, target_date, target_percent, created_by)
--   values ('<project-with-pic>', '2027-01-01', 50, auth.uid());
--   -- expect: exception "... falls after the project's own target date ..."

-- 9g. updated_at is actually bumped on UPDATE (the Brief 056 gap this
-- migration is explicit about not repeating).
--   update workflow.project_milestones set target_percent = 35 where id = '<a milestone id from 9d>';
--   select created_at, updated_at from workflow.project_milestones where id = '<same id>';
--   -- expect: updated_at > created_at
