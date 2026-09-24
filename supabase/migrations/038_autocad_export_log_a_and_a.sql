-- =============================================================================
-- ADTECH Workflow Tracker — Migration 038: A&A may run the AutoCAD export
-- Brief: ADTECH_WF_Brief_100 Part A, amended 24 Sep 2026
--
-- DECIDED 24 Sep 2026 by Seanghakk: running the export is the same work as
-- importing the shop drawing BOQ, which A&A can already do. The export log's
-- policies (migration 033) named workflow.shop_drawing alone, so an A&A
-- member was refused — Brief 100 Part A surfaced that rather than widening
-- the rule in application code, and this is the deliberate policy change
-- that follows.
--
-- IN A NEW MIGRATION, not an amendment to 033, because 033 is already
-- applied to production — checked directly. Brief 099 amended migration 037
-- in place for the opposite reason: that one had never been applied.
--
-- The rule now matches workflow.shop_drawing_boq_lines' own team clause
-- exactly, which is the point: one team list for shop drawing work, written
-- the same way in both places.
--   before: is_superadmin() OR current_team() = 'shop_drawing' OR PIC
--   after : is_superadmin() OR current_team() IN ('shop_drawing','a_and_a') OR PIC
--
-- Nothing else about the table changes: same columns, same grants, and the
-- log stays append-only (no UPDATE or DELETE policy, by design).
-- =============================================================================

begin;

drop policy if exists autocad_export_log_select on workflow.autocad_export_log;
create policy autocad_export_log_select on workflow.autocad_export_log
  for select using (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['shop_drawing', 'a_and_a'])
    or exists (
      select 1 from workflow.projects p
      where p.id = autocad_export_log.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists autocad_export_log_insert on workflow.autocad_export_log;
create policy autocad_export_log_insert on workflow.autocad_export_log
  for insert with check (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['shop_drawing', 'a_and_a'])
    or exists (
      select 1 from workflow.projects p
      where p.id = autocad_export_log.project_id
        and p.pic_id = (select auth.uid())
    )
  );

comment on table workflow.autocad_export_log is
  'Brief 096 §5 (migration 033); read/write rule widened by Brief 100 Part A
   (migration 038). Append-only record of every AutoCAD Sheet Set export:
   when, who, and the snapshot sent, so v7.2 §8.4''s "changed since" can be
   computed against the previous export. Who may read and write it: the
   project''s PIC, the Shop Drawing team, the A&A team, or a superadmin —
   the same team list workflow.shop_drawing_boq_lines uses, because running
   the export is the same work as importing that BOQ. No UPDATE or DELETE
   policy: an export that happened cannot be unhappened.';

commit;
