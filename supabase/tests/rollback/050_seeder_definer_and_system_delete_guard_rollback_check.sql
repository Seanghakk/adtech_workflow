select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '050rb · the system delete guard is gone' as label,
         not exists (select 1 from pg_trigger
                      where tgrelid=to_regclass('workflow.project_systems')
                        and tgname='project_systems_refuse_delete_with_work'
                        and not tgisinternal) as ok
  union all select '050rb · its function is gone',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.proname='project_systems_refuse_delete_with_work')
  -- The seeder is back to invoker, which is what 045 shipped — and what made
  -- coverage unsaveable. Asserted so the rollback cannot half-happen.
  union all select '050rb · the seeder is SECURITY INVOKER again',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='seed_progress_cells'
                    and not p.prosecdef)
  union all select '050rb · the three trigger wrappers are invoker again',
         ((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='workflow'
              and p.proname in ('project_system_floors_after_insert',
                                'project_system_floors_after_update',
                                'project_floors_extend_full_coverage')
              and not p.prosecdef) = 3)
  -- The seeder must still EXIST and still seed; only its rights changed.
  union all select '050rb · the seeder still carries 045''s marker',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='seed_progress_cells'
                    and pg_get_functiondef(p.oid) like '%045 marker: five sub-stages seeded%')
  -- 049's guards are a different migration's and must survive.
  union all select '050rb · 049''s cell guard is untouched',
         exists (select 1 from pg_trigger
                  where tgrelid=to_regclass('workflow.progress_cells')
                    and tgname='progress_cells_refuse_delete_with_work' and not tgisinternal)
) t;
