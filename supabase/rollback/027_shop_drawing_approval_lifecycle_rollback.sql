-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 027
-- Brief: ADTECH_WF_Brief_083_Shop_Drawing_Lifecycle_Investigate_And_Draft,
--        REVISED BY ADTECH_WF_Brief_084_Revise_PR55_Shop_Drawing_Check_And_
--        Recording_Rules
--
-- Reverses migration 027 in dependency order: BOTH new triggers before
-- the functions they call (§2B''s before-insert trigger depends on
-- workflow.shop_drawing_checks existing, so it — and its function — are
-- dropped before that table); workflow.record_shop_drawing_check()
-- (Brief 084 §2A, no trigger, just a directly-callable function); the
-- checks table (drops its own SELECT policy as a dependent object); the
-- submissions table''s own before-update trigger/function (Brief 083,
-- unchanged by 084); the submissions table itself (drops its own
-- policies as dependent objects); finally the two columns on
-- workflow.shop_drawing_items. Every DROP is IF EXISTS-guarded, safe
-- whether migration 027 was fully applied, partially applied, or already
-- rolled back — including a rollback attempted between Brief 083''s
-- original apply and Brief 084''s revision being applied on top of it
-- (this file matches the FINAL, revised migration text, not a two-step
-- history).
--
-- Does NOT touch workflow.shop_drawing_items.status, or any existing
-- policy/trigger/grant on that table — this migration never changed any
-- of them, so there is nothing to restore for them either.
--
-- DATA LOSS, INHERENT NOT A DEFECT: every row in
-- workflow.shop_drawing_submissions and workflow.shop_drawing_checks (in
-- practice: none of either, until a future UI brief starts writing them
-- — see the migration''s own §4 backfill note, which inserts zero rows
-- into either table) and every value in shop_drawing_items.
-- pre_submission_stage / .legacy_done_no_lifecycle_history is lost. That
-- is what dropping a table / dropping a column means, same as every
-- other rollback file in this project.
-- =============================================================================

begin;

drop trigger if exists shop_drawing_submissions_before_insert on workflow.shop_drawing_submissions;
drop function if exists workflow.shop_drawing_submissions_before_insert();

drop function if exists workflow.record_shop_drawing_check(uuid);

drop table if exists workflow.shop_drawing_checks;

drop trigger if exists shop_drawing_submissions_before_update on workflow.shop_drawing_submissions;
drop function if exists workflow.shop_drawing_submissions_before_update();

drop table if exists workflow.shop_drawing_submissions;

alter table workflow.shop_drawing_items
  drop column if exists pre_submission_stage,
  drop column if exists legacy_done_no_lifecycle_history;

commit;
