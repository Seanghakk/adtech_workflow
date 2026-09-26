select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '048rb · the stage/sub-stage shape check is gone again' as label,
         not exists (select 1 from pg_constraint
                      where conrelid=to_regclass('workflow.progress_cells')
                        and conname='progress_cells_shape_check') as ok
  union all select '048rb · the stage-keyed insert policy is gone',
         not exists (select 1 from pg_policy
                      where polrelid=to_regclass('workflow.progress_cells')
                        and polname='progress_cells_insert')
  union all select '048rb · the stage-keyed update policy is gone',
         not exists (select 1 from pg_policy
                      where polrelid=to_regclass('workflow.progress_cells')
                        and polname='progress_cells_update')
  union all select '048rb · 045''s broad write policy is back',
         exists (select 1 from pg_policy
                  where polrelid=to_regclass('workflow.progress_cells')
                    and polname='progress_cells_write')
  -- This is the loosening, asserted on purpose so the rollback cannot
  -- pretend it left permissions where they were.
  union all select '048rb · and it IS the loose one (superadmin bypass present)',
         exists (select 1 from pg_policy
                  where polrelid=to_regclass('workflow.progress_cells')
                    and polname='progress_cells_write'
                    and coalesce(pg_get_expr(polqual,polrelid),'') ilike '%superadmin%')
  union all select '048rb · it covers ALL commands, as 045 had it',
         exists (select 1 from pg_policy
                  where polrelid=to_regclass('workflow.progress_cells')
                    and polname='progress_cells_write' and polcmd = '*')
) t;
