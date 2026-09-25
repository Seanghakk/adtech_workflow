-- Brief 104 — verification for migration 042. Every row must read PASS.
--
-- Checks 2, 4, 6 and 9 are the MARKERS. "the policy exists" and "the
-- function exists" were both equally true before this migration, so an
-- existence check proves nothing — the standing rule this repo adopted
-- after a superseded copy of migration 037 reached production and passed
-- all fourteen of its own checks.
--
-- Checks 3, 5 and 7 are the other half of "widened, never replaced":
-- superadmin must still be there. A migration that swapped one clause
-- for the other would satisfy the markers alone.

with checks as (
  select 1 as n,
         'the Tender team exists as code ''tender''' as check_name,
         'present' as expected,
         coalesce((select 'present' from workflow.teams where code = 'tender'), 'MISSING') as actual

  union all
  select 2, 'INSERT policy carries the tender team clause', 'true',
         coalesce((select (pg_get_expr(polwithcheck, polrelid) like '%''tender''%')::text
                   from pg_policy where polrelid = 'workflow.tender_boq_lines'::regclass
                     and polname = 'tender_boq_lines_insert'), 'MISSING')
  union all
  select 3, 'INSERT policy still carries superadmin', 'true',
         coalesce((select (pg_get_expr(polwithcheck, polrelid) like '%is_superadmin%')::text
                   from pg_policy where polrelid = 'workflow.tender_boq_lines'::regclass
                     and polname = 'tender_boq_lines_insert'), 'MISSING')

  union all
  select 4, 'UPDATE policy carries the tender team clause (USING and CHECK)', 'true',
         coalesce((select (pg_get_expr(polqual, polrelid) like '%''tender''%'
                       and pg_get_expr(polwithcheck, polrelid) like '%''tender''%')::text
                   from pg_policy where polrelid = 'workflow.tender_boq_lines'::regclass
                     and polname = 'tender_boq_lines_update'), 'MISSING')
  union all
  select 5, 'UPDATE policy still carries superadmin', 'true',
         coalesce((select (pg_get_expr(polqual, polrelid) like '%is_superadmin%')::text
                   from pg_policy where polrelid = 'workflow.tender_boq_lines'::regclass
                     and polname = 'tender_boq_lines_update'), 'MISSING')

  union all
  select 6, 'DELETE policy carries the tender team clause', 'true',
         coalesce((select (pg_get_expr(polqual, polrelid) like '%''tender''%')::text
                   from pg_policy where polrelid = 'workflow.tender_boq_lines'::regclass
                     and polname = 'tender_boq_lines_delete'), 'MISSING')
  union all
  select 7, 'DELETE policy still carries superadmin', 'true',
         coalesce((select (pg_get_expr(polqual, polrelid) like '%is_superadmin%')::text
                   from pg_policy where polrelid = 'workflow.tender_boq_lines'::regclass
                     and polname = 'tender_boq_lines_delete'), 'MISSING')

  union all
  -- SELECT must be UNTOUCHED: still member + can_view_project, and it
  -- must NOT have gained a team clause.
  select 8, 'SELECT policy unchanged (no team clause added)', 'true',
         coalesce((select (pg_get_expr(polqual, polrelid) like '%can_view_project%'
                       and pg_get_expr(polqual, polrelid) not like '%''tender''%')::text
                   from pg_policy where polrelid = 'workflow.tender_boq_lines'::regclass
                     and polname = 'tender_boq_lines_select'), 'MISSING')

  union all
  -- THE FUNCTION MARKER. Widening the policies without this leaves the
  -- import refusing a Tender member.
  select 9, 'commit_boq_import''s tender branch admits the Tender team', 'true',
         coalesce((select (prosrc like '%when ''tender''       then v_superadmin or v_team in (''tender'')%')::text
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')
  union all
  select 10, 'its refusal message names the Tender team, not a superadmin', 'true',
         coalesce((select (prosrc like '%Only the Tender team may import the tender BOQ.%')::text
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')
  union all
  -- The other two tiers must be exactly as Brief 099 left them.
  select 11, 'contract and shop_drawing branches untouched', 'true',
         coalesce((select (prosrc like '%when ''contract''     then v_superadmin or v_is_pic%'
                       and prosrc like '%when ''shop_drawing'' then v_superadmin or v_team in (''shop_drawing'', ''a_and_a'')%')::text
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')
  union all
  select 12, 'commit_boq_import is still SECURITY DEFINER', 'true',
         coalesce((select prosecdef::text
                   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'workflow' and p.proname = 'commit_boq_import'), 'MISSING')
  union all
  select 13, 'tender_boq_lines still has exactly 4 policies', '4',
         coalesce((select count(*)::text from pg_policy
                   where polrelid = 'workflow.tender_boq_lines'::regclass), 'MISSING')
)
select n, check_name, expected, actual,
       case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks order by n;
