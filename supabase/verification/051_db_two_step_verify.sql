-- =============================================================================
-- 051 — CATALOGUE verification. Safe on PRODUCTION: reads only.
-- =============================================================================
-- Paste after applying 051. Every row should say PASS.
-- Before 051 it prints FAILs (it never aborts: objects 051 creates are looked
-- up with to_regprocedure / pg_policies, never named directly).
-- =============================================================================
select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '051 · workflow.mfa_satisfied() exists' as label,
         to_regprocedure('workflow.mfa_satisfied()') is not null as ok
  union all select '051 · every workflow table has two_step_when_enrolled (restrictive, authenticated, ALL)',
         not exists (
           select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'workflow' and c.relkind in ('r', 'p')
              and not exists (select 1 from pg_policies p
                               where p.schemaname = 'workflow' and p.tablename = c.relname
                                 and p.policyname = 'two_step_when_enrolled' and p.permissive = 'RESTRICTIVE'
                                 and p.roles = '{authenticated}' and p.cmd = 'ALL'))
  union all select '051 · the 8 app functions carry the two-step guard',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'workflow'
             and p.proname in ('assign_project_pic','commit_boq_import','get_user_profiles','list_unlinked_accounts',
                               'record_shop_drawing_check','set_project_cad_identity','set_project_dates','next_material_approval_ref')
             and p.prosrc like '%workflow.mfa_satisfied()%') = 8
  union all select '051 · D5: anon cannot call any of the five',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'workflow'
                        and p.proname in ('compute_project_rollup_percent','project_effective_start_date','recalculate_project_rollup','seed_progress_cells','next_material_approval_ref')
                        and has_function_privilege('anon', p.oid, 'EXECUTE'))
  union all select '051 · D5: a signed-in user cannot call the four internal ones',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'workflow'
                        and p.proname in ('compute_project_rollup_percent','project_effective_start_date','recalculate_project_rollup','seed_progress_cells')
                        and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  union all select '051 · D5: a signed-in user can still call next_material_approval_ref',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'workflow' and p.proname = 'next_material_approval_ref'
                    and has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  union all select '051 · anon cannot call mfa_satisfied()',
         coalesce((select not has_function_privilege('anon', p.oid, 'EXECUTE') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'workflow' and p.proname = 'mfa_satisfied'), false)
) t
order by ok, label;
