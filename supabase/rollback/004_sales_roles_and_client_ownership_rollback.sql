-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 004
-- Brief: ADTECH_WF_Brief_003_Sales_Roles
--
-- Reverses 004_sales_roles_and_client_ownership.sql in the opposite order:
-- restore progress_updates_insert and the six SELECT policies to their
-- pre-migration form, drop the two new predicate functions, drop
-- workflow.client_owners (discarding any real assignments already made —
-- emergency use only, same standing as every rollback in this project),
-- and drop the is_maintenance_contract column (discarding any real flags
-- already set).
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor.
-- =============================================================================

begin;

-- §E: restore progress_updates_insert's unconditional manager override.
drop policy if exists progress_updates_insert on workflow.progress_updates;
create policy progress_updates_insert on workflow.progress_updates
  for insert with check (
    author_id = (select auth.uid())
    and (
      workflow.is_manager()
      or (
        subject_type = 'project'
        and exists (
          select 1 from workflow.projects p
          where p.id = subject_id and p.owner_id = (select auth.uid())
        )
      )
      or (
        subject_type = 'item'
        and exists (
          select 1 from workflow.project_items i
          where i.id = subject_id and i.pic_id = (select auth.uid())
        )
      )
    )
  );

-- §D: restore the six SELECT policies to a bare is_member().
drop policy if exists progress_updates_select on workflow.progress_updates;
create policy progress_updates_select on workflow.progress_updates
  for select using (workflow.is_member());

drop policy if exists dependency_links_select on workflow.dependency_links;
create policy dependency_links_select on workflow.dependency_links
  for select using (workflow.is_member());

drop policy if exists procurement_lines_select on workflow.procurement_lines;
create policy procurement_lines_select on workflow.procurement_lines
  for select using (workflow.is_member());

drop policy if exists project_items_select on workflow.project_items;
create policy project_items_select on workflow.project_items
  for select using (workflow.is_member());

drop policy if exists variations_select on workflow.variations;
create policy variations_select on workflow.variations
  for select using (workflow.is_member());

drop policy if exists projects_select on workflow.projects;
create policy projects_select on workflow.projects
  for select using (workflow.is_member());

-- §C: drop the two new predicate functions.
drop function if exists workflow.can_view_project(uuid, boolean);
drop function if exists workflow.is_sales_only_member();

-- §B: drop client ownership.
drop table if exists workflow.client_owners;

-- §A: drop the maintenance flag.
alter table workflow.projects drop column if exists is_maintenance_contract;

commit;
