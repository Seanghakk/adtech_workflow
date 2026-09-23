-- =============================================================================
-- ADTECH Workflow Tracker — Verification for Migration 036
-- Brief: ADTECH_WF_Brief_097_Build_Project_Setup_Page §3
--
-- One row per check, expected vs actual, PASS/FAIL — this repo's own
-- Brief 088 style. Run AFTER applying migration 036. Every row below
-- must read PASS.
-- =============================================================================

with checks as (

  select 1 as n, 'workflow.set_project_cad_identity(uuid, text, text, text) exists' as check_name,
    'present' as expected,
    case when exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'workflow' and p.proname = 'set_project_cad_identity'
    ) then 'present' else 'MISSING' end as actual

  union all
  select 2, 'the function is SECURITY DEFINER',
    'true',
    coalesce((select prosecdef::text from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'workflow' and p.proname = 'set_project_cad_identity'), 'MISSING')

)
select n, check_name, expected, actual,
  case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks
order by n;

-- The real behaviour (PIC succeeds, a non-PIC is refused with an
-- explicit exception, an invalid numbering-mode value is refused with
-- an explicit exception) cannot be expressed as a static schema check —
-- see this brief's own Result doc §3 for the live proof already run
-- against rollback-test (role switches proven via auth.uid()/
-- workflow.is_manager(), every scenario wrapped in a transaction that
-- ended in ROLLBACK, nothing committed there either).
