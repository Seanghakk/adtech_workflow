-- =============================================================================
-- ROLLBACK for migration 048 — the two rules 045 lost
-- =============================================================================
--
-- 048 restored a shape check and replaced 045's over-broad write policy with
-- the stage-keyed pair the pre-D096 table actually had. Rolling it back puts
-- the loose state back.
--
-- BE CLEAR ABOUT WHAT THAT MEANS. After this file runs:
--   * a progress cell can again be written with stage 'installation' and
--     sub_stage 'commissioning', or any string at all; and
--   * project management can write TNC cells and vice versa, and superadmin
--     and the PIC regain write bypasses that workflow.floor_sub_stages never
--     granted anyone.
--
-- That is a genuine loosening of permissions, which is why it is spelled out
-- here rather than left to be discovered. Do not run this file to "clean up"
-- something unrelated.
--
-- One transaction, committed once, at the end.
-- =============================================================================

begin;

alter table workflow.progress_cells
  drop constraint if exists progress_cells_shape_check;

drop policy if exists progress_cells_insert on workflow.progress_cells;
drop policy if exists progress_cells_update on workflow.progress_cells;

-- 045's version, restored exactly: is_superadmin OR either progress team OR
-- the project's PIC, for ALL commands.
create policy progress_cells_write on workflow.progress_cells
  for all using (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['project_management', 'tnc'])
    or exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = progress_cells.project_system_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['project_management', 'tnc'])
    or exists (
      select 1 from workflow.project_systems ps
        join workflow.projects p on p.id = ps.project_id
       where ps.id = progress_cells.project_system_id
         and p.pic_id = (select auth.uid())
    )
  );

commit;
