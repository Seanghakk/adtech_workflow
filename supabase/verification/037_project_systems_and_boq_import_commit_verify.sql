-- =============================================================================
-- ADTECH Workflow Tracker — Verification for Migration 037
-- Brief: ADTECH_WF_Brief_098_BOQ_Import_Preview_And_Project_Systems §2, §4
--
-- One row per check, expected vs actual, PASS/FAIL — this repo's own
-- Brief 088 style. Run AFTER applying migration 037 (as amended by
-- Brief 099). All 16 rows must PASS.
-- =============================================================================

with checks as (

  select 1 as n, 'workflow.project_systems table exists' as check_name,
    'present' as expected,
    case when to_regclass('workflow.project_systems') is not null
         then 'present' else 'MISSING' end as actual

  union all
  select 2, 'project_systems has RLS enabled',
    'true',
    coalesce((select relrowsecurity::text from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'workflow' and c.relname = 'project_systems'), 'MISSING')

  union all
  select 3, 'project_systems has exactly 4 policies (select/insert/update/delete)',
    '4',
    (select count(*)::text from pg_policies
     where schemaname = 'workflow' and tablename = 'project_systems')

  union all
  select 4, 'system name is unique within a project',
    'present',
    case when exists (
      select 1 from pg_indexes
      where schemaname = 'workflow'
        and indexname = 'project_systems_name_per_project_key'
    ) then 'present' else 'MISSING' end

  union all
  select 5, 'project_systems.cad_code references workflow.cad_systems',
    'present',
    case when exists (
      select 1 from pg_constraint c
      where c.conrelid = 'workflow.project_systems'::regclass
        and c.contype = 'f'
        and c.confrelid = 'workflow.cad_systems'::regclass
    ) then 'present' else 'MISSING' end

  union all
  select 6, 'project_systems.source is constrained to imported/manual',
    'present',
    case when exists (
      select 1 from pg_constraint c
      where c.conrelid = 'workflow.project_systems'::regclass
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) like '%imported%'
        and pg_get_constraintdef(c.oid) like '%manual%'
    ) then 'present' else 'MISSING' end

  union all
  select 7, 'project_systems.cad_code is NULLABLE ("no code yet" is a real state)',
    'YES',
    coalesce((select is_nullable from information_schema.columns
      where table_schema = 'workflow' and table_name = 'project_systems'
        and column_name = 'cad_code'), 'MISSING')

  union all
  select 8, 'authenticated holds all four table grants on project_systems',
    '4',
    (select count(distinct privilege_type)::text
     from information_schema.role_table_grants
     where table_schema = 'workflow' and table_name = 'project_systems'
       and grantee = 'authenticated'
       and privilege_type in ('SELECT','INSERT','UPDATE','DELETE'))

  union all
  select 9, 'workflow.commit_boq_import(uuid,text,jsonb,jsonb,jsonb) exists',
    'present',
    case when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'workflow' and p.proname = 'commit_boq_import'
    ) then 'present' else 'MISSING' end

  union all
  select 10, 'commit_boq_import is SECURITY DEFINER',
    'true',
    coalesce((select prosecdef::text from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')

  union all
  -- The three stable-key indexes migration 034 added are what makes
  -- "re-import updates, does not duplicate" possible. Re-checked here
  -- because migration 037's function depends on all three.
  select 11, 'all three tiers still carry their per-project item_number index',
    '3',
    (select count(*)::text from pg_indexes
     where schemaname = 'workflow'
       and indexname in (
         'contract_boq_lines_item_number_per_project_key',
         'tender_boq_lines_item_number_per_project_key',
         'shop_drawing_boq_lines_item_number_per_project_key'))

  union all
  -- Migration 037 must NOT have loosened the tier tables' own policies.
  -- The PIC reaches them only through the SECURITY DEFINER function.
  select 12, 'tender_boq_lines INSERT policy is still superadmin-only',
    'true',
    coalesce((select (with_check = 'workflow.is_superadmin()')::text
      from pg_policies
      where schemaname = 'workflow' and tablename = 'tender_boq_lines'
        and cmd = 'INSERT'), 'MISSING')

  union all
  -- Brief 099 §1 — the import now follows each tier's OWNER. These two
  -- assert the other half of "do not loosen any table policy": the
  -- contract tier is still the PIC's, and the shop drawing tier is still
  -- Shop Drawing's and A&A's. Together with check 12 that covers all
  -- three tables the commit function writes.
  select 13, 'contract_boq_lines INSERT policy still names pic_id',
    'true',
    coalesce((select (with_check like '%pic_id%')::text
      from pg_policies
      where schemaname = 'workflow' and tablename = 'contract_boq_lines'
        and cmd = 'INSERT'), 'MISSING')

  union all
  select 14, 'shop_drawing_boq_lines INSERT policy still names the two teams',
    'true',
    coalesce((select (with_check like '%shop_drawing%' and with_check like '%a_and_a%')::text
      from pg_policies
      where schemaname = 'workflow' and tablename = 'shop_drawing_boq_lines'
        and cmd = 'INSERT'), 'MISSING')

  union all
  -- Checks 9 and 10 say the function EXISTS and is SECURITY DEFINER. Both
  -- were equally true of the superseded Brief 098 body, which is how the
  -- wrong version sat on production unnoticed through a merge: 14/14 PASS
  -- against a function carrying the wrong permission rule. A migration
  -- that REPLACES a function body has to assert something only the new
  -- body contains. v_may_write_tier is Brief 099's own per-tier case
  -- expression and appears nowhere in the Brief 098 version.
  select 15, 'commit_boq_import carries Brief 099''s per-tier rule, not Brief 098''s',
    'true',
    coalesce((select (prosrc like '%v_may_write_tier%')::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')

  union all
  select 16, 'commit_boq_import gates floors/systems separately (Brief 099 §2)',
    'true',
    coalesce((select (prosrc like '%v_may_create_setup%')::text
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')

)
select n, check_name, expected, actual,
  case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks
order by n;

-- Behaviour that cannot be expressed as a static schema check was proven
-- separately against rollback-test, every scenario inside a transaction that
-- ended in ROLLBACK — see this brief's Result doc §1 for the full transcript:
--   * PIC commits a first import: floors, systems and lines all actually
--     written, floor quantities resolved to real floor rows
--   * re-import of the same file updates in place, line count unchanged
--   * re-import of an edited file updates changed lines, inserts new ones,
--     and leaves lines missing from the file in place (never deleted)
--   * a line with no item number raises, and writes nothing
--   * an unknown tier raises
--   * the import follows each tier's OWNER (Brief 099): the PIC commits
--     contract and is refused shop drawing and tender; a Shop Drawing or
--     A&A member commits shop drawing and is refused contract and tender;
--     a superadmin commits all three
--   * creating floors/systems stays with the PIC even for an importer who
--     may legitimately write that tier — the lines still import
--   * direct writes to all three tables behave exactly as they did before
--     migration 037 existed (checks 12-14 above)
--   * a non-PIC is refused by project_systems' RLS
