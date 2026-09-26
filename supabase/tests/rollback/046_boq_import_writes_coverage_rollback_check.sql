select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '046rb · commit_boq_import still exists' as label,
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='commit_boq_import') as ok
  union all select '046rb · the coverage pass is gone (no 046 marker)',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.proname='commit_boq_import'
                        and pg_get_functiondef(p.oid) like '%046 marker%')
  union all select '046rb · it no longer writes project_system_floors',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.proname='commit_boq_import'
                        and pg_get_functiondef(p.oid) like '%project_system_floors%')
  union all select '046rb · its result no longer carries coverageAdded',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.proname='commit_boq_import'
                        and pg_get_functiondef(p.oid) like '%coverageAdded%')
  -- THE ONE THAT MATTERS. The body restored is 042's, not 037's. If this
  -- fails, the rollback reverted a migration that was not its own and the
  -- Tender team silently lost the ability to import the tender BOQ.
  union all select '046rb · migration 042 SURVIVED (tender team can still import)',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='commit_boq_import'
                    and pg_get_functiondef(p.oid) like '%v_team in (''tender'')%')
  -- 045 created the coverage table; 046 only wrote to it. Rolling back 046
  -- must not take the table with it.
  union all select '046rb · project_system_floors still exists (045''s, not 046''s)',
         (to_regclass('workflow.project_system_floors') is not null)
) t;
