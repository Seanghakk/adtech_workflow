-- Migration 041 — verification. Every row must read PASS.
--
-- Checks 1-3 are shape. Check 4 is the MARKER that matters: the FK must
-- reference BOTH columns, because a constraint named
-- "..._system_same_project_fkey" that only referenced system_id would
-- pass a mere existence check while enforcing nothing new.

with checks as (
  select 1 as n,
         'project_systems has the (project_id, id) unique key' as check_name,
         'true' as expected,
         coalesce((select (pg_get_constraintdef(oid) like 'UNIQUE (project_id, id)%')::text
                   from pg_constraint
                   where conrelid = 'workflow.project_systems'::regclass
                     and conname = 'project_systems_project_id_key'), 'MISSING') as actual

  union all
  select 2,
         'the composite FK exists on shop_drawing_items',
         'present',
         coalesce((select 'present'
                   from pg_constraint
                   where conrelid = 'workflow.shop_drawing_items'::regclass
                     and conname = 'shop_drawing_items_system_same_project_fkey'), 'MISSING')

  union all
  select 3,
         'it references workflow.project_systems',
         'true',
         coalesce((select (pg_get_constraintdef(oid) like '%REFERENCES workflow.project_systems%')::text
                   from pg_constraint
                   where conrelid = 'workflow.shop_drawing_items'::regclass
                     and conname = 'shop_drawing_items_system_same_project_fkey'), 'MISSING')

  union all
  -- THE MARKER: both columns on both sides.
  select 4,
         'it constrains (project_id, system_id) -> (project_id, id)',
         'true',
         coalesce((select (pg_get_constraintdef(oid)
                     like 'FOREIGN KEY (project_id, system_id) REFERENCES workflow.project_systems(project_id, id)%')::text
                   from pg_constraint
                   where conrelid = 'workflow.shop_drawing_items'::regclass
                     and conname = 'shop_drawing_items_system_same_project_fkey'), 'MISSING')

  union all
  -- 040 must survive: its single-column FK is deliberately kept, and its
  -- own verification asserts this exact constraint.
  select 5,
         '040 still in place: the single-column system_id FK',
         'true',
         coalesce((select (pg_get_constraintdef(oid) like '%ON DELETE RESTRICT%')::text
                   from pg_constraint
                   where conrelid = 'workflow.shop_drawing_items'::regclass
                     and conname = 'shop_drawing_items_system_id_fkey'), 'MISSING')

  union all
  select 6,
         'system_id is still NULLABLE (a drawing may have no system)',
         'YES',
         coalesce((select is_nullable
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'system_id'), 'MISSING')

  union all
  -- Nothing was rejected or rewritten by applying this.
  select 7,
         'no drawing points at another project''s system',
         '0',
         coalesce((select count(*)::text
                   from workflow.shop_drawing_items i
                   join workflow.project_systems s on s.id = i.system_id
                   where s.project_id <> i.project_id), 'MISSING')
)
select n, check_name, expected, actual,
       case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks
order by n;
