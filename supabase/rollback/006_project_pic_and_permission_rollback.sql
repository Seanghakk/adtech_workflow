-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 006
-- Brief: ADTECH_WF_Fable_Brief_002_Project_PIC_And_Theme_6 §1.1 / §2
--
-- Reverses 006_project_pic_and_permission.sql:
--   - Restores progress_updates_insert to EXACTLY migration 004's version
--     (the one actually live immediately before 006 was applied — NOT
--     migration 001's original text, which migration 004 already replaced
--     before this round began). Copied verbatim from
--     supabase/migrations/004_sales_roles_and_client_ownership.sql §E.
--   - Drops workflow.projects.pic_id, and with it every value the dev-seed
--     backfill wrote. Non-recoverable by this rollback alone, but low-
--     stakes: re-applying migration 006 recomputes the same backfill from
--     the same rule (match on the "(fake — dev seed)" name suffix), and
--     the brief is explicit this was never a real assignment to begin
--     with.
--
-- Does not touch `public`, does not touch workflow.is_manager() or
-- workflow.is_sales_only_member() (both predate this migration and are
-- untouched by it), does not touch any other policy.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop policy if exists progress_updates_insert on workflow.progress_updates;

create policy progress_updates_insert on workflow.progress_updates
  for insert with check (
    author_id = (select auth.uid())
    and (
      (workflow.is_manager() and not workflow.is_sales_only_member())
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

alter table workflow.projects
  drop column if exists pic_id;

commit;
