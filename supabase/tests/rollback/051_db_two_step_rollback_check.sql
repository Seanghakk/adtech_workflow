-- 051 rollback check: access is exactly as before 051.
select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '051rb · no two_step_when_enrolled policy remains in workflow' as label,
         not exists (select 1 from pg_policies where schemaname = 'workflow' and policyname = 'two_step_when_enrolled') as ok
  union all select '051rb · workflow.mfa_satisfied() is gone', to_regprocedure('workflow.mfa_satisfied()') is null
  union all select '051rb · no workflow function still carries the guard',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'workflow' and p.prosrc like '%mfa_satisfied%')
  union all select '051rb · next_material_approval_ref is back to its pre-051 body (no member check)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'workflow' and p.proname = 'next_material_approval_ref'
                    and p.prosrc not like '%Only a signed-in member%')
  union all select '051rb · the five D5 functions are callable by anon again (pre-051 state)',
         (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'workflow'
             and p.proname in ('compute_project_rollup_percent','project_effective_start_date','recalculate_project_rollup','seed_progress_cells','next_material_approval_ref')
             and has_function_privilege('anon', p.oid, 'EXECUTE')) = 5
  union all select '051rb · 050''s seeder rights are untouched (still SECURITY DEFINER)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'workflow' and p.proname = 'seed_progress_cells' and p.prosecdef)
) t
order by ok, label;
