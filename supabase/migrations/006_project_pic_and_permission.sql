-- =============================================================================
-- ADTECH Workflow Tracker — Migration 006: project PIC, "PIC of the record
-- only" permission rule for progress_updates
-- Brief: ADTECH_WF_Fable_Brief_002_Project_PIC_And_Theme_6 §1.1 / §2
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST, NOT ASSUMED FROM MIGRATION 001's
-- TEXT ALONE: workflow.progress_updates_insert is NOT still migration 001's
-- original wording. Migration 004 (sales roles / client ownership, already
-- applied to prod) already replaced it once, to close a manager-override
-- gap for sales-only managers:
--
--   author_id = (select auth.uid())
--   and (
--     (workflow.is_manager() and not workflow.is_sales_only_member())
--     or (subject_type = 'project' and projects.owner_id = caller)
--     or (subject_type = 'item' and project_items.pic_id = caller)
--   )
--
-- That is the policy THIS migration drops and replaces — read from migration
-- 004's own file (§E), not re-derived. This migration's rollback restores
-- THAT text verbatim, not migration 001's original (which migration 004
-- already superseded before this round started).
--
-- WHY THIS MIGRATION EXISTS (Fable Brief 001 §4 flagged a conflict, Fable
-- Brief 002 §1.1 resolves it — neither "keep owner_id as the project-level
-- authorized updater" nor "keep the manager bypass" survived): confirmed
-- with Seanghakk this session that items within one ADTECH project
-- routinely split across several different engineers, so projects.owner_id
-- is not a reliable stand-in for "the person who actually knows why the
-- work stalled." A project needs its OWN pic_id, so project-level and
-- item-level accountability work through the identical mechanism instead
-- of two different ones sharing one schema. The reason-required design
-- this whole app exists for (Brief 001 §4.1/§4.2 — the 81%-no-reason
-- finding) only means something if the reason comes from someone who was
-- actually there; a manager bypass or an owner_id proxy both let that
-- requirement be satisfied by someone else, which is the exact failure
-- mode the "item's PIC only" narrowing was written to close in the first
-- place. See Fable Result 002 for the full reasoning trail.
--
-- WHAT THIS MIGRATION DOES, three parts, exactly per the brief:
--
--   1. workflow.projects.pic_id — nullable FK to public.user_profiles,
--      ON DELETE RESTRICT (matches every other person-reference column in
--      this schema). Nullable deliberately: every existing project has no
--      PIC today, and this migration must not fail, and must not guess.
--
--   2. progress_updates_insert replaced with the rule stated once, applying
--      identically at both levels: a progress update may be inserted only
--      by the PIC of the record being updated. NO manager bypass at either
--      level — workflow.is_manager() (and, as a consequence,
--      is_sales_only_member(), which existed only to carve an exception out
--      of that bypass) is removed from this policy entirely. That function
--      itself is untouched and still used by workflow.can_view_project()
--      (migration 004) — nothing here drops or alters it.
--      (select auth.uid()) wrapping kept throughout — the Brief 001D
--      initplan-performance fix is not regressed.
--
--   3. Dev-seed convenience backfill: the four seed_dev.sql projects (every
--      one of them carries the literal " (fake — dev seed)" suffix in its
--      name — see supabase/seed_dev.sql) get pic_id set to Seanghakk's own
--      account, looked up by email against public.user_profiles rather
--      than a hardcoded UUID, so this step is reproducible against a fresh
--      database too. THIS IS DEV-SEED CONVENIENCE, NOT A REAL ASSIGNMENT —
--      stated here and repeated in the verify file so it is never mistaken
--      for a real PIC decision. If no matching user_profiles row exists
--      (e.g. a fresh database seeded before that account ever signed in),
--      this step logs a NOTICE and does nothing further, rather than
--      failing the whole migration or silently doing nothing unexplained.
--
-- CONSEQUENCE, DELIBERATE, NOT A BUG: with pic_id nullable and no manager
-- bypass, a project with pic_id IS NULL becomes un-updatable by ANYONE —
-- the policy has nothing to match. That is correct (an unassigned project
-- should not be receiving progress reports from someone guessing on its
-- behalf), but it must be made VISIBLE in the UI (Fable Brief 002 §3.1),
-- not discovered as a mysterious failed save — that UI work is Stage B of
-- this brief's own round, not part of this migration.
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor, same as every
-- migration in this project. Applies BY HAND, BEFORE any matching code is
-- merged — Stage B (screens that read/write pic_id) does not start until
-- this is applied and verified; see this round's result doc. Wrapped in an
-- explicit transaction.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.projects.pic_id
-- -----------------------------------------------------------------------------

alter table workflow.projects
  add column pic_id uuid references public.user_profiles (id) on delete restrict;

comment on column workflow.projects.pic_id is
  'The one person accountable for this project''s progress reporting —
   Fable Brief 002 §1.1/§2.1. Nullable: a project with no PIC set is, by
   design, un-updatable by anyone (see progress_updates_insert below) —
   the UI must surface that plainly (Fable Brief 002 §3.1), never let a
   save fail silently. Distinct from owner_id (unchanged, still whatever
   it already meant before this migration) and from
   workflow.project_items.pic_id (a different row, same naming, on
   purpose — same accountability concept, one per level).';

-- -----------------------------------------------------------------------------
-- 2. progress_updates_insert — replaces migration 004's version.
-- -----------------------------------------------------------------------------

drop policy if exists progress_updates_insert on workflow.progress_updates;

create policy progress_updates_insert on workflow.progress_updates
  for insert with check (
    author_id = (select auth.uid())
    and (
      (
        subject_type = 'project'
        and exists (
          select 1 from workflow.projects p
          where p.id = subject_id and p.pic_id = (select auth.uid())
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

comment on policy progress_updates_insert on workflow.progress_updates is
  'A progress update may be inserted only by the PIC of the record being
   updated — projects.pic_id for subject_type=''project'',
   project_items.pic_id for subject_type=''item''. NO manager bypass at
   either level, by deliberate decision (Fable Brief 002 §1.1): the
   reason-required design this app exists for only means something if the
   reason comes from someone who actually knows why the work stalled, and
   a manager/owner proxy lets that be satisfied by someone else, quietly.
   Supersedes migration 001''s original wording (owner_id/pic_id/manager)
   and migration 004''s interim fix (owner_id/pic_id/manager-minus-sales-
   only) in one step — see this file''s header for both prior texts.';

-- -----------------------------------------------------------------------------
-- 3. Dev-seed convenience backfill — NOT a real PIC assignment.
-- -----------------------------------------------------------------------------

do $$
declare
  v_pic_id uuid;
  v_rows_updated integer;
begin
  select id into v_pic_id
  from public.user_profiles
  where email = 'n.seanghakk@gmail.com';

  if v_pic_id is null then
    raise notice 'Migration 006: no public.user_profiles row for n.seanghakk@gmail.com — dev-seed pic_id backfill skipped, nothing updated.';
  else
    update workflow.projects
    set pic_id = v_pic_id
    where name like '%(fake — dev seed)%'
      and pic_id is null;

    get diagnostics v_rows_updated = row_count;
    raise notice 'Migration 006: dev-seed pic_id backfill set % project(s) to %.', v_rows_updated, v_pic_id;
  end if;
end $$;

commit;
