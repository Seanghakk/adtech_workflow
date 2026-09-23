-- =============================================================================
-- ADTECH Workflow Tracker — Verification for Brief 096 (migrations 029-035)
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §4/§6
--
-- One row per check, expected vs actual, PASS/FAIL — this repo's own
-- Brief 088 style. Run AFTER applying migrations 029-035. Every row
-- below must read PASS.
--
-- STANDING TRAP (same as every prior verify file in this repo): this
-- runs as the table owner in the SQL editor / psql session and bypasses
-- RLS entirely — it can confirm a policy EXISTS with the right qual, not
-- that it actually blocks or admits anyone. That proof needs a real
-- signed-in session (see this brief's own Result doc §7 for that half).
-- =============================================================================

with checks as (

  -- --- Item 1: projects.cad_owner_name / cad_consultant_name ---------------
  select 1 as n, 'projects.cad_owner_name exists, nullable text' as check_name,
    'text,YES' as expected,
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='projects' and column_name='cad_owner_name'), 'MISSING') as actual

  union all
  select 2, 'projects.cad_consultant_name exists, nullable text',
    'text,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='projects' and column_name='cad_consultant_name'), 'MISSING')

  -- --- Item 2: project_floors.drawing_code ----------------------------------
  union all
  select 3, 'project_floors.drawing_code exists, nullable text',
    'text,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='project_floors' and column_name='drawing_code'), 'MISSING')

  union all
  select 4, 'project_floors drawing_code format CHECK constraint exists',
    'present',
    case when exists (select 1 from information_schema.table_constraints
      where table_schema='workflow' and table_name='project_floors'
        and constraint_name='project_floors_drawing_code_format_check')
      then 'present' else 'MISSING' end

  union all
  select 5, 'project_floors drawing_code unique-per-project partial index exists',
    'present',
    case when exists (select 1 from pg_indexes where schemaname='workflow'
      and tablename='project_floors' and indexname='project_floors_drawing_code_per_project_key')
      then 'present' else 'MISSING' end

  -- --- Item 3: workflow.cad_systems -----------------------------------------
  union all
  select 6, 'workflow.cad_systems table exists',
    'present',
    case when exists (select 1 from information_schema.tables
      where table_schema='workflow' and table_name='cad_systems') then 'present' else 'MISSING' end

  union all
  select 7, 'workflow.cad_systems has exactly 23 seed rows',
    '23',
    coalesce((select count(*)::text from workflow.cad_systems), '0')

  union all
  select 8, 'workflow.cad_systems RLS enabled',
    'true',
    coalesce((select relrowsecurity::text from pg_class
      where relname='cad_systems' and relnamespace='workflow'::regnamespace), 'MISSING')

  union all
  select 9, 'workflow.cad_systems has exactly 3 policies (select/insert/update)',
    '3',
    coalesce((select count(*)::text from pg_policies
      where schemaname='workflow' and tablename='cad_systems'), '0')

  -- --- Item 4: drawing register fields ---------------------------------------
  union all
  select 10, 'shop_drawing_items.drawing_number exists, nullable text',
    'text,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='shop_drawing_items' and column_name='drawing_number'), 'MISSING')

  union all
  select 11, 'shop_drawing_items.drafter_id exists, nullable uuid',
    'uuid,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='shop_drawing_items' and column_name='drafter_id'), 'MISSING')

  union all
  select 12, 'shop_drawing_items.approver_id exists, nullable uuid',
    'uuid,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='shop_drawing_items' and column_name='approver_id'), 'MISSING')

  union all
  select 13, 'shop_drawing_items drawing_number unique-per-project partial index exists',
    'present',
    case when exists (select 1 from pg_indexes where schemaname='workflow'
      and tablename='shop_drawing_items' and indexname='shop_drawing_items_drawing_number_per_project_key')
      then 'present' else 'MISSING' end

  union all
  select 14, 'projects.drawing_numbering_mode exists, nullable text',
    'text,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='projects' and column_name='drawing_numbering_mode'), 'MISSING')

  union all
  select 15, 'projects drawing_numbering_mode CHECK constraint exists',
    'present',
    case when exists (select 1 from information_schema.table_constraints
      where table_schema='workflow' and table_name='projects'
        and constraint_name='projects_drawing_numbering_mode_check')
      then 'present' else 'MISSING' end

  -- --- Item 5: export log -----------------------------------------------------
  union all
  select 16, 'workflow.autocad_export_log table exists',
    'present',
    case when exists (select 1 from information_schema.tables
      where table_schema='workflow' and table_name='autocad_export_log') then 'present' else 'MISSING' end

  union all
  select 17, 'workflow.autocad_export_log RLS enabled',
    'true',
    coalesce((select relrowsecurity::text from pg_class
      where relname='autocad_export_log' and relnamespace='workflow'::regnamespace), 'MISSING')

  union all
  select 18, 'workflow.autocad_export_log has exactly 2 policies (select/insert)',
    '2',
    coalesce((select count(*)::text from pg_policies
      where schemaname='workflow' and tablename='autocad_export_log'), '0')

  -- --- Item 6: BOQ item_number -------------------------------------------------
  union all
  select 19, 'contract_boq_lines.item_number exists, nullable text',
    'text,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='contract_boq_lines' and column_name='item_number'), 'MISSING')

  union all
  select 20, 'contract_boq_lines item_number unique-per-project partial index exists',
    'present',
    case when exists (select 1 from pg_indexes where schemaname='workflow'
      and tablename='contract_boq_lines' and indexname='contract_boq_lines_item_number_per_project_key')
      then 'present' else 'MISSING' end

  union all
  select 21, 'tender_boq_lines.item_number exists, nullable text',
    'text,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='tender_boq_lines' and column_name='item_number'), 'MISSING')

  union all
  select 22, 'tender_boq_lines item_number unique-per-project partial index exists',
    'present',
    case when exists (select 1 from pg_indexes where schemaname='workflow'
      and tablename='tender_boq_lines' and indexname='tender_boq_lines_item_number_per_project_key')
      then 'present' else 'MISSING' end

  union all
  select 23, 'shop_drawing_boq_lines.item_number exists, nullable text',
    'text,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='shop_drawing_boq_lines' and column_name='item_number'), 'MISSING')

  union all
  select 24, 'shop_drawing_boq_lines item_number unique-per-project partial index exists',
    'present',
    case when exists (select 1 from pg_indexes where schemaname='workflow'
      and tablename='shop_drawing_boq_lines' and indexname='shop_drawing_boq_lines_item_number_per_project_key')
      then 'present' else 'MISSING' end

  -- --- Item 9: procurement delivery timestamp -----------------------------------
  union all
  select 25, 'procurement_lines.delivery_last_received_at exists, nullable timestamptz',
    'timestamp with time zone,YES',
    coalesce((select data_type || ',' || is_nullable from information_schema.columns
      where table_schema='workflow' and table_name='procurement_lines' and column_name='delivery_last_received_at'), 'MISSING')

  union all
  select 26, 'procurement_lines_before_update trigger exists',
    'present',
    case when exists (select 1 from pg_trigger
      where tgrelid='workflow.procurement_lines'::regclass and tgname='procurement_lines_before_update')
      then 'present' else 'MISSING' end

)
select n, check_name, expected, actual,
  case when expected = actual then 'PASS' else 'FAIL' end as verdict
from checks
order by n;

-- Migration 028's stale "DRAFT ONLY — NOT APPLIED" header (§2's own
-- instruction) is a repo FILE correction, not a live-schema fact — it
-- cannot be expressed as an expected-vs-actual database row. Checked by
-- reading supabase/migrations/028_shop_drawing_shared_control_and_auto_
-- status.sql directly: corrected in this same round. See this brief's
-- own Result doc.
