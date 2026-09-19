-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 022
-- Brief: ADTECH_WF_Brief_050_Migration_021_Rollback_Test_Screen_6a_Cleanup_And_Team_Write_Access §C
--
-- REQUIRED before migration 022 is applied to prod, per this repo's own
-- standing process: run this against a non-production target that already
-- carries migrations 001-021 first (Seanghakk runs it — this session has
-- no psql/DATABASE_URL/SQL-editor access).
--
-- Restores floor_sub_stages and project_handover_items to their exact
-- migration-009 PIC-keyed text, and shop_drawing_boq_lines/
-- shop_drawing_boq_line_locations to their exact migration-019
-- superadmin-only text — all quoted verbatim in migration 022's own
-- header. Drops the four updated_by columns this migration added
-- (procurement_lines, floor_sub_stages, project_handover_items,
-- shop_drawing_boq_lines). Idempotent per this repo's own established
-- convention (migration 017's own Amendment A fix): each restored CREATE
-- is preceded by its own DROP POLICY IF EXISTS on the same name, so this
-- succeeds whether migration 022 was fully applied, never applied
-- (today's policies are already there under these names — dropped, then
-- recreated identically, a no-op), or partially applied.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.floor_sub_stages
-- -----------------------------------------------------------------------------

drop policy if exists floor_sub_stages_insert on workflow.floor_sub_stages;
create policy floor_sub_stages_insert on workflow.floor_sub_stages
  for insert with check (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists floor_sub_stages_update on workflow.floor_sub_stages;
create policy floor_sub_stages_update on workflow.floor_sub_stages
  for update using (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists floor_sub_stages_delete on workflow.floor_sub_stages;
create policy floor_sub_stages_delete on workflow.floor_sub_stages
  for delete using (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

alter table workflow.floor_sub_stages drop column if exists updated_by;

-- -----------------------------------------------------------------------------
-- 2. workflow.project_handover_items
-- -----------------------------------------------------------------------------

drop policy if exists project_handover_items_insert on workflow.project_handover_items;
create policy project_handover_items_insert on workflow.project_handover_items
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_handover_items_update on workflow.project_handover_items;
create policy project_handover_items_update on workflow.project_handover_items
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_handover_items_delete on workflow.project_handover_items;
create policy project_handover_items_delete on workflow.project_handover_items
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

alter table workflow.project_handover_items drop column if exists updated_by;

-- -----------------------------------------------------------------------------
-- 3. workflow.shop_drawing_boq_lines / shop_drawing_boq_line_locations —
--    back to migration 019's exact superadmin-only text.
-- -----------------------------------------------------------------------------

drop policy if exists shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines;
create policy shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines
  for insert with check (workflow.is_superadmin());

drop policy if exists shop_drawing_boq_lines_update on workflow.shop_drawing_boq_lines;
create policy shop_drawing_boq_lines_update on workflow.shop_drawing_boq_lines
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());

drop policy if exists shop_drawing_boq_lines_delete on workflow.shop_drawing_boq_lines;
create policy shop_drawing_boq_lines_delete on workflow.shop_drawing_boq_lines
  for delete using (workflow.is_superadmin());

alter table workflow.shop_drawing_boq_lines drop column if exists updated_by;

drop policy if exists shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations;
create policy shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations
  for insert with check (workflow.is_superadmin());

drop policy if exists shop_drawing_boq_line_locations_update on workflow.shop_drawing_boq_line_locations;
create policy shop_drawing_boq_line_locations_update on workflow.shop_drawing_boq_line_locations
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());

drop policy if exists shop_drawing_boq_line_locations_delete on workflow.shop_drawing_boq_line_locations;
create policy shop_drawing_boq_line_locations_delete on workflow.shop_drawing_boq_line_locations
  for delete using (workflow.is_superadmin());

-- -----------------------------------------------------------------------------
-- 4. workflow.procurement_lines — actor column only, no policy change to
--    revert (migration 022 made none).
-- -----------------------------------------------------------------------------

alter table workflow.procurement_lines drop column if exists updated_by;

commit;
