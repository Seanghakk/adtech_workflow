-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 017
-- Brief: ADTECH_WF_Brief_024_Floor_Sub_Stage_UI_And_QC_Role §4/§5
--
-- REQUIRED before migration 017 is applied to prod, per this repo's own
-- standing process (see migrations 009-014's own rollback files): run this
-- against a non-production target that already carries migrations
-- 001-016 first (Seanghakk runs it — this session has no psql/
-- DATABASE_URL/SQL-editor access).
--
-- Restores the exact six PIC-keyed policies migration 017 dropped,
-- verbatim from migration 009's own text (also quoted in migration 017's
-- header) — not approximated. Does not touch qc_inspections_select /
-- qc_inspection_floors_select (migration 008, untouched by migration 017)
-- and does not touch workflow.current_team() (migration 001's own helper,
-- reused, not modified).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop policy if exists qc_inspections_insert on workflow.qc_inspections;
drop policy if exists qc_inspections_update on workflow.qc_inspections;

create policy qc_inspections_insert on workflow.qc_inspections
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = qc_inspections.project_id
        and p.pic_id = (select auth.uid())
    )
  );

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

create policy qc_inspections_delete on workflow.qc_inspections
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = qc_inspections.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists qc_inspection_floors_insert on workflow.qc_inspection_floors;
drop policy if exists qc_inspection_floors_update on workflow.qc_inspection_floors;

create policy qc_inspection_floors_insert on workflow.qc_inspection_floors
  for insert with check (
    exists (
      select 1 from workflow.qc_inspections qi
      join workflow.projects p on p.id = qi.project_id
      where qi.id = qc_inspection_floors.qc_inspection_id
        and p.pic_id = (select auth.uid())
    )
  );

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

create policy qc_inspection_floors_delete on workflow.qc_inspection_floors
  for delete using (
    exists (
      select 1 from workflow.qc_inspections qi
      join workflow.projects p on p.id = qi.project_id
      where qi.id = qc_inspection_floors.qc_inspection_id
        and p.pic_id = (select auth.uid())
    )
  );

commit;
