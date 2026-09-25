-- =============================================================================
-- 044 — VERIFICATION. Read-only; safe against production.
-- Expected: 6 rows, all PASS. Run it BEFORE the migration too — checks 1–5
-- must FAIL there, or the file is proving nothing.
-- =============================================================================

\pset format aligned
\pset border 2

with checks as (
  select 1 as n, 'contract_boq_line_id exists on procurement_lines' as check_name,
    exists (
      select 1 from information_schema.columns
       where table_schema = 'workflow' and table_name = 'procurement_lines'
         and column_name = 'contract_boq_line_id'
    ) as ok

  union all select 2, 'it is NULLABLE with no default (nothing forced, nothing backfilled)',
    exists (
      select 1 from information_schema.columns
       where table_schema = 'workflow' and table_name = 'procurement_lines'
         and column_name = 'contract_boq_line_id'
         and is_nullable = 'YES' and column_default is null
    )

  union all select 3, 'it references contract_boq_lines',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.procurement_lines')
         and contype = 'f'
         and confrelid = to_regclass('workflow.contract_boq_lines')
    )

  -- Deleting a BOQ line must never delete a purchase order raised against it.
  union all select 4, 'ON DELETE SET NULL, never CASCADE',
    exists (
      select 1 from pg_constraint
       where conrelid = to_regclass('workflow.procurement_lines')
         and contype = 'f'
         and confrelid = to_regclass('workflow.contract_boq_lines')
         and confdeltype = 'n'
    )

  union all select 5, 'the lookup index exists',
    exists (
      select 1 from pg_indexes
       where schemaname = 'workflow'
         and indexname = 'procurement_lines_contract_boq_line_idx'
    )
)
select n as "#", check_name as "check",
       case when ok then 'PASS' else 'FAIL' end as "result"
from checks order by n;

-- Separate statement: it reads the column this migration adds, so against the
-- pre-migration state it errors rather than returning a row. That is the
-- point — a verification that passes on a database the migration never
-- touched is worth nothing.
select
  6 as "#",
  'nothing was backfilled — no procurement line names a BOQ line yet' as "check",
  case when count(*) = 0 then 'PASS'
       else 'REVIEW — ' || count(*)::text || ' row(s) already linked' end as "result"
from workflow.procurement_lines
where contract_boq_line_id is not null;
