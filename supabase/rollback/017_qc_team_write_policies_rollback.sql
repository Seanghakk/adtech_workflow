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
-- AMENDED per ADTECH_WF_Brief_024_Amendment_A_Rollback_Fails_On_Unapplied_
-- State: the original version of this file CREATEd all six restored
-- policies unconditionally, which only succeeds if migration 017 already
-- dropped them first. Run against a database where migration 017 was
-- never applied (the state this file must also handle, per this repo's
-- own rollback-must-survive-every-state convention — same lesson as
-- migration 015's Amendment C, opposite direction: that one CREATEd
-- against a table that didn't exist yet, this one CREATEs a policy name
-- that already exists), it failed with:
--   ERROR: 42710: policy "qc_inspections_delete" for table
--   "qc_inspections" already exists
-- Fixed by preceding EACH of the six restored CREATE POLICY statements
-- with its own DROP POLICY IF EXISTS immediately above it, kept paired
-- for a future reader rather than batched. This makes every CREATE below
-- idempotent against all three states: never applied (the six original
-- policies are already there under these names — dropped, then
-- recreated identically), fully applied (the two team-keyed policies
-- from migration 017 are dropped, restoring the six PIC-keyed ones), and
-- partially applied (whichever of the six happens to be present is
-- dropped first regardless of which state that is).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

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

commit;
