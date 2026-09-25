-- Brief 102 follow-up — verification for migration 040.
-- Run against the project the migration was just applied to. Every row
-- must read PASS.

with checks as (
  select 1 as n,
         'shop_drawing_items.system_id exists' as check_name,
         'present' as expected,
         coalesce((select 'present'
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'system_id'), 'MISSING') as actual

  union all
  select 2,
         'system_id is NULLABLE (no backfill)',
         'YES',
         coalesce((select is_nullable
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'system_id'), 'MISSING')

  union all
  select 3,
         'system_id has no DEFAULT (nothing was guessed)',
         'true',
         coalesce((select (column_default is null)::text
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'system_id'), 'MISSING')

  union all
  -- THE MARKER: it must point at project_systems, not at anything else.
  -- "a column called system_id exists" would be equally true of a column
  -- referencing the wrong table, or referencing nothing at all.
  select 4,
         'system_id references workflow.project_systems',
         'true',
         coalesce((select (pg_get_constraintdef(c.oid)
                             like '%REFERENCES workflow.project_systems(id)%')::text
                   from pg_constraint c
                   where c.conrelid = 'workflow.shop_drawing_items'::regclass
                     and c.contype = 'f'
                     and c.conname = 'shop_drawing_items_system_id_fkey'), 'MISSING')

  union all
  select 5,
         'system_id FK is ON DELETE RESTRICT',
         'true',
         coalesce((select (pg_get_constraintdef(c.oid) like '%ON DELETE RESTRICT%')::text
                   from pg_constraint c
                   where c.conrelid = 'workflow.shop_drawing_items'::regclass
                     and c.contype = 'f'
                     and c.conname = 'shop_drawing_items_system_id_fkey'), 'MISSING')

  union all
  select 6,
         'the project_id + system_id index exists',
         'present',
         coalesce((select 'present'
                   from pg_indexes
                   where schemaname = 'workflow'
                     and tablename = 'shop_drawing_items'
                     and indexname = 'shop_drawing_items_system_id_idx'), 'MISSING')

  union all
  -- Migration 039's two changes must still be intact. Running 040 does
  -- not touch them, and if either is missing then 039 was never applied
  -- and this table is in a state nobody intended.
  select 7,
         '039 still in place: created_by exists',
         'present',
         coalesce((select 'present'
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'created_by'), 'MISSING')

  union all
  select 8,
         '039 still in place: INSERT policy carries the team clause',
         'true',
         coalesce((select (pg_get_expr(polwithcheck, polrelid) like '%a_and_a%')::text
                   from pg_policy
                   where polrelid = 'workflow.shop_drawing_items'::regclass
                     and polname = 'shop_drawing_items_insert'), 'MISSING')

  union all
  select 9,
         'RLS still enabled on shop_drawing_items',
         'true',
         coalesce((select relrowsecurity::text
                   from pg_class
                   where oid = 'workflow.shop_drawing_items'::regclass), 'MISSING')

  union all
  select 10,
         'shop_drawing_items still has exactly 4 policies',
         '4',
         coalesce((select count(*)::text
                   from pg_policy
                   where polrelid = 'workflow.shop_drawing_items'::regclass), 'MISSING')
)
select n,
       check_name,
       expected,
       actual,
       case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks
order by n;
