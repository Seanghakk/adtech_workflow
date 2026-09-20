-- =============================================================================
-- ADTECH Workflow Tracker — Migration 024: photo evidence on
-- workflow.floor_sub_stages
-- Brief: ADTECH_WF_Brief_059_Photo_Evidence_On_Floor_SubStage_Completion
--
-- RESOLVES migration 023's own flagged open question (quoted there:
-- "the floor-sub-stage-completion reading of §3 is UNRESOLVED... including
-- whether completion evidence belongs on progress_updates at all, or on
-- qc_inspections instead"). Brief 059 §2's decision: progress_updates
-- (self-reported 6a percent) and qc_inspections (independent QC
-- verification) stay two separate systems, not merged. Marking a
-- floor_sub_stage 'done' is a self-report, the same category of event as
-- 6a's own 100% gate — so it gets its OWN photo column on its OWN table,
-- same additive/nullable shape as migration 023's progress_updates.
-- photo_url, not a row inserted into progress_updates and not a column on
-- qc_inspections (QC's own evidence stays untouched — Brief 059 §5, out of
-- scope here).
--
-- NULLABLE ON PURPOSE (brief §3, same reasoning as migration 023): required
-- only in the UI/API when a team marks a sub-stage 'done'
-- (floor-actions.ts's updateSubStageStatus), never as a NOT NULL here, so
-- this migration cannot retroactively invalidate any existing row.
--
-- WRITE ACCESS UNCHANGED (brief §4): this column is written under the
-- SAME stage-conditional team-write policies migration 022 already put on
-- this table (installation rows: Project team; tnc rows: TNC team) — no
-- RLS policy is added or altered here, only the column itself.
-- =============================================================================

begin;

alter table workflow.floor_sub_stages
  add column photo_url text;

comment on column workflow.floor_sub_stages.photo_url is
  'Public Storage URL (progress-photos bucket, same bucket as workflow.progress_updates.photo_url) for the photo evidence attached to this sub-stage''s most recent completion. Nullable: optional in general, required by the UI/API (not this column) when a team marks this row''s status ''done'' — Brief 059 §3. Single photo per row by design, mirroring migration 023''s progress_updates.photo_url precedent.';

commit;
