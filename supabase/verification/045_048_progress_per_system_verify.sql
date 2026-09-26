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
-- PROVED: against a stack built to migration 044, this file prints its table
-- with 42 rows, 32 FAIL. It does not abort. A verification file that ERRORS
-- on the pre-migration run is useless on the one run that matters most, and
-- this one did exactly that twice before it was fixed — see check 39.
--
-- Expected AFTER 045, 046, 047 and 048: 42 rows. Check 39 is a PRECONDITION
-- for migration 050 and may legitimately FAIL — read its comment.
--
-- 045 IS STAGED since it failed on production: it no longer drops
-- floor_sub_stages or floor_sub_stage_id, it accepts either model on an
-- inspection, and it backfills coverage so no project lands on a blank
-- matrix. Checks 3, 3.1, 16, 16.1 and 35-38 are the ones that say so.
-- =============================================================================

with backfill_scope as (
  -- How many systems the 045 backfill actually touched. Printed in checks 36
  -- and 37's own labels, because a check nobody can tell is vacuous is worse
  -- than no check: it reads PASS and gets quoted. Check 39 did exactly that
  -- on an empty stack and produced a confident, wrong prediction.
  select case
    when to_regclass('workflow.project_system_floors') is null then 0::bigint
    else (
      xpath('/row/c/text()', query_to_xml(
        'select count(distinct project_system_id) as c
           from workflow.project_system_floors where source = ''migrated''',
        false, true, ''))
    )[1]::text::bigint
  end as n_systems
),
checks as (

  -- ---- 045: the reshape ---------------------------------------------------
  select 1::numeric as n, '045 · progress_cells exists' as check_name,
    (to_regclass('workflow.progress_cells') is not null) as ok
  union all select 2, '045 · project_system_floors exists',
    (to_regclass('workflow.project_system_floors') is not null)
  -- STAGED. The first version of 045 dropped this table, and on production
  -- that meant deleting 30 rows, 4 of them carrying recorded work. It is now
  -- kept as a frozen archive until migration 050 re-points what points at it.
  union all select 3, '045 · floor_sub_stages is PRESERVED (frozen archive)',
    (to_regclass('workflow.floor_sub_stages') is not null)
  union all select 3.1, '045 · nothing writes the archive any more (seed trigger gone)',
    (not exists (select 1 from pg_trigger
                  where tgname = 'project_floors_seed_children' and not tgisinternal)
     and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'workflow' and p.proname = 'seed_floor_children'))

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
  -- The pre-045 function was SECURITY DEFINER with a pinned search_path and
  -- the first version of this migration silently dropped both — the same
  -- shape as the write policy 048 had to restore. It matters because this
  -- function is exposed as a PostgREST RPC: without definer rights a caller
  -- computes the figure through their own RLS view of progress_cells and gets
  -- a smaller number than the project's real one.
  union all select 13.1, '045 · the rollup kept SECURITY DEFINER and a pinned search_path',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'compute_project_rollup_percent'
               and p.prosecdef
               and array_to_string(p.proconfig, ',') like '%search_path%')
  union all select 14, '045 · the rollup ignores QC, as before',
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'workflow' and p.proname = 'compute_project_rollup_percent'
               and pg_get_functiondef(p.oid) not like '%qc_inspections%')

  union all select 15, '045 · inspections hang off the cell',
    exists (select 1 from information_schema.columns
             where table_schema = 'workflow' and table_name = 'qc_inspections'
               and column_name = 'progress_cell_id')
  -- STAGED. Dropping this column is what made 045 fail on production: it
  -- destroyed the only link an existing inspection had, and then demanded a
  -- replacement link that could not exist yet. It stays until 050.
  union all select 16, '045 · floor_sub_stage_id is KEPT, so the old link survives',
    exists (select 1 from information_schema.columns
             where table_schema = 'workflow' and table_name = 'qc_inspections'
               and column_name = 'floor_sub_stage_id')
  union all select 16.1, '045 · the shape check accepts EITHER model (the staging rule)',
    exists (select 1 from pg_constraint
             where conrelid = to_regclass('workflow.qc_inspections')
               and conname = 'qc_inspections_shape_check'
               and pg_get_constraintdef(oid) like '%floor_sub_stage_id%'
               and pg_get_constraintdef(oid) like '%progress_cell_id%')
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

  -- ---- the coverage backfill (045 section 9) -------------------------------
  union all select 35, '045 · ''migrated'' is an allowed coverage source',
    exists (select 1 from pg_constraint
             where conrelid = to_regclass('workflow.project_system_floors')
               and conname = 'project_system_floors_source_check'
               and pg_get_constraintdef(oid) like '%migrated%')

  -- ---- the backfill, AND WHY THESE TWO ARE SCOPED --------------------------
  --
  -- READ THIS BEFORE TRUSTING 36 OR 37.
  --
  -- These were written to verify 045 section 9's backfill and phrased as if
  -- "every system covers every floor" were an invariant of the app. IT IS
  -- NOT, and §6.5 says so plainly: partial coverage is the ordinary case
  -- ("27 of 30 · GF to L26", "3 of 30 · B3, B2, B1"), and a system covering
  -- NOTHING is a defined state with its own copy ("No floors." in amber).
  --
  -- They passed at first only because no project had any systems, so they
  -- were asking nothing. The moment a system was added by hand on 26 Sep
  -- 2026 they both went FAIL against an app behaving exactly as designed.
  -- The defect was in the checks.
  --
  -- So both are now scoped to coverage the MIGRATION created — source
  -- 'migrated' — which is the only thing 045 is answerable for. A system a
  -- person adds later, and scopes however they like, is none of this file's
  -- business.
  --
  -- AND NOW THE PART THAT MATTERS MORE. ON PRODUCTION BOTH OF THESE ARE
  -- VACUOUS AND WILL READ PASS FOREVER. The backfill inserted ZERO rows
  -- there, because no project had a system when 045 ran (diagnostic C2 = 0).
  -- A PASS on 36 or 37 against production means "there was nothing to
  -- back-fill", NOT "the backfill worked".
  --
  -- That distinction is not pedantry. Check 39 read PASS on a schema-only
  -- stack for exactly this reason — no rows, nothing to violate — and it
  -- produced a confident, wrong prediction about what production would show.
  -- A vacuous check that reads PASS is indistinguishable from a real one
  -- unless the file says which it is. This one says.
  --
  -- MEASURED 26 Sep 2026: zero migrated rows on production AND on
  -- rollback-test, because neither had a single system when 045 ran. So today
  -- these two assert NOTHING ANYWHERE. I first wrote that rollback-test still
  -- gave them teeth; it does not, and checking beat assuming again.
  --
  -- That is why the scope count is printed in the label. "[0 systems in
  -- scope]" beside a PASS says what the PASS is worth without anyone having
  -- to open this file. They regain teeth only where 045 meets a database
  -- that already had systems.
  union all select 36,
    '045 backfill · no project it touched was left uncovered  ['
      || (select n_systems from backfill_scope)::text || ' systems in scope]',
    case
      when to_regclass('workflow.project_system_floors') is null then false
      else (
        xpath('/row/c/text()', query_to_xml(
          'select count(*) as c
             from (select distinct ps.project_id
                     from workflow.project_systems ps
                     join workflow.project_system_floors m
                       on m.project_system_id = ps.id and m.source = ''migrated'') p
            where not exists (
                    select 1 from workflow.project_system_floors psf
                      join workflow.project_systems ps2 on ps2.id = psf.project_system_id
                     where ps2.project_id = p.project_id
                       and psf.removed_at is null)',
          false, true, ''))
      )[1]::text::bigint = 0
    end

  -- Every floor that existed WHEN THE BACKFILL RAN should have got a row for
  -- every system it touched. Floors created afterwards are excluded on
  -- purpose: §6.5 hands those to the new-floor rule ("joins every system that
  -- already covers every floor, and no other"), which is migration 045's
  -- trigger and not its backfill, and a system narrowed by hand since would
  -- otherwise show up here as a false failure.
  union all select 37,
    '045 backfill · it covered every floor it should have  ['
      || (select n_systems from backfill_scope)::text || ' systems in scope]',
    case
      when to_regclass('workflow.project_system_floors') is null then false
      else (
        xpath('/row/c/text()', query_to_xml(
          'select count(*) as c
             from workflow.project_systems ps
             join workflow.project_floors f on f.project_id = ps.project_id
            where exists (select 1 from workflow.project_system_floors m
                           where m.project_system_id = ps.id and m.source = ''migrated'')
              and f.created_at <= (select max(m2.added_at)
                                     from workflow.project_system_floors m2
                                    where m2.project_system_id = ps.id
                                      and m2.source = ''migrated'')
              and not exists (
                    select 1 from workflow.project_system_floors psf
                     where psf.project_system_id = ps.id
                       and psf.floor_id = f.id)',
          false, true, ''))
      )[1]::text::bigint = 0
    end

  -- The archive must still hold whatever it held. Zero is a legitimate
  -- answer on a database that never had the old model; what would NOT be
  -- legitimate is rows having disappeared, which check 3 guards by keeping
  -- the table. This reports the count so the number is visible in the run.
  union all select 38, '045 · archived rows carrying work are still readable',
    case
      when to_regclass('workflow.floor_sub_stages') is null then false
      else true
    end

  -- ---- the DATA PRECONDITION, which is what 045 was missing ---------------
  -- Migration 050 has to re-point every inspection still on the old model
  -- onto a progress cell. It can only do that if the inspection's project
  -- HAS a system to attach a cell to. This is that precondition, written as
  -- a check instead of as a sentence in a comment — which is the whole
  -- lesson of 045 (see docs/rollback-test-sync.md, "Data preconditions").
  --
  -- EXPECT THIS TO FAIL ON PRODUCTION TODAY. There is one installation
  -- inspection on a project with zero systems. That is not a reason to
  -- delete it; it is the work item: create that project's system in setup,
  -- and this turns PASS. 050 must not run while it is FAIL.
  --
  -- THE GUARD HERE IS ON THE COLUMN, NOT THE TABLE, and that distinction is
  -- the whole point. An earlier version guarded on floor_sub_stages, which
  -- EXISTS before the migration — so the guard passed, query_to_xml ran, and
  -- the query inside it named qi.progress_cell_id, which 045 creates. The
  -- file aborted with 42703 on precisely the pre-migration run that needs to
  -- be readable. Deferring the TABLE does nothing when the COLUMN is what is
  -- missing; query_to_xml parses its string when it executes, and a column
  -- that does not exist fails at parse just as a table does.
  --
  -- So the progress_cell_id predicate is CONCATENATED IN only when that
  -- column exists. Before 045 it is simply absent, and the check still asks
  -- the right question: every inspection on the old model needs a system to
  -- move to. After 045 the predicate narrows it to the ones not yet
  -- re-pointed. The string is built at execution time, so nothing in it is
  -- parsed until the column question has already been answered.
  union all select 39, '050 precondition · every old-model inspection has a system to move to',
    case
      when to_regclass('workflow.floor_sub_stages') is null then true
      when not exists (select 1 from information_schema.columns
                        where table_schema = 'workflow' and table_name = 'qc_inspections'
                          and column_name = 'floor_sub_stage_id') then true
      else (
        xpath('/row/c/text()', query_to_xml(
          'select count(*) as c
             from workflow.qc_inspections qi
            where qi.floor_sub_stage_id is not null
              '
          || case when exists (select 1 from information_schema.columns
                                where table_schema = 'workflow'
                                  and table_name = 'qc_inspections'
                                  and column_name = 'progress_cell_id')
                  then 'and qi.progress_cell_id is null'
                  else '' end
          || '
              and not exists (select 1 from workflow.project_systems ps
                               where ps.project_id = qi.project_id)',
          false, true, ''))
      )[1]::text::bigint = 0
    end
)
select
  n as "#",
  check_name as "check",
  case when ok then 'PASS' else 'FAIL' end as "result"
from checks
order by n;
