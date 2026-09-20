-- =============================================================================
-- ADTECH Workflow Tracker — Migration 023: photo evidence on
-- workflow.progress_updates
-- Brief: ADTECH_WF_Brief_057_Photo_Evidence_on_Progress_Updates
--
-- Single additive column, per the brief's own §2 decision (not
-- re-litigated here): the photo attaches to progress_updates, the
-- append-only history of manual 6a entries, never to floor_sub_stages.
-- progress_updates already carries author_id/recorded_at, so a photo
-- there inherits its timestamp and author for free — no new FK, no new
-- table.
--
-- NULLABLE ON PURPOSE (brief §3): optional in general, required only when
-- a project/item update reaches 100% — enforced in the UI
-- (UpdateProgressForm / actions.ts), never as a NOT NULL here, so this
-- migration cannot break any existing row or any non-completion update.
--
-- SCOPE NOTE, flagged per this repo's own "stop and flag a real trade-off"
-- rule rather than resolved silently: the brief's §3 language ("required
-- when a stage is marked complete") reads naturally as floor_sub_stages
-- completion (installation/TnC fix stages), but marking a floor_sub_stage
-- 'done' (floor-actions.ts's updateSubStageStatus, migration 008/022)
-- never inserts a progress_updates row at all — only this table's own
-- status column changes, plus a rollup recalculation trigger. With photos
-- pinned to progress_updates per §2, there is no insert to hook a
-- required-photo check into on that path. This migration and the
-- enforcement it supports cover ONLY the path that does insert into
-- progress_updates: the 6a project/item percent update reaching
-- new_percent = 100. The floor-sub-stage-completion reading of §3 is
-- UNRESOLVED — see Result doc for Brief 057 for the open question this
-- was flagged back to Seanghakk as (including whether completion
-- evidence belongs on progress_updates at all, or on qc_inspections
-- instead, since QC already performs an installation inspection after
-- each fix stage).
--
-- OUT OF SCOPE (brief §8): multiple photos per update. A single nullable
-- column does not foreclose adding a one-to-many photos table later if
-- that requirement changes — this migration makes no schema choice that
-- would block it.
-- =============================================================================

begin;

alter table workflow.progress_updates
  add column photo_url text;

comment on column workflow.progress_updates.photo_url is
  'Public Storage URL (progress-photos bucket) for the photo evidence attached to this update, if any. Nullable: optional in general, required by the UI (not this column) when a project/item update''s new_percent reaches 100 — Brief 057 §3. Single photo per update by design — Brief 057 §8.';

commit;
