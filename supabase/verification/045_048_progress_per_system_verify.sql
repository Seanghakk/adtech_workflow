-- =============================================================================
-- 045–048 — Progress per system: VERIFICATION (Brief 106 §2)
-- =============================================================================
--
-- Read-only. Safe against production.
--
-- NO \pset LINES. They are psql-only and the Supabase SQL editor rejects
-- them, which cost two rounds on Brief 105.
--
-- THE CHECKS ARE THE LAST STATEMENT IN THIS FILE, so pasting the whole thing
-- into the editor shows the PASS/FAIL table rather than a summary line.
--
-- Brief 106 §2: "Verification asserts MARKERS, not existence, for every
-- function. Prove at least one check FAILS against the pre-migration state."
-- Every function check below greps the function BODY for a marker unique to
-- its migration. Run this file BEFORE applying and most checks print FAIL —
-- that is the point, and it is how you know the file is testing anything.
--
-- Expected AFTER 045, 046, 047 and 048: 34 rows, all PASS.
-- =============================================================================

with checks as (

  -- ---- 045: the reshape ---------------------------------------------------
  select 1 as n, '045 · progress_cells exists' as check_name,
    (to_regclass('workflow.progress_cells') is not null) as ok
  union all select 2, '045 · project_system_floors exists',
    (to_regclass('workflow.project_system_floors') is not null)
  union all select 3, '045 · floor_sub_stages is GONE',
    (to_regclass('workflow.floor_sub_stages') is null)

  -- A cell cannot exist outside coverage — 17a item 20's composite FK, the
  -- rule that makes "not applicable" mean something.
  union all select 4, '045 · a cell cannot exist outside coverage (composite FK)',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.progress_cells')
         and contype = 'f'
         and confrelid = to_regclass('workflow.project_system_floors')
         and array_length(conkey, 1) = 2
    )
  union all select 5, '045 · one cell per (system, floor, stage, sub-stage)',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.progress_cells')
         and contype = 'u'
         and pg_get_constraintdef(oid) like '%project_system_id%'
         and pg_get_constraintdef(oid) like '%sub_stage%'
    )
  union all select 6, '045 · coverage is unique per (system, floor)',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.project_system_floors')
         and contype = 'u'
    )
  union all select 7, '045 · still only three stored statuses',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.progress_cells')
         and conname = 'progress_cells_status_check'
         and pg_get_constraintdef(oid) like '%not_started%'
         and pg_get_constraintdef(oid) like '%in_progress%'
         and pg_get_constraintdef(oid) like '%done%'
    )

  union all select 8, '045 · seed function carries its marker',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'seed_progress_cells'
               and pg_get_functiondef(p.oid) like '%045 marker: five sub-stages seeded per covered system and floor%')
  union all select 9, '045 · coverage creates cells (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'project_system_floors_after_insert'
               and pg_get_functiondef(p.oid) like '%045 marker: coverage creates cells%')
  union all select 10, '045 · restoring coverage restores the SAME cells (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'project_system_floors_after_update'
               and pg_get_functiondef(p.oid) like '%045 marker: restoring coverage restores the same cells%')
  union all select 11, '045 · a new floor joins only full-coverage systems (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'project_floors_extend_full_coverage'
               and pg_get_functiondef(p.oid) like '%045 marker: a new floor joins only the systems that covered every floor%')

  -- Removal must never delete: the cells hang off that row by composite FK.
  union all select 12, '045 · coverage removal is a timestamp, not a delete',
    exists (
      select 1 from information_schema.columns
       where table_schema = 'workflow' and table_name = 'project_system_floors'
         and column_name = 'removed_at' and is_nullable = 'YES'
    )

  union all select 13, '045 · the rollup buckets covered pairs (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'compute_project_rollup_percent'
               and pg_get_functiondef(p.oid) like '%045 marker: one bucket per covered system and floor, plus project drawings%')
  union all select 14, '045 · the rollup ignores QC, as before',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'compute_project_rollup_percent'
               and pg_get_functiondef(p.oid) not like '%qc_inspections%')

  union all select 15, '045 · inspections hang off the cell',
    exists (select 1 from information_schema.columns
             where table_schema = 'workflow' and table_name = 'qc_inspections'
               and column_name = 'progress_cell_id')
  union all select 16, '045 · floor_sub_stage_id is gone from inspections',
    not exists (select 1 from information_schema.columns
                 where table_schema = 'workflow' and table_name = 'qc_inspections'
                   and column_name = 'floor_sub_stage_id')
  union all select 17, '045 · material inspection still carries NO cell',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.qc_inspections')
         and conname = 'qc_inspections_shape_check'
         and pg_get_constraintdef(oid) like '%material%'
         and pg_get_constraintdef(oid) like '%progress_cell_id IS NULL%'
    )

  -- ---- 046: the import proposes coverage ----------------------------------
  union all select 18, '046 · the import writes coverage (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'commit_boq_import'
               and pg_get_functiondef(p.oid) like '%046 marker: the import proposes coverage, additively and never removing%')
  union all select 19, '046 · it is ADDITIVE — no delete of coverage anywhere in it',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'commit_boq_import'
               and pg_get_functiondef(p.oid) not like '%delete from workflow.project_system_floors%')
  union all select 20, '046 · it resolves floors on tower AND label',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'commit_boq_import'
               and pg_get_functiondef(p.oid) like '%v_cov_floor->>''towerLabel''%')

  -- ---- 047: recording progress moves the figure ---------------------------
  union all select 21, '047 · the rollup trigger exists again (marker)',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'recalculate_rollup_from_progress_cell'
               and pg_get_functiondef(p.oid) like '%047 marker: progress recalculates the rollup%')
  union all select 22, '047 · it is wired to progress_cells',
    exists (select 1 from pg_trigger
             where tgrelid = to_regclass('workflow.progress_cells')
               and tgname = 'progress_cells_recalculate_rollup'
               and not tgisinternal)
  -- Coverage changes create and remove cells in bulk, and each moves the
  -- denominator as surely as a status change does.
  union all select 23, '047 · it fires on INSERT, UPDATE and DELETE',
    exists (select 1 from pg_trigger
             where tgrelid = to_regclass('workflow.progress_cells')
               and tgname = 'progress_cells_recalculate_rollup'
               and (tgtype & 4) > 0 and (tgtype & 8) > 0 and (tgtype & 16) > 0)

  -- ---- 048: the two rules 045 lost ----------------------------------------
  union all select 24, '048 · the stage/sub-stage shape check is back',
    exists (select 1 from pg_constraint
             where conrelid = to_regclass('workflow.progress_cells')
               and conname = 'progress_cells_shape_check'
               and pg_get_constraintdef(oid) like '%pre_commissioning%')
  union all select 25, '048 · an installation stage cannot carry a tnc sub-stage',
    exists (select 1 from pg_constraint
             where conrelid = to_regclass('workflow.progress_cells')
               and conname = 'progress_cells_shape_check'
               and pg_get_constraintdef(oid) like '%third_fix%')

  union all select 26, '048 · writes are stage-keyed again (insert)',
    exists (select 1 from pg_policy
             where polrelid = to_regclass('workflow.progress_cells')
               and polname = 'progress_cells_insert'
               and pg_get_expr(polwithcheck, polrelid) like '%project_management%'
               and pg_get_expr(polwithcheck, polrelid) like '%tnc%')
  union all select 27, '048 · writes are stage-keyed again (update)',
    exists (select 1 from pg_policy
             where polrelid = to_regclass('workflow.progress_cells')
               and polname = 'progress_cells_update'
               and pg_get_expr(polqual, polrelid) like '%project_management%')

  -- NOTHING LOOSENED. The old table had no superadmin and no PIC bypass on a
  -- write; 045 added both and 048 took them back out.
  union all select 28, '048 · NOTHING loosened — no superadmin bypass on a write',
    not exists (select 1 from pg_policy
                 where polrelid = to_regclass('workflow.progress_cells')
                   and polname in ('progress_cells_insert', 'progress_cells_update')
                   and (coalesce(pg_get_expr(polqual, polrelid), '') ||
                        coalesce(pg_get_expr(polwithcheck, polrelid), '')) ilike '%superadmin%')
  union all select 29, '048 · NOTHING loosened — no PIC bypass on a write',
    not exists (select 1 from pg_policy
                 where polrelid = to_regclass('workflow.progress_cells')
                   and polname in ('progress_cells_insert', 'progress_cells_update')
                   and (coalesce(pg_get_expr(polqual, polrelid), '') ||
                        coalesce(pg_get_expr(polwithcheck, polrelid), '')) ilike '%pic_id%')
  -- Cells go by removing coverage, which is PIC-gated. A blanket FOR ALL
  -- would have granted a delete nobody previously had.
  union all select 30, '048 · still NO delete policy on cells',
    not exists (select 1 from pg_policy
                 where polrelid = to_regclass('workflow.progress_cells') and polcmd = 'd')

  -- ---- RLS, and who may read ----------------------------------------------
  union all select 31, 'RLS is on for both new tables',
    (select count(*) = 2 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'workflow' and c.relrowsecurity
        and c.relname in ('progress_cells', 'project_system_floors'))
  union all select 32, 'reads use the same project-access rule as the BOQ',
    exists (select 1 from pg_policy
             where polrelid = to_regclass('workflow.progress_cells')
               and polname = 'progress_cells_select'
               and pg_get_expr(polqual, polrelid) like '%can_view_project%')
  union all select 33, 'coverage is PIC-gated, not team-gated',
    exists (select 1 from pg_policy
             where polrelid = to_regclass('workflow.project_system_floors')
               and polname = 'project_system_floors_write'
               and pg_get_expr(polqual, polrelid) like '%pic_id%')

  -- ---- The rule, checked against real rows ---------------------------------
  -- Every check above reads the catalogue. This one reads the DATA: it asserts
  -- the composite FK is not merely declared but actually holds.
  --
  -- It goes through query_to_xml deliberately. Naming workflow.progress_cells
  -- directly would make this file ABORT pre-migration — Postgres resolves
  -- table names when it plans the statement, so a missing table is an error
  -- before any row is evaluated, and a CASE guard cannot prevent that. The
  -- whole file would then print "relation does not exist" instead of the
  -- FAIL table, which is exactly the run that needs to be readable.
  -- query_to_xml takes its query as a STRING, parsed only if it executes, so
  -- the to_regclass guard in front of it really does short-circuit.
  union all select 34, 'no cell exists outside coverage (the FK, checked against real rows)',
    case
      when to_regclass('workflow.progress_cells') is null then false
      else (
        xpath(
          '/row/c/text()',
          query_to_xml(
            'select count(*) as c
               from workflow.progress_cells c
               left join workflow.project_system_floors psf
                 on psf.project_system_id = c.project_system_id
                and psf.floor_id = c.floor_id
              where psf.id is null',
            false, true, ''
          )
        )
      )[1]::text::bigint = 0
    end
)
select
  n as "#",
  check_name as "check",
  case when ok then 'PASS' else 'FAIL' end as "result"
from checks
order by n;
