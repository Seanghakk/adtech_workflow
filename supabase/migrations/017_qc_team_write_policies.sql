-- =============================================================================
-- ADTECH Workflow Tracker — Migration 017: QC writes its own inspections
-- Brief: ADTECH_WF_Brief_024_Floor_Sub_Stage_UI_And_QC_Role §4/§5
--
-- CONFIRMED AGAINST THE LIVE REPO FIRST, NOT ASSUMED: main is 9e69ef3
-- (Migration 015: procurement line identity/owner/floors, Brief 022, PR
-- #15) at the start of this round. Migration 016 is ALREADY TAKEN by a
-- different, still-open, unmerged PR (#16, screens-1c-1e-triage-and-
-- request-detail, Brief 021) — confirmed via `gh pr list` before writing
-- this file, same numbering-collision discipline every round since Brief
-- 019 has had to apply. This migration does not depend on 016's content
-- either way (016 touches workflow.requests only). Branched off origin/
-- main directly, not off PR #16's branch.
--
-- No psql/DATABASE_URL/SQL-editor access this session — the same standing
-- limitation every migration round in this repo has documented since
-- Brief 001. This file is paste-ready for the Supabase SQL editor, applied
-- BY HAND, and NOT applied by this session to anything, prod or otherwise.
-- The rollback (017_qc_team_write_policies_rollback.sql) is meant to be
-- tested FIRST against a non-production target before this is applied to
-- prod, per this repo's own standing process (rollback-test project
-- carrying migrations 001-016) — this session could not run that test
-- either, for the same reason.
--
-- WHAT THIS MIGRATION DOES, exactly per brief §4/§5, no more:
--
--   Brief §4.1's confirmed decision: any ACTIVE member of the QC team may
--   record an inspection on any project — no per-project assignment, no QC
--   "PIC". Brief §4.2 asked this round to check whether that is already
--   mostly built before inventing anything: workflow.teams already carries
--   a seeded 'qc' row (migration 001, code = 'qc', label 'QC', sort_order
--   120), and workflow.members already associates exactly one team per
--   member via team_id (unique (org_id, user_id) — one row per person,
--   migration 001). workflow.current_team() (migration 001, SECURITY
--   DEFINER) already resolves the caller's own team code from that
--   association. Brief §4.3's condition is therefore ALREADY SATISFIED —
--   no new team, role, login flow, or membership infrastructure is built
--   here, exactly as §4.3/§4.4 instruct. A QC person is simply a
--   workflow.members row with team = QC, the same shared login every
--   other member already has.
--
--   Brief §4.5 is explicit that PIC-gating is the WRONG shape for QC
--   inspection writes ("QC's soft-gate role is independent of PIC... QC
--   [is] a distinct team from engineering"). Migration 009 gave
--   workflow.qc_inspections and workflow.qc_inspection_floors PIC-keyED
--   INSERT/UPDATE/DELETE policies (via a join through projects.pic_id) —
--   the same shape it gave every other migration-008 table, written before
--   this brief existed to answer who QC actually is. All six of those
--   policies are dropped below and quoted verbatim first (same convention
--   migration 008 used for bump_last_meaningful_movement — the diff is
--   inspectable without cross-referencing migration 009's own file):
--
--     -- qc_inspections_insert
--     create policy qc_inspections_insert on workflow.qc_inspections
--       for insert with check (
--         exists (
--           select 1 from workflow.projects p
--           where p.id = qc_inspections.project_id
--             and p.pic_id = (select auth.uid())
--         )
--       );
--
--     -- qc_inspections_update
--     create policy qc_inspections_update on workflow.qc_inspections
--       for update using (
--         exists (
--           select 1 from workflow.projects p
--           where p.id = qc_inspections.project_id
--             and p.pic_id = (select auth.uid())
--         )
--       ) with check (
--         exists (
--           select 1 from workflow.projects p
--           where p.id = qc_inspections.project_id
--             and p.pic_id = (select auth.uid())
--         )
--       );
--
--     -- qc_inspections_delete
--     create policy qc_inspections_delete on workflow.qc_inspections
--       for delete using (
--         exists (
--           select 1 from workflow.projects p
--           where p.id = qc_inspections.project_id
--             and p.pic_id = (select auth.uid())
--         )
--       );
--
--     -- qc_inspection_floors_insert
--     create policy qc_inspection_floors_insert on workflow.qc_inspection_floors
--       for insert with check (
--         exists (
--           select 1 from workflow.qc_inspections qi
--           join workflow.projects p on p.id = qi.project_id
--           where qi.id = qc_inspection_floors.qc_inspection_id
--             and p.pic_id = (select auth.uid())
--         )
--       );
--
--     -- qc_inspection_floors_update
--     create policy qc_inspection_floors_update on workflow.qc_inspection_floors
--       for update using (
--         exists (
--           select 1 from workflow.qc_inspections qi
--           join workflow.projects p on p.id = qi.project_id
--           where qi.id = qc_inspection_floors.qc_inspection_id
--             and p.pic_id = (select auth.uid())
--         )
--       ) with check (
--         exists (
--           select 1 from workflow.qc_inspections qi
--           join workflow.projects p on p.id = qi.project_id
--           where qi.id = qc_inspection_floors.qc_inspection_id
--             and p.pic_id = (select auth.uid())
--         )
--       );
--
--     -- qc_inspection_floors_delete
--     create policy qc_inspection_floors_delete on workflow.qc_inspection_floors
--       for delete using (
--         exists (
--           select 1 from workflow.qc_inspections qi
--           join workflow.projects p on p.id = qi.project_id
--           where qi.id = qc_inspection_floors.qc_inspection_id
--             and p.pic_id = (select auth.uid())
--         )
--       );
--
--   Replaced with INSERT and UPDATE only, keyed on team membership rather
--   than PIC-of-the-project — mirroring migration 014's procurement_lines_
--   insert/update shape exactly (Brief §4.3's own instruction: "read that
--   policy live and mirror its structure rather than designing a new
--   one"). Unlike the PIC-keyed policies above, no join is needed at all:
--   team membership does not depend on which row is being written, so the
--   new policies are simpler than what they replace, not just different.
--
--   NO DELETE POLICY IS RECREATED — matches migration 014's own precedent
--   for procurement_lines exactly ("no delete policy is added; RLS
--   default-denies it, same convention as everywhere else"). Migration
--   009's Part 2 granted DELETE on workflow.qc_inspections and workflow.
--   qc_inspection_floors (along with four other migration-008 tables) to
--   `authenticated` as a single blanket grant across all six tables — that
--   GRANT is not revoked here (revoking it would also strip the four
--   OTHER tables' still-valid PIC-keyed delete policies of their
--   underlying privilege, which is out of this round's scope). The grant
--   simply becomes INERT for these two tables the moment their delete
--   policy is dropped: a GRANT is the SQL-level privilege, RLS is what
--   actually filters rows per command, and a table with RLS enabled and
--   zero policies for a given command admits no rows for that command
--   regardless of what has been granted — the exact "policies FILTER a
--   grant, they do not create one" relationship this project's own
--   standing traps list already names. Confirmed explicitly in the
--   verification file below (block 2) rather than left implicit.
--
--   SELECT IS UNCHANGED on both tables — still migration 008's is_member()
--   + can_view_project() join, covering every role including QC. Only
--   writing changes here; reading a project's QC record already follows
--   normal project visibility and needed no adjustment.
--
--   NOTHING ELSE IN THIS SCHEMA IS TOUCHED. Brief §2.2 is explicit that
--   who may write a floor's sub-stage status does NOT change this round
--   ("do not change who can write sub-stage status in this round unless
--   section 1's live read shows no write policy exists at all") — it does
--   exist (migration 009, PIC-keyed), so workflow.project_floors, workflow.
--   shop_drawing_items, workflow.floor_sub_stages, and workflow.
--   project_handover_items keep their migration-009 PIC-keyed policies
--   exactly as they stand. This is the ONE schema-adjacent change Brief
--   024 §5 authorises for this round.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- workflow.qc_inspections — drop the PIC-keyed policies quoted above,
-- replace INSERT/UPDATE with the team-keyed rule. No DELETE recreated.
-- -----------------------------------------------------------------------------

drop policy if exists qc_inspections_insert on workflow.qc_inspections;
drop policy if exists qc_inspections_update on workflow.qc_inspections;
drop policy if exists qc_inspections_delete on workflow.qc_inspections;

create policy qc_inspections_insert on workflow.qc_inspections
  for insert with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspections_insert on workflow.qc_inspections is
  'Team-keyed, NOT PIC-keyed — Brief 024 §4.1/§4.5. Any active member of
   the QC team (identified by workflow.teams.code = ''qc'', never by
   label, via workflow.current_team() — migration 001) may insert an
   inspection against any project. The project''s PIC is deliberately
   excluded: Brief 007 Amendment A §3.1 already established QC''s soft-gate
   role is independent of PIC. No manager bypass, matching migration
   014''s procurement_lines_insert precedent exactly. Replaces this
   policy''s prior PIC-keyed text (migration 009) — quoted verbatim in
   this migration''s own header for the diff.';

create policy qc_inspections_update on workflow.qc_inspections
  for update
  using (
    workflow.current_team() = 'qc'
  )
  with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspections_update on workflow.qc_inspections is
  'Same team-keyed rule as qc_inspections_insert, both directions — Brief
   024 §4.1/§4.5. Replaces this policy''s prior PIC-keyed text (migration
   009), quoted verbatim in this migration''s own header.';

-- No qc_inspections_delete policy is recreated (see header) — RLS
-- default-denies DELETE now that no policy admits it, matching migration
-- 014's own "no delete" precedent for procurement_lines.

-- -----------------------------------------------------------------------------
-- workflow.qc_inspection_floors — same replacement, same reasoning. No
-- join needed: team membership does not depend on which inspection or
-- floor is referenced.
-- -----------------------------------------------------------------------------

drop policy if exists qc_inspection_floors_insert on workflow.qc_inspection_floors;
drop policy if exists qc_inspection_floors_update on workflow.qc_inspection_floors;
drop policy if exists qc_inspection_floors_delete on workflow.qc_inspection_floors;

create policy qc_inspection_floors_insert on workflow.qc_inspection_floors
  for insert with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspection_floors_insert on workflow.qc_inspection_floors is
  'Team-keyed, NOT PIC-keyed — Brief 024 §4.1/§4.5, same rule as
   qc_inspections_insert. A material inspection commonly references
   several floors (Brief 007 Amendment §3.2); each qc_inspection_floors
   row it creates is gated the same way, independent of the join path
   its migration-008 SELECT policy uses. Replaces this policy''s prior
   PIC-keyed text (migration 009), quoted verbatim in this migration''s
   own header.';

create policy qc_inspection_floors_update on workflow.qc_inspection_floors
  for update
  using (
    workflow.current_team() = 'qc'
  )
  with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspection_floors_update on workflow.qc_inspection_floors is
  'Same team-keyed rule as qc_inspection_floors_insert, both directions —
   Brief 024 §4.1/§4.5. Replaces this policy''s prior PIC-keyed text
   (migration 009), quoted verbatim in this migration''s own header.';

-- No qc_inspection_floors_delete policy is recreated (see header) — RLS
-- default-denies DELETE now that no policy admits it.

commit;
