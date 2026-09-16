-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 008
-- Brief: ADTECH_WF_Brief_007_Floor_Stage_Tracking_And_Handover + Amendment A
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 008_floor_stage_tracking_and_handover.sql — and after having run the
-- ROLLBACK against a non-production target first, per Amendment §5.1.
-- Catalog-only checks, same discipline as every other verification file
-- here (no psql/DATABASE_URL in this environment). These confirm the
-- objects exist with the intended SHAPE; a live INSERT-based behavioural
-- test of the rollup trigger chain is deliberately not included here for
-- the same reason migration 003's own verify file gives: exercising it
-- for real needs a real floor added to a real project, which is exactly
-- the "adoption path, not a migration" Amendment §2.1 describes — that
-- is the actual test, once someone adds the first real floor.
-- =============================================================================

-- 1. All eight new tables exist, with RLS enabled.
-- Expect 8 rows, every rowsecurity = true.
select relname, relrowsecurity
from pg_class
where relnamespace = 'workflow'::regnamespace
  and relname in (
    'project_floors', 'shop_drawing_items', 'floor_sub_stages',
    'qc_inspections', 'qc_inspection_floors', 'project_handover_items',
    'checklist_templates', 'checklist_items'
  )
order by relname;


-- 2. workflow.projects gained exactly the two expected columns.
-- Expect 2 rows: percent_calculated | integer | YES, percent_override_at
-- | timestamp with time zone | YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'projects'
  and column_name in ('percent_calculated', 'percent_override_at')
order by column_name;


-- 3. SELECT policies exist on every new project-child table, via
-- pg_policies (never raw pg_policy — Brief 010's own standing caution,
-- carried forward here per the amendment's §6).
-- Expect 8 rows, one per table, each named "<table>_select".
select tablename, policyname
from pg_policies
where schemaname = 'workflow'
  and tablename in (
    'project_floors', 'shop_drawing_items', 'floor_sub_stages',
    'qc_inspections', 'qc_inspection_floors', 'project_handover_items',
    'checklist_templates', 'checklist_items'
  )
order by tablename;


-- 4. No INSERT/UPDATE/DELETE policy exists on any of the eight — by
-- design this round (see migration 008's own header on write
-- permissions not being decided yet). A verify block run as owner
-- bypasses RLS regardless, so this only confirms no POLICY exists; it
-- does not prove the app's own authenticated role is blocked from
-- writing — that would need testing through the app itself.
-- Expect 0 rows.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'workflow'
  and tablename in (
    'project_floors', 'shop_drawing_items', 'floor_sub_stages',
    'qc_inspections', 'qc_inspection_floors', 'project_handover_items',
    'checklist_templates', 'checklist_items'
  )
  and cmd <> 'SELECT';


-- 5. The FAS seed — exactly two templates, exactly three items, nothing
-- for any other system_type.
-- Expect 2 rows: fas | shop_drawing | FAS design checklist,
--                fas | tnc_commissioning | FAS commissioning checklist.
select system_type, applies_to, label_en
from workflow.checklist_templates
order by sort_order;

-- Expect 3 rows: battery_calculation, voltage_drop_calculation (under
-- shop_drawing), cause_and_effect_matrix (under tnc_commissioning).
select ct.applies_to, ci.code, ci.label_en
from workflow.checklist_items ci
join workflow.checklist_templates ct on ct.id = ci.template_id
order by ct.applies_to, ci.sort_order;

-- Expect 0 rows — confirms nothing was invented for any system_type
-- other than fas.
select distinct system_type
from workflow.checklist_templates
where system_type <> 'fas';


-- 6. The rollup functions and trigger functions all exist.
-- Expect 7 rows: bump_last_meaningful_movement, compute_project_rollup_
-- percent, recalculate_project_rollup, recalculate_rollup_from_shop_
-- drawing, recalculate_rollup_from_sub_stage, seed_floor_children — plus
-- can_view_project and is_member already existed before this migration
-- and are excluded from this list on purpose (unchanged by it).
select proname
from pg_proc
where pronamespace = 'workflow'::regnamespace
  and proname in (
    'bump_last_meaningful_movement', 'compute_project_rollup_percent',
    'recalculate_project_rollup', 'recalculate_rollup_from_shop_drawing',
    'recalculate_rollup_from_sub_stage', 'seed_floor_children'
  )
order by proname;


-- 7. The three new triggers exist, firing at the right time.
-- Expect 3 rows: project_floors_seed_children | AFTER,
-- shop_drawing_items_recalculate_rollup | AFTER,
-- floor_sub_stages_recalculate_rollup | AFTER.
select trigger_name, action_timing, event_object_table
from information_schema.triggers
where trigger_schema = 'workflow'
  and trigger_name in (
    'project_floors_seed_children',
    'shop_drawing_items_recalculate_rollup',
    'floor_sub_stages_recalculate_rollup'
  )
order by trigger_name;


-- 8. Every existing project still has zero floor rows — confirms this
-- migration changed nothing observable for any project that exists
-- today (Amendment §5.2's own requirement, re-confirmed after applying,
-- not just reasoned about beforehand).
-- Expect 0 rows.
select p.id, p.name
from workflow.projects p
join workflow.project_floors f on f.project_id = p.id;


-- 9. Shape-check constraints reject what they should. Run each INSERT
-- by hand and confirm it is REFUSED (a constraint-violation error is the
-- expected/passing outcome for every statement in this block) — none of
-- these should be left applied afterward.
--
-- 9a. A project-scope shop-drawing item with the wrong drawing_type.
-- Expect: ERROR — violates shop_drawing_items_shape_check.
-- insert into workflow.shop_drawing_items (project_id, scope, drawing_type)
-- values ('00000000-0000-0000-0000-000000000000', 'project', 'layout');
--
-- 9b. A floor sub-stage with a sub_stage that doesn't belong to its stage.
-- Expect: ERROR — violates floor_sub_stages_shape_check.
-- insert into workflow.floor_sub_stages (floor_id, stage, sub_stage, sequence)
-- values ('00000000-0000-0000-0000-000000000000', 'installation', 'commissioning', 1);
--
-- 9c. A handover deliverable outside the fixed six.
-- Expect: ERROR — violates project_handover_items_deliverable_check.
-- insert into workflow.project_handover_items (project_id, deliverable)
-- values ('00000000-0000-0000-0000-000000000000', 'site_photos');
