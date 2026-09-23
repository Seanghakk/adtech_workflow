-- =============================================================================
-- ADTECH Workflow Tracker — Migration 030: floor drawing code
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §3 item 2
--
-- CHECKED THE LIVE SCHEMA FIRST: workflow.project_floors (migration 008)
-- has id/project_id/label/sort_order/tower_id/created_at/updated_at —
-- nothing that could stand in for a drawing code under another name.
-- `label` is the human display name and may contain spaces/punctuation
-- ("Tower 1 - B2"); this is deliberately a SEPARATE column, not a
-- derivation of label, since the brief's own example ("Tower 1 - B2" ->
-- "T1B2") is not a mechanical transform of the label text — it is
-- entered separately, by a person, per floor.
--
-- Optional (nullable, no default — an existing floor simply has none
-- until someone fills it in on a later screen, not built here). Format:
-- letters and digits only, no spaces, same regex-CHECK convention this
-- schema already uses for a similar short-code column (workflow.
-- projects.so_number, migration 005). Unique within a project WHERE SET
-- — a partial unique index, not a table constraint, so multiple floors
-- may all leave it null without colliding (ordinary UNIQUE already
-- treats NULL as distinct from NULL, but a partial index says so
-- explicitly and matches this file's own "safe to run twice" IF NOT
-- EXISTS requirement more simply than an ALTER TABLE ADD CONSTRAINT,
-- which has no IF NOT EXISTS form).
-- =============================================================================

begin;

alter table workflow.project_floors
  add column if not exists drawing_code text;

alter table workflow.project_floors
  drop constraint if exists project_floors_drawing_code_format_check;
alter table workflow.project_floors
  add constraint project_floors_drawing_code_format_check
  check (drawing_code is null or drawing_code ~ '^[A-Za-z0-9]+$');

create unique index if not exists project_floors_drawing_code_per_project_key
  on workflow.project_floors (project_id, drawing_code)
  where drawing_code is not null;

comment on column workflow.project_floors.drawing_code is
  'Short, letters-and-digits-only code used in drawing numbers (e.g.
   "Tower 1 - B2" -> "T1B2") — entered separately from `label`, not
   derived from it. Optional; unique within a project where set
   (project_floors_drawing_code_per_project_key, a partial unique index
   so floors that leave it null never collide). Brief 096 §3 item 2.';

commit;
