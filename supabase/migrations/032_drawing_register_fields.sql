-- =============================================================================
-- ADTECH Workflow Tracker — Migration 032: drawing register fields
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §3 item 4
--
-- CHECKED THE LIVE SCHEMA FIRST, against the actual source document
-- ("ADTECH Workflow to AutoCAD Sheet Set Field Mapping — Concept Note
-- Rev3" §3.2, read directly): of the title block's sheet-level fields —
--   REV        (revision)  -> workflow.shop_drawing_submissions.revision
--                             ALREADY EXISTS (migration 027).
--   CHECKEDBY  (checker)   -> workflow.shop_drawing_submissions.checked_by
--                             ALREADY EXISTS (migration 027) — "senior
--                             engineer who did the internal check."
--   STATUS     (A/B/C)     -> workflow.shop_drawing_submissions.code, plus
--                             workflow.shop_drawing_items.status ALREADY
--                             EXIST (migrations 008/027) — together they
--                             already carry the current approval state.
--   ISSUEDATE  (date of latest issue) -> workflow.shop_drawing_submissions.
--                             submitted_at ALREADY EXISTS (migration
--                             027) — the date a revision was issued to
--                             its reviewer is the honest "date of latest
--                             issue" this schema already records; no new
--                             column invented for a second reading of
--                             the same event.
-- NONE of these four are duplicated here, per §2's own instruction ("A
-- column that exists under another name is a naming decision to report,
-- not a duplicate to create").
--
-- GENUINELY MISSING, added below:
--   CREATEDBY (drafter)  — no column anywhere records who drafted a
--     drawing. New: shop_drawing_items.drafter_id.
--   APPROVEDBY (approver) — Concept Note §3.2 fixes this as "the Shop
--     Drawing Team Leader who approved the drawing for issue... per
--     drawing, from the register, so it stays correct if the leader
--     changes or delegates" — i.e. a real per-drawing person reference,
--     deliberately NOT hardcoded to whoever holds the Team Leader role
--     today (that would break the moment the role changes hands). New:
--     shop_drawing_items.approver_id. Distinct from checked_by (the
--     INTERNAL check, migration 027) — approval-for-issue is a separate
--     event/person per the Concept Note's own three-role split (drafter,
--     checker, approver).
--   Drawing number — no column anywhere. New: shop_drawing_items.
--     drawing_number, unique within a project where set. Deliberately NO
--     format CHECK constraint: Concept Note §4.4/§6.1's own "client-
--     imposed numbering wins for that project" means this column must
--     hold either the ADTECH-generated format or an arbitrary
--     client-supplied string — constraining its shape here would break
--     the override case the Concept Note itself requires.
--   Numbering mode, PER PROJECT (not per drawing) — no column anywhere.
--     New: workflow.projects.drawing_numbering_mode, 'adtech' | 'client'.
--     Nullable, no default: an existing project simply has not decided
--     yet, and the app layer (not this migration) is where "no decision
--     yet defaults to showing ADTECH-generated numbers" belongs — this
--     brief adds no UI/application logic, per §5.
-- =============================================================================

begin;

alter table workflow.shop_drawing_items
  add column if not exists drawing_number text,
  add column if not exists drafter_id uuid references public.user_profiles (id) on delete restrict,
  add column if not exists approver_id uuid references public.user_profiles (id) on delete restrict;

create unique index if not exists shop_drawing_items_drawing_number_per_project_key
  on workflow.shop_drawing_items (project_id, drawing_number)
  where drawing_number is not null;

comment on column workflow.shop_drawing_items.drawing_number is
  'DRAWINGNO (Concept Note Rev3 §3.2) — generated in the ADTECH format by
   default, or a client-imposed string when workflow.projects.
   drawing_numbering_mode = ''client'' (§4.4). No format CHECK constraint
   here on purpose — see this migration''s own header. Unique within a
   project where set (a partial unique index, so drawings left null never
   collide).';

comment on column workflow.shop_drawing_items.drafter_id is
  'CREATEDBY (Concept Note Rev3 §3.2) — who drafted this drawing. New;
   nothing in this schema recorded this before.';

comment on column workflow.shop_drawing_items.approver_id is
  'APPROVEDBY (Concept Note Rev3 §3.2) — the Shop Drawing Team Leader who
   approved THIS drawing for issue, recorded per drawing (not looked up
   from whoever holds the role today) so the title block stays correct
   if the Team Leader changes or delegates. Distinct from checked_by
   (workflow.shop_drawing_submissions, migration 027) — the internal
   check and the issue approval are separate people/events per the
   Concept Note''s own three-role split (drafter, checker, approver).';

alter table workflow.projects
  add column if not exists drawing_numbering_mode text;

alter table workflow.projects
  drop constraint if exists projects_drawing_numbering_mode_check;
alter table workflow.projects
  add constraint projects_drawing_numbering_mode_check
  check (drawing_numbering_mode is null or drawing_numbering_mode in ('adtech', 'client'));

comment on column workflow.projects.drawing_numbering_mode is
  'Concept Note Rev3 §4.4 — "where a consultant or main contractor
   imposes its own numbering, theirs wins for that project." ''adtech''
   = the app generates DRAWINGNO in its own ISO-structured format (§4.2);
   ''client'' = drawing_number is entered directly, per drawing, in
   whatever format the client/consultant imposes. Nullable, no default —
   an existing project has not decided yet; the app layer decides what
   "not yet decided" should look like, not this migration.';

commit;
