select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '049rb · the cell guard is gone' as label,
         not exists (select 1 from pg_trigger
                      where tgrelid=to_regclass('workflow.progress_cells')
                        and tgname='progress_cells_refuse_delete_with_work' and not tgisinternal) as ok
  union all select '049rb · the drawing guard is gone',
         not exists (select 1 from pg_trigger
                      where tgrelid=to_regclass('workflow.shop_drawing_items')
                        and tgname='shop_drawing_items_refuse_delete_with_work' and not tgisinternal)
  union all select '049rb · the archive guard is gone',
         not exists (select 1 from pg_trigger
                      where tgrelid=to_regclass('workflow.floor_sub_stages')
                        and tgname='floor_sub_stages_refuse_delete_with_work' and not tgisinternal)
  union all select '049rb · the floor guard is gone',
         not exists (select 1 from pg_trigger
                      where tgrelid=to_regclass('workflow.project_floors')
                        and tgname='project_floors_refuse_delete_with_work' and not tgisinternal)
  union all select '049rb · no guard function survives',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.proname like '%refuse_delete_with_work')
  union all select '049rb · the opt-in function is gone',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.proname='destructive_delete_allowed')
  union all select '049rb · no 049 marker survives anywhere',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.prokind = 'f'
                        and pg_get_functiondef(p.oid) like '%049 marker%')
  -- 049 dropped these; undoing 049 must put them back.
  union all select '049rb · the old sub-stage rollup function is restored',
         exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='workflow' and p.proname='recalculate_rollup_from_sub_stage')
  union all select '049rb · and its trigger is back on the archive',
         exists (select 1 from pg_trigger
                  where tgrelid=to_regclass('workflow.floor_sub_stages')
                    and tgname='floor_sub_stages_recalculate_rollup' and not tgisinternal)
) t;
