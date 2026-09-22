-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 028
-- Brief: ADTECH_WF_Brief_086_Shop_Drawing_Shared_Control_And_Auto_Status_Draft
--
-- Every "Expect:" count below was recounted directly against this
-- migration's OWN final text, cross-checked against what ALREADY existed
-- on shop_drawing_items/shop_drawing_submissions before this migration
-- (migrations 008 and 027) — not estimated. This project's own standing
-- lesson (Brief 079 found a verify file that undercounted constraints
-- once) is why every count here accounts for pre-existing objects, not
-- just this migration's own additions.
--
-- STANDING TRAP (carried forward from every prior verify file in this
-- project): run through a superuser/service-role session and you bypass
-- RLS entirely — nothing here proves anything about app-level access,
-- only about the objects' shape. Queries 9-24 below specifically need
-- real authenticated sessions (a PIC not on either team, a Shop Drawing
-- member, an A&A member, and an outsider) to exercise RLS and the
-- automatic status triggers, including the drafting_started_at addition
-- (queries 20-24).
-- =============================================================================

-- 1. shop_drawing_items_update policy text now mentions current_team(),
-- shop_drawing AND a_and_a, alongside the pre-existing is_superadmin()
-- and pic_id text. Expect 1 row, qual/with_check both containing all of:
-- is_superadmin, current_team, shop_drawing, a_and_a, pic_id.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_items' and policyname = 'shop_drawing_items_update';

-- 2. shop_drawing_items still carries exactly 4 policies total
-- (select, insert, update, delete — migrations 008/019) — UNCHANGED
-- count from before this migration; only the update policy's TEXT
-- changed (query 1 above). Expect 4 rows.
select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_items'
order by cmd;

-- 3. shop_drawing_submissions' insert/update policies now ALSO mention
-- pic_id (previously only current_team()). Expect 2 rows, both with
-- with_check text containing 'current_team' AND 'pic_id'.
select policyname, cmd, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_submissions' and cmd in ('INSERT', 'UPDATE');

-- 4. shop_drawing_submissions still carries exactly 3 policies total
-- (select/insert/update, no delete) — UNCHANGED count from migration
-- 027, only the insert/update TEXT changed. Expect 3 rows.
select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_submissions'
order by cmd;

-- 5. shop_drawing_items now carries exactly 2 triggers (NOT 1) — the
-- PRE-EXISTING shop_drawing_items_recalculate_rollup (migration 008)
-- plus this migration's NEW shop_drawing_items_before_update. Expect 2
-- rows.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'workflow.shop_drawing_items'::regclass and not tgisinternal
order by tgname;

-- 6. shop_drawing_submissions now carries exactly 3 triggers (NOT 1) —
-- the two PRE-EXISTING ones from migration 027 (shop_drawing_
-- submissions_before_insert, shop_drawing_submissions_before_update)
-- plus this migration's NEW shop_drawing_submissions_auto_status.
-- Expect 3 rows.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'workflow.shop_drawing_submissions'::regclass and not tgisinternal
order by tgname;

-- 7. Both new functions exist, SECURITY DEFINER. Expect 2 rows.
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow'
  and p.proname in ('shop_drawing_items_before_update', 'shop_drawing_submissions_auto_status')
order by p.proname;

-- 8. record_shop_drawing_check() (migration 027) is UNCHANGED — still
-- exists, still SECURITY DEFINER, still takes exactly 1 argument. This
-- migration must not have widened its own gate. Expect 1 row.
select p.proname, p.prosecdef, p.pronargs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow' and p.proname = 'record_shop_drawing_check';

-- 8a. ADDITION: shop_drawing_items gained exactly one new column,
-- drafting_started_at, nullable, no default. Expect 1 row.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'workflow' and table_name = 'shop_drawing_items'
  and column_name = 'drafting_started_at';

-- 8b. ADDITION: shop_drawing_items' own column count grew by exactly one
-- from migration 027's own end state (that migration's own verify file
-- query 1 established 2 columns added on top of migration 008's
-- original set — this migration adds a third, drafting_started_at, on
-- top of THOSE). Cross-check: information_schema.columns for this table
-- should show drafting_started_at alongside the two migration-027
-- columns (pre_submission_stage, legacy_done_no_lifecycle_history).
-- Expect 3 rows.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'shop_drawing_items'
  and column_name in ('drafting_started_at', 'pre_submission_stage', 'legacy_done_no_lifecycle_history')
order by column_name;

-- =============================================================================
-- BEHAVIOURAL CHECKS — proves the widened policies and the automatic
-- status rules actually work. Run as real authenticated sessions (NOT
-- the migration owner/superuser). NOT run as part of this drafting
-- session — no UI, no application code exists yet to trigger any of
-- this from; these are for the separate rollback-test brief that
-- follows (same pattern as Brief 085), pasted by hand.
--
-- You will need: a real shop_drawing_items id with status='not_started'
-- and no existing submissions; the project's own PIC (not on either
-- team); a Shop Drawing team member (any role); an A&A team member; an
-- outsider (neither PIC nor either team); and the Shop Drawing team's
-- MANAGER (for query 12, the regression check).
-- =============================================================================

-- 9. The PIC (not on either team) can record a submission — requires a
-- valid check already recorded for revision 0 (record_shop_drawing_check
-- is unaffected by this migration, still manager-only; the PIC does NOT
-- need to be the one who checked it):
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, submitted_by, reviewer_party)
--   values
--     ('<item id>', 0, auth.uid(), 'consultant');
--   -- expect: success, as the project's own PIC.

-- 9b. The PIC can then record a return (code B):
--   update workflow.shop_drawing_submissions
--   set returned_at = now(), code = 'B'
--   where item_id = '<same item id>' and revision = 0;
--   -- expect: success.

-- 10. A Shop Drawing member (any role, not necessarily manager) can set
-- status and pre_submission_stage by hand on a DIFFERENT item:
--   update workflow.shop_drawing_items
--   set pre_submission_stage = 'drafting'
--   where id = '<a different item id>';
--   -- expect: success.
--   update workflow.shop_drawing_items set status = 'in_progress'
--   where id = '<same item id>';
--   -- expect: success (manual change, independent of the automatic rule).

-- 11. An A&A member can do the same, on a DIFFERENT item again:
--   (same two statements as query 10, as an A&A member, third item id)
--   -- expect: both succeed.

-- 12. An outsider (neither PIC nor either team) can do NONE of the
-- above — try any one of queries 9/10/11's statements as an outsider:
--   -- expect: 0 rows affected (RLS silently hides the row from UPDATE;
--   -- same "policy absence hides the row" shape documented in Brief
--   -- 081's own result), or an RLS insert-policy violation for the
--   -- submission case.

-- 13. REGRESSION — the PIC still CANNOT record an internal check (the
-- manager-only gate from migration 027 is UNCHANGED by this migration):
--   select workflow.record_shop_drawing_check('<item id>');
--   -- run as the PIC (who is not the Shop Drawing manager) — expect the
--   -- SAME exception migration 027 already produces: "Only the Shop
--   -- Drawing team's manager may record an internal check."

-- 14. Entering 'drafting' on a not_started item automatically sets it
-- in_progress (rule 1, case 1) — as the PIC, Shop Drawing, or A&A member,
-- on a FRESH not_started item with pre_submission_stage still null:
--   update workflow.shop_drawing_items
--   set pre_submission_stage = 'drafting'
--   where id = '<a fresh not_started item id>'
--   returning status;
--   -- expect: status = 'in_progress' in the RETURNING output, even
--   -- though this statement never mentioned status at all.

-- 15. An A return automatically sets status done; a B return also does
-- (rule 1, case 2) — on an item with status currently 'in_progress' and
-- a valid open (unreturned) submission at revision N:
--   update workflow.shop_drawing_submissions
--   set returned_at = now(), code = 'A'
--   where item_id = '<item id>' and revision = <N>
--   returning (select status from workflow.shop_drawing_items where id = '<same item id>');
--   -- expect: 'done'. Repeat with a SEPARATE item/submission and code
--   -- 'B' instead — expect 'done' there too.

-- 16. A C return leaves status COMPLETELY unchanged — same shape as
-- query 15, but code = 'C', on an item whose status before this return
-- was 'in_progress':
--   update workflow.shop_drawing_submissions
--   set returned_at = now(), code = 'C'
--   where item_id = '<item id>' and revision = <N>
--   returning (select status from workflow.shop_drawing_items where id = '<same item id>');
--   -- expect: 'in_progress' (unchanged) — the automatic rule does not
--   -- fire for code 'C' at all.

-- 17. A manual 'done' with NO approved submission stays 'done' and is
-- identifiable as "marked manually" (rule 3) — as any member in §2a, on
-- an item with no shop_drawing_submissions row carrying code A/B at all:
--   update workflow.shop_drawing_items set status = 'done'
--   where id = '<item id with no A/B submission anywhere>';
--   -- expect: success (manual change, always allowed). Then confirm the
--   -- "marked manually" reading holds:
--   select
--     i.status,
--     i.legacy_done_no_lifecycle_history,
--     exists (select 1 from workflow.shop_drawing_submissions s where s.item_id = i.id and s.code in ('A','B')) as has_approval
--   from workflow.shop_drawing_items i where i.id = '<same item id>';
--   -- expect: status='done', legacy_done_no_lifecycle_history=false,
--   -- has_approval=false — exactly the "marked manually, no recorded
--   -- approval" case per this migration's own header §4d.

-- 18. NO AUTOMATIC RULE EVER MOVES STATUS BACKWARD, under any tested
-- scenario — spot-check by attempting to trigger an automatic path
-- AFTER status is already 'done' (e.g. inserting a fresh submission on
-- an already-done item, if a valid check exists for its next revision):
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, submitted_by, reviewer_party)
--   values ('<an already-done item id>', <next revision>, auth.uid(), 'consultant')
--   returning (select status from workflow.shop_drawing_items where id = '<same item id>');
--   -- expect: 'done', unchanged — the INSERT branch of the automatic
--   -- trigger only ever moves a NOT_STARTED item to in_progress, and
--   -- its own WHERE guard (status = 'not_started') means it does
--   -- nothing at all here, by construction, not by luck.

-- 19. An automatic status change produces the SAME rollup-percent
-- recalculation AND exactly ONE progress-history row that an identical
-- MANUAL status change would produce — compare the two directly. On one
-- item on a project with floor rows, record an A/B return (automatic
-- path) and note the resulting workflow.projects.percent_calculated and
-- the new row in workflow.project_progress_history (source should read
-- 'floor_rollup' or 'manual' per migration 025's own derivation — note
-- which). On a SEPARATE, otherwise-identical item/project state, set
-- status='done' by hand (manual path) instead, and confirm the
-- resulting percent_calculated and history-row COUNT are identical in
-- shape (exactly one new row either way) — the only expected difference
-- is which write path produced it, not how many rows or what the
-- computed percentage is, since both ultimately funnel through the SAME
-- recalculate_project_rollup()/record_project_progress_history() chain
-- (see this migration's own header for the full trace).

-- =============================================================================
-- BEHAVIOURAL CHECKS FOR drafting_started_at (the addition to this
-- brief) — three routes leaving not_started, each set on a SEPARATE
-- fresh not_started item so the three tests don't interfere.
-- =============================================================================

-- 20. ROUTE 1 — pre_submission_stage set. On a fresh not_started item
-- with drafting_started_at still null:
--   update workflow.shop_drawing_items
--   set pre_submission_stage = 'drafting'
--   where id = '<fresh not_started item id, route 1>'
--   returning status, drafting_started_at;
--   -- expect: status = 'in_progress' (rule 1, case 1, unchanged by this
--   -- addition), drafting_started_at IS NOT NULL and ~= now().

-- 21. ROUTE 2 — a submission is created (no prior pre_submission_stage
-- change on this item at all; a valid check must already be recorded
-- for revision 0 on this item, per migration 027's own gate):
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, submitted_by, reviewer_party)
--   values ('<fresh not_started item id, route 2>', 0, auth.uid(), 'consultant');
--   select status, drafting_started_at from workflow.shop_drawing_items
--   where id = '<same item id>';
--   -- expect: status = 'in_progress', drafting_started_at IS NOT NULL
--   -- and ~= now() — set even though this item's pre_submission_stage
--   -- was never touched, proving the single unified trigger catches
--   -- this route too, not just route 1.

-- 22. ROUTE 3 — a manual status change away from not_started, with NO
-- pre_submission_stage change and NO submission at all:
--   update workflow.shop_drawing_items
--   set status = 'in_progress'
--   where id = '<fresh not_started item id, route 3>'
--   returning drafting_started_at;
--   -- expect: drafting_started_at IS NOT NULL and ~= now().

-- 23. NEVER OVERWRITTEN ONCE SET — on the SAME item from query 20 (or
-- 21/22), note its exact drafting_started_at value, wait a moment, then
-- make ANOTHER status-changing update to the same item (e.g. move it
-- along further, or even manually set status back to 'not_started' and
-- then forward again — rule 2 allows a manual change in either
-- direction):
--   select drafting_started_at from workflow.shop_drawing_items
--   where id = '<the item from query 20>'; -- note this value, call it V1
--   update workflow.shop_drawing_items set status = 'not_started'
--   where id = '<same item id>'; -- a manual reversal, allowed per rule 2
--   update workflow.shop_drawing_items set status = 'in_progress'
--   where id = '<same item id>'; -- forward again
--   select drafting_started_at from workflow.shop_drawing_items
--   where id = '<same item id>'; -- call it V2
--   -- expect: V2 = V1, byte-for-byte identical — even after leaving and
--   -- re-entering not_started, the ORIGINAL first-departure timestamp is
--   -- never overwritten (old.drafting_started_at is null is false by
--   -- this point, so the trigger's own guard skips the assignment).

-- 24. LEFT NULL FOR EXISTING ROWS — any shop_drawing_items row that
-- existed before this migration (i.e. every row already in the table at
-- apply time) has drafting_started_at = null immediately after applying,
-- regardless of its current status (including 'done' or 'in_progress'
-- rows from before this migration existed) — no backfill was attempted.
-- Run this ONCE, immediately after applying, before any of queries
-- 20-23 above:
--   select count(*) as rows_with_a_value
--   from workflow.shop_drawing_items
--   where drafting_started_at is not null;
--   -- expect: 0, immediately after applying (before any real write
--   -- happens) — confirms no backfill occurred.
