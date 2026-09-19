-- =============================================================================
-- ADTECH Workflow Tracker — Migration 022: team-based write access
-- Brief: ADTECH_WF_Brief_050_Migration_021_Rollback_Test_Screen_6a_Cleanup_And_Team_Write_Access §C
--
-- PRECONDITION, CONFIRMED FIRST PER THE BRIEF'S OWN INSTRUCTION ("confirm
-- how project-to-team-member assignment currently works... if no
-- per-project, per-team assignment mechanism currently exists, stop and
-- flag rather than inventing one silently"): NO per-project team roster
-- exists anywhere in this schema, and NONE IS NEEDED — confirmed by
-- reading migrations 001, 014, and 017 directly, not assumed. workflow.
-- members.team_id is a single, GLOBAL team assignment per person (migration
-- 001); workflow.current_team() (migration 001, SECURITY DEFINER) resolves
-- it for the caller. Two team-keyed write policies already exist in this
-- exact shape: migration 014 (procurement_lines, "any active member of
-- either procurement team... no per-project assignment") and migration 017
-- (qc_inspections/qc_inspection_floors, "any ACTIVE member of the QC
-- team... no per-project assignment, no QC 'PIC'" — Brief 007 Amendment A
-- §3.1's own words, quoted in that migration's header). Both are
-- DELIBERATE, already-shipped precedents for "team-wide, not per-project"
-- access in this schema, not incidental. This migration extends the SAME
-- established pattern to the three surfaces that don't have it yet — it
-- does not invent a new mechanism, and none was needed.
--
-- "Project team" (the brief's own phrase) is mapped to workflow.teams.code
-- = 'project_management' — the only plausible match among the twelve
-- seeded team codes (migration 001: sales, tender, a_and_a, finance,
-- procurement_local, procurement_overseas, logistics, qs,
-- project_management, tnc, shop_drawing, qc). No team is literally named
-- "installation" or "project." Flagged here as a confirmed INTERPRETATION,
-- not a guess at something that could be checked directly — there is no
-- more precise mapping to check against.
--
-- WHAT ALREADY EXISTED, NOT REBUILT (confirmed by reading live, not
-- assumed unchanged):
--   - Procurement team -> procurement_lines (status + delivery, same
--     table/rows): FULLY DONE by migration 014. No RLS change here.
--   - QC team -> qc_inspections/qc_inspection_floors (inspections):
--     FULLY DONE by migration 017, including its own actor column
--     (qc_inspections.inspector_id, migration 008). No RLS change here.
--
-- WHAT THIS MIGRATION ACTUALLY CHANGES, matching migration 014/017's own
-- "replace PIC-keyed with team-keyed, quote the old text, no delete
-- recreated" convention exactly:
--
--   1. workflow.floor_sub_stages (Project team -> installation,
--      TNC team -> TNC) — SPLIT BY STAGE. This one table holds BOTH
--      installation sub-stages (first_fix/second_fix/third_fix) and TNC
--      sub-stages (pre_commissioning/commissioning), distinguished by its
--      own `stage` column (migration 008) — so the write policy is
--      STAGE-CONDITIONAL, not a flat table-wide team swap: an
--      installation-stage row requires the Project team, a tnc-stage row
--      requires the TNC team. Quoted verbatim, the PIC-keyed policies this
--      replaces (migration 009, unchanged until now):
--
--        -- floor_sub_stages_insert
--        create policy floor_sub_stages_insert on workflow.floor_sub_stages
--          for insert with check (
--            exists (
--              select 1 from workflow.project_floors f
--              join workflow.projects p on p.id = f.project_id
--              where f.id = floor_sub_stages.floor_id
--                and p.pic_id = (select auth.uid())
--            )
--          );
--
--        -- floor_sub_stages_update (using + with check, same shape)
--        -- floor_sub_stages_delete (using, same shape)
--
--   2. workflow.project_handover_items (QC team -> handover) — FLAT team
--      swap, no stage conditional needed (this table has no stage
--      column). Quoted verbatim, replaced:
--
--        -- project_handover_items_insert
--        create policy project_handover_items_insert on workflow.project_handover_items
--          for insert with check (
--            exists (
--              select 1 from workflow.projects p
--              where p.id = project_handover_items.project_id
--                and p.pic_id = (select auth.uid())
--            )
--          );
--
--        -- project_handover_items_update (using + with check, same shape)
--        -- project_handover_items_delete (using, same shape)
--
--   3. workflow.shop_drawing_boq_lines / shop_drawing_boq_line_locations
--      (Shop Drawing / A&A team -> Shop Drawing BOQ) — this pair has NO
--      PIC-keyed policy to replace (migration 018 shipped them SELECT-only;
--      migration 019 later added TEMPORARY superadmin-only INSERT/UPDATE/
--      DELETE, Brief 040). Matching migration 020's own precedent for the
--      identical situation on contract_boq_lines exactly: the team
--      condition is ORed into the existing superadmin-only policies, which
--      are KEPT, not removed — Brief 040's testing aid is a separate,
--      still-live concern. This directly resolves Result 048's own
--      blocker: Shop Drawing BOQ import cannot be built until this tier
--      has real, non-superadmin write access.
--
--   NO DELETE POLICY IS RECREATED for floor_sub_stages or
--   project_handover_items — matches migrations 014/017's own identical
--   precedent for every PIC-to-team conversion in this schema so far ("no
--   delete policy is added; RLS default-denies it"). The existing blanket
--   DELETE grant to `authenticated` (migration 009, covering both tables
--   among others) is NOT revoked — revoking it would also strip the other
--   still-PIC-keyed tables covered by that same grant of their underlying
--   privilege, out of scope here; it simply becomes INERT for these two
--   tables the instant their delete policy is dropped, the exact "a GRANT
--   is not a policy" relationship migration 017's own header already
--   documented for this identical situation.
--
-- ACTOR COLUMNS, per the brief's own explicit requirement ("every insert/
-- update made under team-wide access must still record WHO made it... same
-- convention as progress_updates.author_id... so the individual can always
-- be identified, even though the grant is team-wide"). CONFIRMED FIRST,
-- not assumed, which tables already have one:
--   - qc_inspections.inspector_id (migration 008) — ALREADY EXISTS, no
--     change.
--   - procurement_lines — NO actor column exists (confirmed: migration 001
--     defined it, migration 015 added description/assigned_to, neither is
--     a per-write actor column — assigned_to is WHO IS DOING the work, a
--     different concept from who made a specific write). Added below even
--     though this migration makes no RLS change to procurement_lines,
--     since team-wide write access already exists there (migration 014)
--     and the brief's own audit requirement is not conditional on this
--     round also touching the policy.
--   - floor_sub_stages, project_handover_items — NO actor column on
--     either (migration 008's original shape). Added below.
--   - shop_drawing_boq_lines — NO actor column (migration 018). Added
--     below. shop_drawing_boq_line_locations is NOT given one — it is a
--     composite-PK join table with no surrogate id, the same shape as
--     tender_boq_line_locations and contract_boq_line_locations, NEITHER
--     of which carries an actor column either (confirmed by reading both
--     directly) — consistent, not an oversight.
--   Column name: `updated_by`, not a literal "author_id" — matches each
--   table's own existing `updated_at` sibling exactly (this schema's own
--   established naming pairing), and these columns are set on every
--   insert AND update (unlike progress_updates.author_id, which is
--   insert-only by that table's own append-only design) — "updated_by"
--   reads correctly for both cases where "author_id" would not.
--   NULLABLE on every table: existing rows have no value to backfill
--   truthfully, and inventing one would misattribute historical writes
--   that predate this column — the same "don't guess a backfill" reasoning
--   migration 015 already applied to procurement_lines.description's own
--   NOT NULL decision.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.floor_sub_stages — stage-conditional team write access.
-- -----------------------------------------------------------------------------

alter table workflow.floor_sub_stages
  add column updated_by uuid references public.user_profiles (id) on delete restrict;

comment on column workflow.floor_sub_stages.updated_by is
  'Migration 022 / Brief 050 §C. Who made the most recent insert or update
   — required once write access here became team-wide rather than
   PIC-keyed, so a specific individual can still be identified on review.
   Nullable: rows written before this column existed have no true value to
   backfill.';

drop policy if exists floor_sub_stages_insert on workflow.floor_sub_stages;
drop policy if exists floor_sub_stages_update on workflow.floor_sub_stages;
drop policy if exists floor_sub_stages_delete on workflow.floor_sub_stages;

create policy floor_sub_stages_insert on workflow.floor_sub_stages
  for insert with check (
    (stage = 'installation' and workflow.current_team() = 'project_management')
    or
    (stage = 'tnc' and workflow.current_team() = 'tnc')
  );

comment on policy floor_sub_stages_insert on workflow.floor_sub_stages is
  'Migration 022 / Brief 050 §C. Team-keyed, STAGE-CONDITIONAL, not
   PIC-keyed: an installation-stage row (first_fix/second_fix/third_fix)
   requires the Project team (workflow.teams.code = ''project_management'');
   a tnc-stage row (pre_commissioning/commissioning) requires the TNC team
   (code = ''tnc''). No manager bypass, matching every team-keyed policy in
   this schema (migrations 014/017). Replaces this policy''s prior
   PIC-keyed text (migration 009) — quoted verbatim in this migration''s
   own header.';

create policy floor_sub_stages_update on workflow.floor_sub_stages
  for update using (
    (stage = 'installation' and workflow.current_team() = 'project_management')
    or
    (stage = 'tnc' and workflow.current_team() = 'tnc')
  ) with check (
    (stage = 'installation' and workflow.current_team() = 'project_management')
    or
    (stage = 'tnc' and workflow.current_team() = 'tnc')
  );

comment on policy floor_sub_stages_update on workflow.floor_sub_stages is
  'Same stage-conditional team rule as floor_sub_stages_insert, both
   directions — Brief 050 §C. Replaces this policy''s prior PIC-keyed text
   (migration 009) — quoted verbatim in this migration''s own header.';

-- No floor_sub_stages_delete recreated — matches migrations 014/017's own
-- precedent for every PIC-to-team conversion in this schema. The existing
-- DELETE grant (migration 009) becomes inert for this table; not revoked
-- (see this file's own header).

-- -----------------------------------------------------------------------------
-- 2. workflow.project_handover_items — QC team write access.
-- -----------------------------------------------------------------------------

alter table workflow.project_handover_items
  add column updated_by uuid references public.user_profiles (id) on delete restrict;

comment on column workflow.project_handover_items.updated_by is
  'Migration 022 / Brief 050 §C. Same reasoning as floor_sub_stages.
   updated_by — see that column''s own comment.';

drop policy if exists project_handover_items_insert on workflow.project_handover_items;
drop policy if exists project_handover_items_update on workflow.project_handover_items;
drop policy if exists project_handover_items_delete on workflow.project_handover_items;

create policy project_handover_items_insert on workflow.project_handover_items
  for insert with check (
    workflow.current_team() = 'qc'
  );

comment on policy project_handover_items_insert on workflow.project_handover_items is
  'Migration 022 / Brief 050 §C. Team-keyed (QC team, workflow.teams.code
   = ''qc''), not PIC-keyed — same shape as qc_inspections_insert
   (migration 017). No manager bypass. Replaces this policy''s prior
   PIC-keyed text (migration 009) — quoted verbatim in this migration''s
   own header.';

create policy project_handover_items_update on workflow.project_handover_items
  for update using (
    workflow.current_team() = 'qc'
  ) with check (
    workflow.current_team() = 'qc'
  );

comment on policy project_handover_items_update on workflow.project_handover_items is
  'Same team rule as project_handover_items_insert, both directions —
   Brief 050 §C. Replaces this policy''s prior PIC-keyed text (migration
   009) — quoted verbatim in this migration''s own header.';

-- No project_handover_items_delete recreated — same precedent as §1 above.

-- -----------------------------------------------------------------------------
-- 3. workflow.shop_drawing_boq_lines / shop_drawing_boq_line_locations —
--    Shop Drawing / A&A team write access, ORed alongside the existing
--    TEMPORARY superadmin bypass (migration 019), not replacing it —
--    mirrors migration 020's own precedent for contract_boq_lines exactly.
-- -----------------------------------------------------------------------------

alter table workflow.shop_drawing_boq_lines
  add column updated_by uuid references public.user_profiles (id) on delete restrict;

comment on column workflow.shop_drawing_boq_lines.updated_by is
  'Migration 022 / Brief 050 §C. Same reasoning as floor_sub_stages.
   updated_by — see that column''s own comment. shop_drawing_boq_line_
   locations deliberately does NOT get one — composite-PK join table, the
   same shape (and the same lack of an actor column) as tender_boq_line_
   locations and contract_boq_line_locations.';

drop policy if exists shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines;
create policy shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines
  for insert with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

drop policy if exists shop_drawing_boq_lines_update on workflow.shop_drawing_boq_lines;
create policy shop_drawing_boq_lines_update on workflow.shop_drawing_boq_lines
  for update using (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

drop policy if exists shop_drawing_boq_lines_delete on workflow.shop_drawing_boq_lines;
create policy shop_drawing_boq_lines_delete on workflow.shop_drawing_boq_lines
  for delete using (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

comment on policy shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines is
  'Migration 022 / Brief 050 §C. Real write access, Shop Drawing OR A&A
   team (workflow.teams.code in (''shop_drawing'', ''a_and_a'')), ORed
   alongside migration 019''s existing TEMPORARY superadmin bypass (kept,
   not removed). Directly resolves Result 048''s own blocker — Shop
   Drawing BOQ import could not be built while this tier had only
   superadmin-only write access.';

drop policy if exists shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations;
create policy shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations
  for insert with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

drop policy if exists shop_drawing_boq_line_locations_update on workflow.shop_drawing_boq_line_locations;
create policy shop_drawing_boq_line_locations_update on workflow.shop_drawing_boq_line_locations
  for update using (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

drop policy if exists shop_drawing_boq_line_locations_delete on workflow.shop_drawing_boq_line_locations;
create policy shop_drawing_boq_line_locations_delete on workflow.shop_drawing_boq_line_locations
  for delete using (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
  );

comment on policy shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations is
  'Migration 022 / Brief 050 §C. Same team-OR-superadmin rule as
   shop_drawing_boq_lines_insert — see that policy''s own comment.';

-- -----------------------------------------------------------------------------
-- 4. workflow.procurement_lines — actor column only. Write access is
--    ALREADY team-keyed (migration 014); no RLS change here.
-- -----------------------------------------------------------------------------

alter table workflow.procurement_lines
  add column updated_by uuid references public.user_profiles (id) on delete restrict;

comment on column workflow.procurement_lines.updated_by is
  'Migration 022 / Brief 050 §C. Same reasoning as floor_sub_stages.
   updated_by — see that column''s own comment. procurement_lines'' own
   write policy (migration 014) already covers this table''s Procurement-
   team access in full; this column only closes the actor-tracking gap
   the brief''s own audit requirement named — no RLS change was needed or
   made here. No app-layer write action populates this column yet
   (screen 2c is read-only, confirmed directly) — ready for whenever one
   is built.';

commit;
