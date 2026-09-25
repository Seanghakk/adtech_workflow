-- Brief 102 — the missing creation path for shop drawings.
--
-- Two changes, both on workflow.shop_drawing_items.
--
-- 1. WIDEN THE INSERT POLICY so the Shop Drawing and A&A teams may
--    create a drawing, alongside the PIC and superadmins.
--
--    This is the same oversight pattern found twice already — the Tender
--    team with no write on its own BOQ tier (Brief 099) and A&A missing
--    from the export (Brief 100 Part A, migration 038). Here it is
--    visible inside this one table: the UPDATE policy has carried
--        workflow.current_team() = any (array['shop_drawing','a_and_a'])
--    since migration 022, so those two teams can already move a drawing
--    through its whole lifecycle — draft it, check it, submit it, record
--    a return — but could not create one. Nothing in the app could:
--    rows only ever appeared from the floor trigger, two per floor, and
--    project-level drawings (the system schematics and the typical /
--    section drawings) had no creation path at all.
--
--    WIDENED, NOT REPLACED. Superadmins and the project's PIC keep
--    exactly what they had; the team clause is added to it. It is
--    written to match workflow.shop_drawing_boq_lines' own INSERT clause
--    character for character, so the two read the same way:
--        workflow.is_superadmin()
--          or workflow.current_team() = any (array['shop_drawing','a_and_a'])
--    which also makes this table's INSERT and UPDATE policies identical
--    in shape, as they should have been from the start.
--
--    A policy cannot be amended in place, and this one is already on
--    production, so it is dropped and recreated rather than altered.
--
-- 2. ADD created_by, nullable, NO BACKFILL. v7.2 §21.4 asks a drawing
--    row to read "added <date> by <name>" and Brief 100 Part B could
--    only ever render the date, because the column did not exist.
--    Existing rows keep a NULL: they were created by a database trigger
--    before anyone was recorded, and there is no honest value to invent
--    for them. The screen says so in words rather than printing
--    "by unknown".
--
-- Applied to rollback-test first and proved BOTH ways there (see
-- supabase/verification/039_..._behavioural.sql): with the old policy
-- temporarily restored inside a transaction an A&A member is refused,
-- and with the new one the same member is allowed.

begin;

-- 1 ------------------------------------------------------------------
drop policy if exists shop_drawing_items_insert on workflow.shop_drawing_items;

create policy shop_drawing_items_insert on workflow.shop_drawing_items
  for insert
  with check (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['shop_drawing'::text, 'a_and_a'::text])
    or exists (
      select 1
      from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

comment on policy shop_drawing_items_insert on workflow.shop_drawing_items is
  'Brief 102 — superadmin, the Shop Drawing and A&A teams, or the project''s PIC. The team clause matches shop_drawing_boq_lines_insert and this table''s own UPDATE policy exactly.';

-- 2 ------------------------------------------------------------------
alter table workflow.shop_drawing_items
  add column if not exists created_by uuid references user_profiles(id) on delete restrict;

comment on column workflow.shop_drawing_items.created_by is
  'Brief 102 — who added this drawing through the app. NULL on every row that predates this migration, and on anything the floor trigger seeds: those were not created by a person and no value is invented for them. v7.2 §21.4''s "added <date> by <name>".';

commit;
