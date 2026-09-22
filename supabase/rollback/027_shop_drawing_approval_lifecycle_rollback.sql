-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 027
-- Brief: ADTECH_WF_Brief_083_Shop_Drawing_Lifecycle_Investigate_And_Draft
--
-- Reverses migration 027 in dependency order: the trigger before the
-- function it calls; the submissions table (drops its own policies as
-- dependent objects); finally the two new columns on
-- workflow.shop_drawing_items. Every DROP is IF EXISTS-guarded, safe
-- whether migration 027 was fully applied, partially applied, or already
-- rolled back.
--
-- Does NOT touch workflow.shop_drawing_items.status, or any existing
-- policy/trigger/grant on that table — this migration never changed any
-- of them, so there is nothing to restore for them either.
--
-- DATA LOSS, INHERENT NOT A DEFECT: every row in
-- workflow.shop_drawing_submissions (in practice: none, until a future
-- UI brief starts writing them — see the migration's own §4 backfill
-- note, which inserts zero submission rows) and every value in
-- shop_drawing_items.pre_submission_stage /
-- .legacy_done_no_lifecycle_history is lost. That is what dropping a
-- table / dropping a column means, same as every other rollback file in
-- this project.
-- =============================================================================

begin;

drop trigger if exists shop_drawing_submissions_before_update on workflow.shop_drawing_submissions;
drop function if exists workflow.shop_drawing_submissions_before_update();

drop table if exists workflow.shop_drawing_submissions;

alter table workflow.shop_drawing_items
  drop column if exists pre_submission_stage,
  drop column if exists legacy_done_no_lifecycle_history;

commit;
