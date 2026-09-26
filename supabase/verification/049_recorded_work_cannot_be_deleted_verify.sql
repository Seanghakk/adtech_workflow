-- =============================================================================
-- 049 — Recorded work cannot be deleted: VERIFICATION
-- =============================================================================
--
-- Read-only. Safe against production.
--
-- NO \pset LINES, and THE CHECKS ARE THE LAST STATEMENT, so pasting the whole
-- file into the Supabase SQL editor shows the PASS/FAIL table.
--
-- Markers, not existence: every function check greps the function BODY.
-- Proved to discriminate by corrupting each marker by one character and
-- re-running — the marker checks flipped to FAIL while the functions still
-- existed.
--
-- Run BEFORE applying 049 and the guard checks print FAIL. That is the point.
--
-- Expected AFTER 049: 22 rows, all PASS.
--
-- NOTE: this file proves the guards EXIST and are wired correctly. That they
-- WORK — including that the app's own delete order cannot get around them —
-- is proved by 049_..._behavioural.sql, which writes rows and is for
-- rollback-test ONLY. Do not run that one here.
-- =============================================================================

with checks as (

  -- ---- the opt-in ---------------------------------------------------------
  select 1::numeric as n, '049 · destructive deletes need an explicit opt-in (marker)' as check_name,
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'destructive_delete_allowed'
               and pg_get_functiondef(p.oid) like '%049 marker: destructive deletes require an explicit opt-in%') as ok

  -- It must default to OFF when nobody set it. current_setting's second
  -- argument is what makes a missing setting return null instead of raising;
  -- without it every delete in the database would error.
  union all select 2, '049 · a missing setting means NO, it does not raise',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'destructive_delete_allowed'
               and pg_get_functiondef(p.oid) like '%current_setting(''workflow.allow_destructive_delete'', true)%')
  union all select 3, '049 · the opt-in is OFF right now (nothing set it)',
    (workflow.destructive_delete_allowed() = false)

  -- ---- guard 1: the progress cell, which is where the work lives ----------
  union all select 4, '049 · a cell carrying work cannot be deleted (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'progress_cells_refuse_delete_with_work'
               and pg_get_functiondef(p.oid) like '%049 marker: a progress cell carrying work cannot be deleted%')

  -- SECURITY DEFINER is load bearing, not decoration. A guard that read
  -- through the caller's RLS would see no rows for a user who cannot select
  -- them, find nothing to protect, and allow the delete.
  union all select 5, '049 · the cell guard runs SECURITY DEFINER',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'progress_cells_refuse_delete_with_work'
               and p.prosecdef)
  union all select 6, '049 · the cell guard has a pinned search_path',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'progress_cells_refuse_delete_with_work'
               and array_to_string(p.proconfig, ',') like '%search_path%')
  union all select 7, '049 · the cell guard is wired BEFORE DELETE, per row',
    exists (select 1 from pg_trigger
             where tgrelid = to_regclass('workflow.progress_cells')
               and tgname = 'progress_cells_refuse_delete_with_work'
               and not tgisinternal
               and (tgtype & 1) > 0 and (tgtype & 2) > 0 and (tgtype & 8) > 0)

  -- A QC inspection alone must protect the cell, even at not_started. This is
  -- exactly the clause the application had silently lost.
  union all select 8, '049 · an inspection alone protects a cell',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'progress_cells_refuse_delete_with_work'
               and pg_get_functiondef(p.oid) like '%v_inspections > 0%')
  union all select 9, '049 · a reason or a photo also counts as work',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'progress_cells_refuse_delete_with_work'
               and pg_get_functiondef(p.oid) like '%old.reason is not null%'
               and pg_get_functiondef(p.oid) like '%old.photo_url is not null%')

  -- ---- guard 2: floor drawing items ---------------------------------------
  union all select 10, '049 · a drawing item carrying work cannot be deleted (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'shop_drawing_items_refuse_delete_with_work'
               and pg_get_functiondef(p.oid) like '%049 marker: a drawing item carrying work cannot be deleted%')
  union all select 11, '049 · the drawing guard is wired BEFORE DELETE, per row',
    exists (select 1 from pg_trigger
             where tgrelid = to_regclass('workflow.shop_drawing_items')
               and tgname = 'shop_drawing_items_refuse_delete_with_work'
               and not tgisinternal
               and (tgtype & 1) > 0 and (tgtype & 2) > 0 and (tgtype & 8) > 0)

  -- ---- guard 2b: the pre-D096 archive is work too --------------------------
  -- Staged 045 keeps floor_sub_stages because production holds real recorded
  -- work in it. Archived work gets the same protection as a live cell.
  union all select 11.1, '049 · archived pre-D096 work cannot be deleted (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'floor_sub_stages_refuse_delete_with_work'
               and pg_get_functiondef(p.oid) like '%049 marker: archived pre-D096 work cannot be deleted either%')
  union all select 11.2, '049 · the archive guard is wired BEFORE DELETE, per row',
    exists (select 1 from pg_trigger
             where tgrelid = to_regclass('workflow.floor_sub_stages')
               and tgname = 'floor_sub_stages_refuse_delete_with_work'
               and not tgisinternal
               and (tgtype & 1) > 0 and (tgtype & 2) > 0 and (tgtype & 8) > 0)
  -- An inspection still pointing at an archived row protects it, exactly as
  -- an inspection protects a cell.
  union all select 11.3, '049 · an inspection alone protects an archived row',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'floor_sub_stages_refuse_delete_with_work'
               and pg_get_functiondef(p.oid) like '%qi.floor_sub_stage_id = old.id%')
  -- The archive must be inert: nothing recomputes from it any more.
  union all select 11.4, '049 · the old rollup trigger is off the archive',
    not exists (select 1 from pg_trigger
                 where tgrelid = to_regclass('workflow.floor_sub_stages')
                   and tgname = 'floor_sub_stages_recalculate_rollup'
                   and not tgisinternal)

  -- ---- guard 3: the readable error ----------------------------------------
  union all select 12, '049 · the floor-level message exists (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'project_floors_refuse_delete_with_work'
               and pg_get_functiondef(p.oid) like '%049 marker: a floor with recorded work cannot be deleted%')
  union all select 13, '049 · the floor guard is wired BEFORE DELETE, per row',
    exists (select 1 from pg_trigger
             where tgrelid = to_regclass('workflow.project_floors')
               and tgname = 'project_floors_refuse_delete_with_work'
               and not tgisinternal
               and (tgtype & 1) > 0 and (tgtype & 2) > 0 and (tgtype & 8) > 0)

  -- THE POINT OF THE WHOLE MIGRATION. A guard on project_floors alone is
  -- defeated by the app's own order (coverage, then cells, then the floor):
  -- by the time it runs, the evidence is gone. So the cell-level guard must
  -- exist as well, and this asserts BOTH are present rather than one.
  union all select 14, '049 · the guard is NOT floor-level only (both triggers exist)',
    ((select count(*) from pg_trigger t
       where not t.tgisinternal
         and t.tgrelid in (to_regclass('workflow.progress_cells'),
                           to_regclass('workflow.project_floors'))
         and t.tgname like '%refuse_delete_with_work') = 2)

  -- ---- the orphan ---------------------------------------------------------
  union all select 15, '049 · orphaned recalculate_rollup_from_sub_stage is GONE',
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'workflow' and p.proname = 'recalculate_rollup_from_sub_stage')

  -- The live one must survive. Dropping the wrong rollup function would stop
  -- the completion figure moving and nothing would say so — migration 047
  -- already proved how quiet that failure is.
  union all select 16, '049 · the LIVE rollup function is untouched',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'recalculate_rollup_from_progress_cell')
  union all select 17, '049 · its trigger is still wired to progress_cells',
    exists (select 1 from pg_trigger
             where tgrelid = to_regclass('workflow.progress_cells')
               and tgname = 'progress_cells_recalculate_rollup'
               and not tgisinternal)

  -- 049 adds guards; it must not have relaxed 048's write rules on the way.
  union all select 18, '049 · 048''s stage-keyed write policies still stand',
    ((select count(*) from pg_policy
       where polrelid = to_regclass('workflow.progress_cells')
         and polname in ('progress_cells_insert', 'progress_cells_update')) = 2)
)
select
  n as "#",
  check_name as "check",
  case when ok then 'PASS' else 'FAIL' end as "result"
from checks
order by n;
