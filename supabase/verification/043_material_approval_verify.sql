-- =============================================================================
-- 043 — Material approval: VERIFICATION (Brief 105 §3)
-- =============================================================================
--
-- Read-only. Safe to run against production.
--
-- Brief 105 §3: "assert markers, not only existence. Every policy check must
-- prove both that the intended writer is admitted AND that nothing else was
-- loosened. Prove at least one check FAILS against the pre-migration state."
--
-- So every function check greps the function BODY for a marker unique to this
-- migration, not merely that a function of that name exists and is SECURITY
-- DEFINER — the standing rule since a superseded copy of migration 037 reached
-- production and passed all fourteen of its own checks.
--
-- Expected AFTER the migration: 28 rows all PASS, then check 29 PASS, then a
-- summary reading "new tables 6 | policies 10".
--
-- Expected BEFORE it: 26 of the 28 FAIL, then an ERROR on check 29's missing
-- column. Checks 24 and 26 pass beforehand because they are NEGATIVE checks
-- and pass vacuously when nothing exists — they mean something only after the
-- migration, paired with 23 and 25.
-- =============================================================================

\pset format aligned
\pset border 2

with checks as (

  -- ---- 1. The five tables exist -------------------------------------------
  select 1 as n, 'packages table exists' as check_name,
    (to_regclass('workflow.material_approval_packages') is not null) as ok
  union all select 2, 'package_lines table exists',
    (to_regclass('workflow.material_approval_package_lines') is not null)
  union all select 3, 'revisions table exists',
    (to_regclass('workflow.material_approval_revisions') is not null)
  union all select 4, 'submissions table exists',
    (to_regclass('workflow.material_approval_submissions') is not null)
  union all select 5, 'documents table exists',
    (to_regclass('workflow.material_approval_documents') is not null)
  union all select 6, 'ref counter table exists',
    (to_regclass('workflow.material_approval_ref_counters') is not null)

  -- ---- 2. The constraints that carry a design rule -------------------------
  -- A line in at most one package: 17a item 10 says a constraint, not an
  -- application check.
  union all select 7, 'a contract BOQ line sits in at most ONE package (unique)',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.material_approval_package_lines')
         and contype = 'u'
         and pg_get_constraintdef(oid) ilike '%contract_boq_line_id%'
    )

  -- MA-nn unique per project.
  union all select 8, 'MA-nn is unique per project',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.material_approval_packages')
         and contype = 'u'
         and pg_get_constraintdef(oid) ilike '%project_id%'
         and pg_get_constraintdef(oid) ilike '%ref%'
    )

  -- §5.3 — a paper approval can never acquire a start.
  union all select 9, 'a paper package can never have preparing_started_at',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.material_approval_packages')
         and conname = 'material_approval_packages_paper_has_no_start_check'
    )

  -- §5.3 — a paper approval is A or B, never C, and carries its return.
  union all select 10, 'a paper submission must already be returned A or B',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.material_approval_submissions')
         and conname = 'material_approval_submissions_paper_shape_check'
         and pg_get_constraintdef(oid) like '%''A''%'
         and pg_get_constraintdef(oid) like '%''B''%'
    )

  -- The return pair is filled together, exactly once.
  union all select 11, 'returned_on and code are filled in together or not at all',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.material_approval_submissions')
         and conname = 'material_approval_submissions_return_shape_check'
    )

  -- The §9 party enum, reused rather than re-declared.
  union all select 12, 'party reuses the four §9 values',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.material_approval_submissions')
         and conname = 'material_approval_submissions_party_check'
         and pg_get_constraintdef(oid) like '%main_contractor%'
    )

  -- ---- 3. Function bodies, by MARKER not by existence ----------------------
  union all select 13, 'next_material_approval_ref carries its 043 marker',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'next_material_approval_ref'
         and pg_get_functiondef(p.oid) like '%043 marker: next_material_approval_ref / MA-nn never reused%'
    )
  union all select 14, 'next_material_approval_ref is SECURITY DEFINER',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'next_material_approval_ref'
         and p.prosecdef
    )
  union all select 15, 'the counter is only ever ADVANCED, never reset',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'next_material_approval_ref'
         and pg_get_functiondef(p.oid) like '%next_seq + 1%'
         and pg_get_functiondef(p.oid) not like '%next_seq = 1%'
    )

  union all select 16, 'submission immutability trigger carries its 043 marker',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'material_approval_submissions_before_update'
         and pg_get_functiondef(p.oid) like '%043 marker: material approval submission immutable except the return%'
    )
  union all select 17, 'a returned submission is closed to any further UPDATE',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'material_approval_submissions_before_update'
         and pg_get_functiondef(p.oid) like '%already been returned and is closed%'
    )
  union all select 18, 'sent_on and party are fixed once sent',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'material_approval_submissions_before_update'
         and pg_get_functiondef(p.oid) like '%new.sent_on is distinct from old.sent_on%'
         and pg_get_functiondef(p.oid) like '%new.party is distinct from old.party%'
    )

  union all select 19, 'preparing_started_at trigger carries its 043 marker',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'material_approval_revision_started'
         and pg_get_functiondef(p.oid) like '%043 marker: preparing_started_at written once, never backfilled%'
    )
  union all select 20, 'preparing_started_at is coalesced — a later revision cannot move it',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'material_approval_revision_started'
         and pg_get_functiondef(p.oid) like '%coalesce(p.preparing_started_at%'
         and pg_get_functiondef(p.oid) like '%source <> ''paper''%'
    )

  union all select 21, 'the outside-BOQ reason rule carries its 043 marker',
    exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'workflow' and p.proname = 'material_approval_package_reason_required'
         and pg_get_functiondef(p.oid) like '%043 marker: a package with no contract line must say why%'
    )

  -- ---- 4. RLS: the intended writer is admitted ----------------------------
  union all select 22, 'RLS is enabled on all six new tables',
    (select count(*) = 6 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'workflow' and c.relrowsecurity
        and c.relname in ('material_approval_packages','material_approval_package_lines',
                          'material_approval_revisions','material_approval_submissions',
                          'material_approval_documents','material_approval_ref_counters'))

  union all select 23, 'QC and the PIC may write packages',
    exists (
      select 1 from pg_policy
       where polrelid = to_regclass('workflow.material_approval_packages')
         and polname = 'material_approval_packages_write'
         and pg_get_expr(polqual, polrelid) like '%''qc''%'
         and pg_get_expr(polqual, polrelid) like '%pic_id%'
    )

  -- ---- 5. RLS: and NOTHING ELSE was loosened ------------------------------
  -- Procurement must NOT be able to write a package. §23.6 gives it documents
  -- only; this is the check that would catch that widening.
  union all select 24, 'Procurement may NOT write packages (nothing loosened)',
    not exists (
      select 1 from pg_policy
       where polrelid = to_regclass('workflow.material_approval_packages')
         and polname = 'material_approval_packages_write'
         and pg_get_expr(polqual, polrelid) ilike '%procurement%'
    )

  union all select 25, 'Procurement MAY write documents, and only documents',
    exists (
      select 1 from pg_policy
       where polrelid = to_regclass('workflow.material_approval_documents')
         and polname = 'material_approval_documents_write'
         and pg_get_expr(polqual, polrelid) like '%procurement_local%'
         and pg_get_expr(polqual, polrelid) like '%procurement_overseas%'
    )

  -- The counter must have RLS on and NO permissive policy at all.
  union all select 26, 'the ref counter admits nobody directly (no policy)',
    (select count(*) = 0 from pg_policy
      where polrelid = to_regclass('workflow.material_approval_ref_counters'))

  -- ---- 6. The links out, nullable and unbackfilled -------------------------
  union all select 27, 'qc_inspections.approval_package_id exists and is nullable',
    exists (
      select 1 from information_schema.columns
       where table_schema = 'workflow' and table_name = 'qc_inspections'
         and column_name = 'approval_package_id' and is_nullable = 'YES'
    )
  union all select 28, 'procurement_lines carries the override record, all nullable',
    (select count(*) = 5 from information_schema.columns
      where table_schema = 'workflow' and table_name = 'procurement_lines'
        and is_nullable = 'YES'
        and column_name in ('raised_before_approval','override_accepted_by','override_accepted_at',
                            'override_package_id','override_revision_id'))
)
select
  n as "#",
  check_name as "check",
  case when ok then 'PASS' else 'FAIL' end as "result"
from checks
order by n;

-- Check 29 is deliberately its own statement. It reads a COLUMN this migration
-- adds, so against the pre-migration state it errors instead of returning a
-- row — which is the point: run this file BEFORE applying and checks 1–28
-- print FAIL, then this line errors on the missing column. A verification that
-- passes against a database the migration never touched is worth nothing, and
-- migration 037 is why that sentence is in the brief.
select
  29 as "#",
  'nothing was backfilled — no inspection names a package yet' as "check",
  case when count(*) = 0 then 'PASS' else 'FAIL' end as "result"
from workflow.qc_inspections
where approval_package_id is not null;

-- Summary line, so a truncated paste still shows the verdict.
with checks as (select 1)
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='workflow' and c.relkind = 'r'
      and c.relname like 'material_approval%') as "new tables",
  (select count(*) from pg_policy where polrelid in (
      to_regclass('workflow.material_approval_packages'),
      to_regclass('workflow.material_approval_package_lines'),
      to_regclass('workflow.material_approval_revisions'),
      to_regclass('workflow.material_approval_submissions'),
      to_regclass('workflow.material_approval_documents'))) as "policies";
