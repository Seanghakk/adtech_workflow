select label, case when ok then 'PASS' else 'FAIL' end as result from (
  select '047rb · the rollup trigger is gone from progress_cells' as label,
         not exists (select 1 from pg_trigger
                      where tgrelid=to_regclass('workflow.progress_cells')
                        and tgname='progress_cells_recalculate_rollup' and not tgisinternal) as ok
  union all select '047rb · its function is gone',
         not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                      where n.nspname='workflow' and p.proname='recalculate_rollup_from_progress_cell')
  -- 047 did not create progress_cells and must not remove it.
  union all select '047rb · progress_cells itself is untouched',
         (to_regclass('workflow.progress_cells') is not null)
  -- The shop drawing rollup is a different migration's and must survive.
  union all select '047rb · the shop_drawing_items rollup still works',
         exists (select 1 from pg_trigger
                  where tgrelid=to_regclass('workflow.shop_drawing_items')
                    and tgname='shop_drawing_items_recalculate_rollup' and not tgisinternal)
) t;
