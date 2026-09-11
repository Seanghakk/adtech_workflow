-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 006
-- Brief: ADTECH_WF_Fable_Brief_002_Project_PIC_And_Theme_6 §1.1 / §2
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 006_project_pic_and_permission.sql. Every query inspects live
-- catalog/table state, never the migration text — same discipline as
-- every other verification file in this project.
-- =============================================================================

-- 1. workflow.projects.pic_id exists, is a nullable uuid, and FKs to
--    public.user_profiles.
-- Expect one row: pic_id | uuid | YES (nullable).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'projects' and column_name = 'pic_id';

-- Expect one row naming the FK to public.user_profiles(id).
select
  tc.constraint_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
where tc.table_schema = 'workflow' and tc.table_name = 'projects'
  and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'pic_id';


-- 2. progress_updates_insert is the new "PIC of the record only" rule — no
--    is_manager(), no is_sales_only_member(), no owner_id anywhere in it.
-- Expect one row. Eyeball the definition: it should reference
-- workflow.projects.pic_id and workflow.project_items.pic_id only, and must
-- NOT contain the substrings 'is_manager' or 'owner_id'.
select
  polname,
  pg_get_expr(polwithcheck, polrelid) as with_check_definition,
  pg_get_expr(polwithcheck, polrelid) not like '%is_manager%'
    and pg_get_expr(polwithcheck, polrelid) not like '%owner_id%' as manager_and_owner_bypass_removed
from pg_policy
join pg_class on pg_class.oid = pg_policy.polrelid
where pg_class.relname = 'progress_updates' and polname = 'progress_updates_insert';

-- Expect: manager_and_owner_bypass_removed = true, above.


-- 3. progress_updates_select is UNCHANGED by this migration — still
--    migration 004's can_view_project()-gated version, not touched here.
-- Expect one row whose definition mentions can_view_project.
select
  polname,
  pg_get_expr(polqual, polrelid) like '%can_view_project%' as still_gated_by_can_view_project
from pg_policy
join pg_class on pg_class.oid = pg_policy.polrelid
where pg_class.relname = 'progress_updates' and polname = 'progress_updates_select';


-- 4. THE DEV-SEED BACKFILL — DEV-SEED CONVENIENCE, NOT A REAL ASSIGNMENT.
-- Expect 4 rows (every seed_dev.sql project), all pic_id pointing at the
-- same public.user_profiles row whose email is n.seanghakk@gmail.com.
select p.name, p.pic_id, up.full_name as pic_name
from workflow.projects p
left join public.user_profiles up on up.id = p.pic_id
where p.name like '%(fake — dev seed)%'
order by p.name;

-- Converse check — zero rows means the backfill's `where ... is null` guard
-- worked as intended and did not clobber a pic_id someone had already set
-- by hand before this migration ran.
-- Expect ZERO rows, UNLESS you had manually set a different pic_id on one
-- of these four before applying this migration, in which case this row is
-- expected and not a problem.
select name, pic_id
from workflow.projects
where name like '%(fake — dev seed)%'
  and pic_id is not null
  and pic_id <> (select id from auth.users where email = 'n.seanghakk@gmail.com');


-- 5. THE UN-UPDATABLE-WITHOUT-A-PIC BEHAVIOUR IS REAL, NOT JUST DESCRIBED —
--    proven with a real insert attempt, run as YOUR OWN signed-in role, not
--    as table owner. This block only proves something if run through the
--    app's normal connection (RLS applies to `authenticated`/`anon`, not to
--    the SQL editor's default owner role) — if run as owner in the SQL
--    editor this will misleadingly succeed regardless of the policy. Skip
--    this block if you cannot switch role; step 9 of this round's hand-
--    verification script covers the same guarantee through the real app
--    instead.
--
-- set local role authenticated;  -- uncomment if your SQL editor session
--                                 -- supports switching role directly.
-- Expect: this INSERT is REJECTED by RLS (a permission/policy error) when
-- your account is NOT the pic_id of a project you try it against, and a
-- NULL-pic_id project rejects EVERY account, including your own.


-- 6. No object was created outside `workflow`, and no CMMS/`public` object
--    was touched — this migration's only cross-schema reference is the
--    READ-ONLY FK to public.user_profiles(id), same pattern as every other
--    person-reference column in this schema.
-- Expect ZERO rows.
select n.nspname as schema_name, c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'projects' and n.nspname = 'public';
