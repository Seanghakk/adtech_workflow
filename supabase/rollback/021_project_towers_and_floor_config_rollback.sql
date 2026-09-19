-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 021
-- Brief: ADTECH_WF_Brief_047_Floor_Zone_Configuration
--
-- REQUIRED before migration 021 is applied to prod, per this repo's own
-- standing process: run this against a non-production target that already
-- carries migrations 001-020 first (Seanghakk runs it — this session has
-- no psql/DATABASE_URL/SQL-editor access).
--
-- ORDER MATTERS: the two partial indexes and the original unique
-- constraint are restored FIRST (independent of tower_id), then the
-- tower_id column is dropped (removing project_floors' own FK to
-- project_towers before that table is dropped), then project_towers
-- itself — DROP TABLE IF EXISTS removes its policies/grant/comment in one
-- guarded statement, same reasoning migration 018's own rollback
-- documents. Handles all three states: never applied (every IF EXISTS is
-- a no-op except the final restore, which recreates the original
-- constraint), fully applied, and partially applied.
--
-- KNOWN LIMITATION, inherent to the feature itself, not a bug in this
-- file: if towers were actually used and two floors in DIFFERENT towers
-- ended up sharing a label (the tower feature's own point), restoring the
-- single project-wide unique(project_id, label) constraint below will
-- fail with a real uniqueness violation. That is expected on a database
-- with real tower data — rollback-test this on a throwaway project BEFORE
-- any real tower/floor data exists there, per this repo's own standing
-- process, so this is caught in testing, not in a real rollback attempt.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop index if exists workflow.project_floors_no_tower_label_unique;
drop index if exists workflow.project_floors_tower_label_unique;

alter table workflow.project_floors
  drop constraint if exists project_floors_project_id_label_key;

alter table workflow.project_floors
  add constraint project_floors_project_id_label_key unique (project_id, label);

alter table workflow.project_floors
  drop column if exists tower_id;

drop table if exists workflow.project_towers;

commit;
