-- =============================================================================
-- ADTECH Workflow Tracker — Migration 009: write policies for migration
-- 008's tables, plus the two privileged functions User Management and
-- board-side PIC assignment need to actually work through the app.
-- Brief: ADTECH_WF_Brief_012_User_Management_And_Write_Permissions §1/§3
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST: main is 15bd71e, migration 008
-- applied to prod per this session's own git log check. This session has
-- no psql/DATABASE_URL/SQL-editor access — the same standing limitation
-- every migration in this repo has documented since Brief 001 — so
-- nothing below is verified by running; see the verification file and
-- this round's Result doc for exactly what could and could not be
-- checked from here.
--
-- THREE PARTS:
--
--  1. WRITE POLICIES FOR MIGRATION 008'S PROJECT-SCOPED TABLES (Brief
--     §1.1). Migration 008 gave every one of its eight new tables a
--     SELECT policy and deliberately NO write policy, because nobody had
--     decided who may write. That is decided now: the signed-in member
--     is the PIC of the project the row belongs to. NO MANAGER BYPASS —
--     this matches migration 006's own precedent for progress_updates
--     EXACTLY (that migration's own header: "workflow.is_manager()... is
--     removed from this policy entirely... NO manager bypass at either
--     level"), read from that file directly rather than assumed, per
--     Brief §1.1's own instruction to "read that migration and match it
--     rather than choosing fresh." A project with no PIC (pic_id is
--     null) is therefore un-updatable by ANYONE, including a manager or
--     admin — the same deliberate consequence migration 006 already
--     established for progress_updates, now extended to floor detail.
--
--     checklist_templates / checklist_items are EXCLUDED per Brief
--     §1.3 — they are lookup content belonging to no project, not
--     project data, and stay SELECT-only until the lookup-admin round.
--
--     JOIN PATH PER TABLE (each write policy mirrors the join shape its
--     OWN migration-008 SELECT policy already established — none of the
--     six tables below has more than one path back to a project, so
--     none needed to be flagged as ambiguous):
--
--       project_floors        — project_id directly -> projects.pic_id
--       shop_drawing_items    — project_id directly -> projects.pic_id
--                                (project_id is always set, even for
--                                floor-scoped rows — migration 008's own
--                                denormalization, reused here)
--       floor_sub_stages      — floor_id -> project_floors.project_id
--                                -> projects.pic_id
--       qc_inspections        — project_id directly -> projects.pic_id
--       qc_inspection_floors  — qc_inspection_id -> qc_inspections.
--                                project_id -> projects.pic_id (the
--                                table's OWN select policy already
--                                chose this path over floor_id; matched
--                                here rather than re-decided)
--       project_handover_items — project_id directly -> projects.pic_id
--
--  2. A GRANT GAP, FOUND BY READING MIGRATION 002 RATHER THAN ASSUMED:
--     migration 002's own comment states plainly "RLS policies FILTER
--     access a role already has. They do NOT GRANT it" — and that
--     migration granted `authenticated` INSERT and UPDATE on every
--     workflow table, but NEVER DELETE, anywhere, on anything. Brief
--     §1.1 asks for INSERT/UPDATE/DELETE policies on these six tables,
--     so without a matching DELETE grant, every DELETE policy below
--     would be inert — a caller would hit "permission denied for table
--     X" (a missing GRANT) rather than the RLS check actually being
--     exercised. Part 2 grants DELETE on exactly these six tables to
--     `authenticated`, not broadened to the rest of the schema (no other
--     table gets a DELETE policy this round, so a blanket grant would
--     only be a false sense of capability elsewhere).
--
--  3. TWO SECURITY DEFINER FUNCTIONS, so Part Two and Part Three of the
--     brief have an actual write path to call — chosen over a service-
--     role key/admin-API client (which this app has never held) to
--     match this schema's own established idiom: every privileged
--     operation so far (is_member, is_manager, recalculate_project_
--     rollup, seed_floor_children) is a SECURITY DEFINER function that
--     checks the caller internally, not a raw RLS policy or an
--     out-of-band admin client. Both are internally gated on
--     workflow.is_manager() — Brief §2.7/§3.1 both restrict their
--     screens to managers and admins, and is_manager() already covers
--     both roles (migration 001).
--
--       workflow.assign_project_pic(project_id, new_pic_id) — Brief §3.
--       workflow.projects has had NO update policy at all since
--       migration 003 (percent_complete's own comment: "this table has
--       never had an UPDATE policy"); a broad RLS UPDATE policy would
--       let any manager rewrite ANY column on ANY project, which is far
--       more than "assign a PIC." This function updates exactly pic_id
--       and updated_at, nothing else, and refuses a target who is not
--       an active member — assigning an unlinked or deactivated account
--       as PIC would silently recreate the exact "no PIC, nobody can
--       write" trap migration 006 already made visible in the UI, just
--       one step removed.
--
--       workflow.list_unlinked_accounts() — Brief §2.4, the unlinked-
--       account queue. Reads auth.users, which no runtime code in this
--       app has ever done (every prior migration's "no psql/DATABASE_URL
--       access" note is about THIS SESSION authoring migrations, not
--       about the app itself — the app's own Supabase clients have only
--       ever held the anon key). SECURITY DEFINER lets this run with the
--       migration owner's read access to auth.users (the same access
--       migration 006's dev-seed backfill already demonstrated works,
--       applied to prod) without adding a service-role key or admin
--       client to the app for the first time. "Unlinked" is read
--       literally per Brief §2.4 — no workflow.members row AT ALL, not
--       filtered by is_active — so a DEACTIVATED member (a row exists,
--       just inactive) correctly does NOT reappear in this queue.
--       Reactivating a deactivated member is a different action this
--       brief does not ask for and this function does not provide;
--       flagged in the Result as a related gap, not fixed here.
--
-- Wrapped in one transaction, matching every migration in this project.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- PART 1 — WRITE POLICIES, PIC-OF-THE-PROJECT ONLY, NO MANAGER BYPASS.
-- -----------------------------------------------------------------------------

-- 1a. workflow.project_floors — project_id directly.

drop policy if exists project_floors_insert on workflow.project_floors;
create policy project_floors_insert on workflow.project_floors
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_floors_update on workflow.project_floors;
create policy project_floors_update on workflow.project_floors
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_floors_delete on workflow.project_floors;
create policy project_floors_delete on workflow.project_floors
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- 1b. workflow.shop_drawing_items — project_id directly (always set, even
--     for floor-scoped rows — migration 008's own denormalization).

drop policy if exists shop_drawing_items_insert on workflow.shop_drawing_items;
create policy shop_drawing_items_insert on workflow.shop_drawing_items
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_items_update on workflow.shop_drawing_items;
create policy shop_drawing_items_update on workflow.shop_drawing_items
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_items_delete on workflow.shop_drawing_items;
create policy shop_drawing_items_delete on workflow.shop_drawing_items
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- 1c. workflow.floor_sub_stages — floor_id -> project_floors.project_id.
--     Matches this table's OWN select policy's join shape (migration 008).

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

-- 1d. workflow.qc_inspections — project_id directly.

drop policy if exists qc_inspections_insert on workflow.qc_inspections;
create policy qc_inspections_insert on workflow.qc_inspections
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = qc_inspections.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists qc_inspections_update on workflow.qc_inspections;
create policy qc_inspections_update on workflow.qc_inspections
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = qc_inspections.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = qc_inspections.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists qc_inspections_delete on workflow.qc_inspections;
create policy qc_inspections_delete on workflow.qc_inspections
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = qc_inspections.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- 1e. workflow.qc_inspection_floors — qc_inspection_id ->
--     qc_inspections.project_id. Matches this table's OWN select policy
--     (migration 008), which already chose this path over floor_id.

drop policy if exists qc_inspection_floors_insert on workflow.qc_inspection_floors;
create policy qc_inspection_floors_insert on workflow.qc_inspection_floors
  for insert with check (
    exists (
      select 1 from workflow.qc_inspections qi
      join workflow.projects p on p.id = qi.project_id
      where qi.id = qc_inspection_floors.qc_inspection_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists qc_inspection_floors_update on workflow.qc_inspection_floors;
create policy qc_inspection_floors_update on workflow.qc_inspection_floors
  for update using (
    exists (
      select 1 from workflow.qc_inspections qi
      join workflow.projects p on p.id = qi.project_id
      where qi.id = qc_inspection_floors.qc_inspection_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.qc_inspections qi
      join workflow.projects p on p.id = qi.project_id
      where qi.id = qc_inspection_floors.qc_inspection_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists qc_inspection_floors_delete on workflow.qc_inspection_floors;
create policy qc_inspection_floors_delete on workflow.qc_inspection_floors
  for delete using (
    exists (
      select 1 from workflow.qc_inspections qi
      join workflow.projects p on p.id = qi.project_id
      where qi.id = qc_inspection_floors.qc_inspection_id
        and p.pic_id = (select auth.uid())
    )
  );

-- 1f. workflow.project_handover_items — project_id directly.

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

-- -----------------------------------------------------------------------------
-- PART 2 — THE DELETE GRANT GAP (see header). INSERT/UPDATE already cover
-- every workflow table via migration 002's blanket grant; DELETE never
-- has, anywhere, until now, and only for these six tables.
-- -----------------------------------------------------------------------------

grant delete on
  workflow.project_floors,
  workflow.shop_drawing_items,
  workflow.floor_sub_stages,
  workflow.qc_inspections,
  workflow.qc_inspection_floors,
  workflow.project_handover_items
to authenticated;

-- -----------------------------------------------------------------------------
-- PART 3 — TWO SECURITY DEFINER FUNCTIONS (see header for why these exist
-- instead of a raw RLS policy or a service-role client).
-- -----------------------------------------------------------------------------

create or replace function workflow.assign_project_pic(p_project_id uuid, p_new_pic_id uuid)
returns void
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if not workflow.is_manager() then
    raise exception 'Only a manager or admin may assign a project''s PIC.';
  end if;

  if p_new_pic_id is null then
    raise exception 'A PIC must be a specific person — use a different action to unassign.';
  end if;

  if not exists (
    select 1 from workflow.members m
    where m.user_id = p_new_pic_id and m.is_active
  ) then
    raise exception 'The selected person is not an active member and cannot be made PIC.';
  end if;

  if not exists (select 1 from workflow.projects where id = p_project_id) then
    raise exception 'No such project.';
  end if;

  update workflow.projects
  set pic_id = p_new_pic_id,
      updated_at = now()
  where id = p_project_id;
end;
$$;

comment on function workflow.assign_project_pic(uuid, uuid) is
  'Brief 012 §3 — the ONLY write path to workflow.projects.pic_id from the
   app (that table has had no UPDATE policy since migration 003).
   SECURITY DEFINER, manager/admin only, checked internally. Updates
   exactly pic_id and updated_at — deliberately narrower than a raw RLS
   UPDATE policy would be, which would let a manager rewrite any column
   on any project. Refuses a target who is not an active member so
   assigning an unlinked/deactivated account cannot silently recreate the
   "no PIC, nobody can write" trap migration 006 already surfaces in the
   UI as the amber badge.';

create or replace function workflow.list_unlinked_accounts()
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if not workflow.is_manager() then
    raise exception 'Only a manager or admin may view unlinked accounts.';
  end if;

  return query
  select u.id, u.email::text, u.created_at
  from auth.users u
  where not exists (
    select 1 from workflow.members m where m.user_id = u.id
  )
  order by u.created_at asc;
end;
$$;

comment on function workflow.list_unlinked_accounts() is
  'Brief 012 §2.4 — the unlinked-account queue. Reads auth.users (the
   first runtime read of that table this app has ever done), SECURITY
   DEFINER so the app needs no service-role key to see it, manager/admin
   only checked internally. "Unlinked" means literally no workflow.
   members row at all, active or inactive — a deactivated member (a row
   exists, just is_active = false) does NOT reappear here; reactivating
   one is a different, unbuilt action, flagged in the Result as a related
   gap this brief does not close.';

commit;
