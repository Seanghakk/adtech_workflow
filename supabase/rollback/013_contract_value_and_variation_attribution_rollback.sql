-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 013
-- Brief: ADTECH_WF_Brief_020_Contract_Value_And_Variation_Attribution §2/§3
--
-- Reverses 013_contract_value_and_variation_attribution.sql:
--   - Drops workflow.projects.contract_value. No write path exists yet
--     (migration's own §2.5 note), so nothing but an empty column is lost.
--   - Drops workflow.variations.raised_by, .approved_by, .request_id —
--     whichever branch the migration's own DO block took for raised_by
--     (NOT NULL on an empty table, or nullable otherwise), dropping the
--     column removes it and any constraint on it together; no separate
--     step is needed to undo the NOT NULL tightening first.
--
-- Does not touch `public`, does not touch any RLS policy or grant — this
-- migration added none (its own header explains why), so there is none to
-- restore here either.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

alter table workflow.variations
  drop column if exists request_id;

alter table workflow.variations
  drop column if exists approved_by;

alter table workflow.variations
  drop column if exists raised_by;

alter table workflow.projects
  drop column if exists contract_value;

commit;
