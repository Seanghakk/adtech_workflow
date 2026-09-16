-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 009
-- Brief: ADTECH_WF_Brief_012_User_Management_And_Write_Permissions §1.4
--
-- REQUIRED before migration 009 is applied to prod, per the brief's own
-- instruction: run this against the throwaway Supabase project that
-- already carries migrations 001-008 (Seanghakk runs it — this session
-- has no psql/DATABASE_URL/SQL-editor access, the same standing
-- limitation every migration here has documented since Brief 001).
--
-- Reverses, in dependency order: the two new SECURITY DEFINER functions,
-- the DELETE grant, then the eighteen new policies (three each — insert/
-- update/delete — across the six tables), leaving every one of migration
-- 008's tables back to SELECT-only, exactly as migration 008 left it.
-- checklist_templates/checklist_items are untouched by migration 009 and
-- so are untouched here too.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Drop the two SECURITY DEFINER functions.
-- -----------------------------------------------------------------------------

drop function if exists workflow.list_unlinked_accounts();
drop function if exists workflow.assign_project_pic(uuid, uuid);

-- -----------------------------------------------------------------------------
-- 2. Revoke the DELETE grant migration 009 added for exactly these six
--    tables. Their INSERT/UPDATE table-level grants predate migration
--    009 (migration 002's blanket grant to `authenticated`) and are left
--    untouched — only the policies added below are migration 009's own.
-- -----------------------------------------------------------------------------

revoke delete on
  workflow.project_floors,
  workflow.shop_drawing_items,
  workflow.floor_sub_stages,
  workflow.qc_inspections,
  workflow.qc_inspection_floors,
  workflow.project_handover_items
from authenticated;

-- -----------------------------------------------------------------------------
-- 3. Drop the eighteen write policies, back to SELECT-only per table.
-- -----------------------------------------------------------------------------

drop policy if exists project_floors_insert on workflow.project_floors;
drop policy if exists project_floors_update on workflow.project_floors;
drop policy if exists project_floors_delete on workflow.project_floors;

drop policy if exists shop_drawing_items_insert on workflow.shop_drawing_items;
drop policy if exists shop_drawing_items_update on workflow.shop_drawing_items;
drop policy if exists shop_drawing_items_delete on workflow.shop_drawing_items;

drop policy if exists floor_sub_stages_insert on workflow.floor_sub_stages;
drop policy if exists floor_sub_stages_update on workflow.floor_sub_stages;
drop policy if exists floor_sub_stages_delete on workflow.floor_sub_stages;

drop policy if exists qc_inspections_insert on workflow.qc_inspections;
drop policy if exists qc_inspections_update on workflow.qc_inspections;
drop policy if exists qc_inspections_delete on workflow.qc_inspections;

drop policy if exists qc_inspection_floors_insert on workflow.qc_inspection_floors;
drop policy if exists qc_inspection_floors_update on workflow.qc_inspection_floors;
drop policy if exists qc_inspection_floors_delete on workflow.qc_inspection_floors;

drop policy if exists project_handover_items_insert on workflow.project_handover_items;
drop policy if exists project_handover_items_update on workflow.project_handover_items;
drop policy if exists project_handover_items_delete on workflow.project_handover_items;

commit;
