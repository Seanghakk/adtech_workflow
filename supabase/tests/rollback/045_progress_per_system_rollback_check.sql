-- Asserts the state AFTER supabase/rollback/045_*.sql has run.
-- Columns `label` and `result` are the contract run-rollback.mjs parses.
select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '045rb · progress_cells is gone' as label,
         (to_regclass('workflow.progress_cells') is null) as ok
  union all select '045rb · project_system_floors is gone',
         (to_regclass('workflow.project_system_floors') is null)
  -- Staged 045 never dropped the archive, so the rollback must not either.
  -- If this fails, the rollback destroyed pre-D096 records.
  union all select '045rb · floor_sub_stages SURVIVED the rollback',
         (to_regclass('workflow.floor_sub_stages') is not null)
  union all select '045rb · qc_inspections.progress_cell_id is gone',
         not exists (select 1 from information_schema.columns
                      where table_schema='workflow' and table_name='qc_inspections'
                        and column_name='progress_cell_id')
  union all select '045rb · qc_inspections.floor_sub_stage_id is back in use',
         exists (select 1 from information_schema.columns
                  where table_schema='workflow' and table_name='qc_inspections'
                    and column_name='floor_sub_stage_id')
  union all select '045rb · the shape check keys on the OLD column again',
         exists (select 1 from pg_constraint
                  where conrelid=to_regclass('workflow.qc_inspections')
                    and conname='qc_inspections_shape_check'
                    and pg_get_constraintdef(oid) like '%floor_sub_stage_id%'
                    and pg_get_constraintdef(oid) not like '%progress_cell_id%')
  union all select '045rb · seed_floor_children is restored',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='seed_floor_children')
  union all select '045rb · its trigger is wired to project_floors',
         exists (select 1 from pg_trigger
                  where tgrelid=to_regclass('workflow.project_floors')
                    and tgname='project_floors_seed_children' and not tgisinternal)
  -- The restored body must be the real one. tnc sequence 1/2 is the detail my
  -- own reconstruction got wrong, so it is asserted specifically.
  union all select '045rb · restored seeding uses tnc sequence 1 and 2, not 4 and 5',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='seed_floor_children'
                    and pg_get_functiondef(p.oid) like '%''pre_commissioning'', 1%'
                    and pg_get_functiondef(p.oid) like '%''commissioning'', 2%')
  union all select '045rb · the rollup buckets FLOORS again, not covered pairs',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='compute_project_rollup_percent'
                    and pg_get_functiondef(p.oid) like '%floor_sub_stages%'
                    and pg_get_functiondef(p.oid) not like '%progress_cells%')
  -- 045's marker must be gone from every function it touched.
  union all select '045rb · no 045 marker survives anywhere',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.prokind = 'f'
                        and pg_get_functiondef(p.oid) like '%045 marker%')
  -- SECURITY DEFINER is part of the pre-045 definition. A rollback that
  -- restores the body but drops the definer bit changes who sees what.
  union all select '045rb · the restored rollup kept SECURITY DEFINER',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='compute_project_rollup_percent'
                    and p.prosecdef
                    and array_to_string(p.proconfig,',') like '%search_path%')
) t;
