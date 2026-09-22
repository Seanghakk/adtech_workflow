-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 028
-- Brief: ADTECH_WF_Brief_086_Shop_Drawing_Shared_Control_And_Auto_Status_Draft
--
-- Reverses migration 028 in dependency order: the two new triggers
-- before the functions they call, then restores both policy pairs to
-- their pre-028 text (migration 019's shape for shop_drawing_items_
-- update; migration 027's shape for shop_drawing_submissions_insert/
-- update) — RE-CREATING the old policy text rather than merely dropping
-- it, so the table is never left with NO update/insert policy at all in
-- between (drop-then-recreate happens inside one transaction, so this is
-- atomic either way, but stating the old text explicitly here means this
-- rollback does not depend on any OTHER migration file still being
-- readable at rollback time).
--
-- Does NOT touch migration 027's own objects (shop_drawing_checks,
-- shop_drawing_submissions itself, record_shop_drawing_check(), or
-- either of migration 027's own two triggers) — this migration never
-- altered any of them, so there is nothing to restore for them either.
--
-- NO DATA LOSS from this rollback specifically: migration 028 added no
-- new column and no new table, only two triggers and two widened
-- policies. Any status/updated_at value that migration 028's OWN
-- triggers wrote while applied stays exactly as it is — rolling back the
-- MECHANISM does not undo values it already wrote, same as every other
-- rollback file in this project only ever undoes schema, not history.
-- =============================================================================

begin;

drop trigger if exists shop_drawing_submissions_auto_status on workflow.shop_drawing_submissions;
drop function if exists workflow.shop_drawing_submissions_auto_status();

drop trigger if exists shop_drawing_items_before_update on workflow.shop_drawing_items;
drop function if exists workflow.shop_drawing_items_before_update();

-- Restore shop_drawing_items_update to its pre-028 (migration 019) text.
drop policy if exists shop_drawing_items_update on workflow.shop_drawing_items;
create policy shop_drawing_items_update on workflow.shop_drawing_items
  for update using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- Restore shop_drawing_submissions_insert/update to their pre-028
-- (migration 027) text.
drop policy if exists shop_drawing_submissions_insert on workflow.shop_drawing_submissions;
create policy shop_drawing_submissions_insert on workflow.shop_drawing_submissions
  for insert with check (
    workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

drop policy if exists shop_drawing_submissions_update on workflow.shop_drawing_submissions;
create policy shop_drawing_submissions_update on workflow.shop_drawing_submissions
  for update using (
    workflow.current_team() in ('shop_drawing', 'a_and_a')
  ) with check (
    workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

commit;
