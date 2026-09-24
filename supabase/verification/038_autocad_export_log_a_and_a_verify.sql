-- =============================================================================
-- ADTECH Workflow Tracker — Verification for Migration 038
-- Brief: ADTECH_WF_Brief_100 Part A, amended 24 Sep 2026
--
-- One row per check, expected vs actual, PASS/FAIL — this repo's own
-- Brief 088 style. Run AFTER applying migration 038. All 6 rows must PASS.
-- =============================================================================

with checks as (

  select 1 as n, 'autocad_export_log INSERT policy now includes a_and_a' as check_name,
    'true' as expected,
    coalesce((select (with_check like '%a_and_a%')::text from pg_policies
      where schemaname = 'workflow' and tablename = 'autocad_export_log'
        and cmd = 'INSERT'), 'MISSING') as actual

  union all
  select 2, 'autocad_export_log SELECT policy now includes a_and_a',
    'true',
    coalesce((select (qual like '%a_and_a%')::text from pg_policies
      where schemaname = 'workflow' and tablename = 'autocad_export_log'
        and cmd = 'SELECT'), 'MISSING')

  union all
  -- Widened, not replaced: the two who could already export still can.
  select 3, 'INSERT policy still names shop_drawing and the PIC',
    'true',
    coalesce((select (with_check like '%shop_drawing%' and with_check like '%pic_id%')::text
      from pg_policies
      where schemaname = 'workflow' and tablename = 'autocad_export_log'
        and cmd = 'INSERT'), 'MISSING')

  union all
  select 4, 'SELECT policy still names shop_drawing and the PIC',
    'true',
    coalesce((select (qual like '%shop_drawing%' and qual like '%pic_id%')::text
      from pg_policies
      where schemaname = 'workflow' and tablename = 'autocad_export_log'
        and cmd = 'SELECT'), 'MISSING')

  union all
  -- The log stays append-only: adding UPDATE or DELETE would mean an export
  -- could be unhappened, and "changed since" reads the log as history.
  select 5, 'autocad_export_log is still append-only (exactly 2 policies)',
    '2',
    (select count(*)::text from pg_policies
     where schemaname = 'workflow' and tablename = 'autocad_export_log')

  union all
  -- Migration 038 must not have touched the shop drawing BOQ's own rule;
  -- the two team lists are meant to match, not to drift together by accident.
  select 6, 'shop_drawing_boq_lines INSERT policy is unchanged',
    'true',
    coalesce((select (with_check like '%shop_drawing%' and with_check like '%a_and_a%')::text
      from pg_policies
      where schemaname = 'workflow' and tablename = 'shop_drawing_boq_lines'
        and cmd = 'INSERT'), 'MISSING')

)
select n, check_name, expected, actual,
  case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks
order by n;

-- Behaviour proven separately against rollback-test, inside a transaction
-- that ended in ROLLBACK — see the Brief 100 Result doc, Part A:
--   * an A&A member can now insert an export log row, and could not before
--   * the PIC and a Shop Drawing member still can
--   * a member of an unrelated team still cannot
