-- Brief 102 — verification for migration 039.
-- Run against the project the migration was just applied to. Read the
-- VERDICT column; every row must say PASS.
--
-- Checks 5 and 6 are the ones that matter, and they exist because of the
-- standing rule this repo adopted after a superseded copy of migration
-- 037 reached production and passed all fourteen of its own checks: a
-- verification must assert a MARKER UNIQUE TO THE NEW OBJECT, not merely
-- that the object exists. "shop_drawing_items_insert exists" was equally
-- true of the old policy. Check 5 asserts the team clause is present in
-- the new WITH CHECK, and check 6 asserts the PIC clause survived it —
-- because widening a policy by accidentally dropping what it already had
-- would also be a silent, passing failure.

with checks as (
  select 1 as n,
         'shop_drawing_items.created_by exists' as check_name,
         'present' as expected,
         coalesce((select 'present'
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'created_by'), 'MISSING') as actual

  union all
  select 2,
         'created_by is NULLABLE (no backfill, trigger rows keep NULL)',
         'YES',
         coalesce((select is_nullable
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'created_by'), 'MISSING')

  union all
  select 3,
         'created_by references user_profiles',
         'true',
         coalesce((select (pg_get_constraintdef(c.oid) like '%REFERENCES user_profiles(id)%')::text
                   from pg_constraint c
                   where c.conrelid = 'workflow.shop_drawing_items'::regclass
                     and c.contype = 'f'
                     and c.conname = 'shop_drawing_items_created_by_fkey'), 'MISSING')

  union all
  select 4,
         'shop_drawing_items_insert policy exists',
         'present',
         coalesce((select 'present'
                   from pg_policy
                   where polrelid = 'workflow.shop_drawing_items'::regclass
                     and polname = 'shop_drawing_items_insert'), 'MISSING')

  union all
  -- THE MARKER. Only the new policy carries the team clause.
  select 5,
         'INSERT policy carries Brief 102''s shop_drawing/a_and_a clause',
         'true',
         coalesce((select (pg_get_expr(polwithcheck, polrelid) like '%a_and_a%')::text
                   from pg_policy
                   where polrelid = 'workflow.shop_drawing_items'::regclass
                     and polname = 'shop_drawing_items_insert'), 'MISSING')

  union all
  -- WIDENED, NOT REPLACED: the PIC clause must still be there.
  select 6,
         'INSERT policy still carries the PIC clause',
         'true',
         coalesce((select (pg_get_expr(polwithcheck, polrelid) like '%pic_id%')::text
                   from pg_policy
                   where polrelid = 'workflow.shop_drawing_items'::regclass
                     and polname = 'shop_drawing_items_insert'), 'MISSING')

  union all
  select 7,
         'INSERT policy still carries the superadmin clause',
         'true',
         coalesce((select (pg_get_expr(polwithcheck, polrelid) like '%is_superadmin%')::text
                   from pg_policy
                   where polrelid = 'workflow.shop_drawing_items'::regclass
                     and polname = 'shop_drawing_items_insert'), 'MISSING')

  union all
  -- The whole point of matching the BOQ clause: the two read the same.
  select 8,
         'INSERT team clause matches shop_drawing_boq_lines_insert',
         'true',
         coalesce((
           select (
             (select (pg_get_expr(polwithcheck, polrelid) like '%current_team() = ANY (ARRAY[''shop_drawing''::text, ''a_and_a''::text])%')
              from pg_policy
              where polrelid = 'workflow.shop_drawing_items'::regclass
                and polname = 'shop_drawing_items_insert')
             and
             (select (pg_get_expr(polwithcheck, polrelid) like '%current_team() = ANY (ARRAY[''shop_drawing''::text, ''a_and_a''::text])%')
              from pg_policy
              where polrelid = 'workflow.shop_drawing_boq_lines'::regclass
                and polname = 'shop_drawing_boq_lines_insert')
           )::text), 'MISSING')

  union all
  -- Nothing else on this table was touched.
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

  union all
  -- NO BACKFILL. Asserted as "the column has no DEFAULT", which stays
  -- true forever. The obvious check — "no row has created_by set" — is
  -- true only until the first drawing is added through the app, so it
  -- would start failing on a re-run and teach people to ignore this
  -- output.
  select 11,
         'created_by has no DEFAULT (nothing was backfilled)',
         'true',
         coalesce((select (column_default is null)::text
                   from information_schema.columns
                   where table_schema = 'workflow'
                     and table_name = 'shop_drawing_items'
                     and column_name = 'created_by'), 'MISSING')
)
select n,
       check_name,
       expected,
       actual,
       case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks
order by n;
