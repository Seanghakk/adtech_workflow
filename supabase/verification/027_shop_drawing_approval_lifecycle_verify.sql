-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 027
-- Brief: ADTECH_WF_Brief_083_Shop_Drawing_Lifecycle_Investigate_And_Draft,
--        REVISED BY ADTECH_WF_Brief_084_Revise_PR55_Shop_Drawing_Check_And_
--        Recording_Rules
--
-- Every "Expect:" count below was recounted directly against this
-- migration's OWN final text, not carried over from Brief 083's original
-- numbers or estimated — Brief 079 (an earlier brief in this project)
-- found a verify file that undercounted constraints (said 4, reality 5),
-- so nothing here is taken on faith.
--
-- STANDING TRAP (carried forward from every prior verify file in this
-- project): run through a superuser/service-role session and you bypass
-- RLS entirely — nothing here proves anything about app-level access,
-- only about the objects' shape. Queries 12-19 below specifically need
-- real authenticated sessions (a Shop Drawing manager, a Shop Drawing
-- non-manager, an A&A member, and an outsider) to exercise RLS and the
-- new guarded function.
-- =============================================================================

-- 1. workflow.shop_drawing_items gained exactly its two new columns,
-- correct types/nullability. UNCHANGED BY BRIEF 084. Expect 2 rows.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'shop_drawing_items'
  and column_name in ('pre_submission_stage', 'legacy_done_no_lifecycle_history')
order by column_name;

-- 2. The pre_submission_stage CHECK constraint exists and allows exactly
-- drafting/internal_check (plus null). UNCHANGED. Expect 1 row.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.shop_drawing_items'::regclass
  and conname = 'shop_drawing_items_pre_submission_stage_check';

-- 3. workflow.shop_drawing_submissions exists with exactly the expected
-- shape. UNCHANGED BY BRIEF 084 — no column added, removed or retyped.
-- Expect 14 rows (id through updated_at).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'shop_drawing_submissions'
order by ordinal_position;

-- 4. Constraints on shop_drawing_submissions: PK; unique(item_id,revision);
-- 6 CHECK constraints (revision>=0, reviewer_party enum, code enum,
-- return-shape pairing, checked<=submitted, returned>=submitted); 3 FK
-- constraints (item_id -> shop_drawing_items, checked_by -> user_profiles,
-- submitted_by -> user_profiles, all RESTRICT). UNCHANGED BY BRIEF 084 —
-- no constraint added or removed on this table. Expect 11 rows total.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.shop_drawing_submissions'::regclass
order by contype, conname;

-- 5. RLS enabled, exactly 3 policies (select/insert/update) — no DELETE
-- policy at all. COUNT UNCHANGED by Brief 084 (still 3 policies), but
-- the INSERT/UPDATE policy TEXT changed: both now read
-- current_team() IN ('shop_drawing', 'a_and_a'), not 'shop_drawing'
-- alone — confirm the qual/with_check text says so (query 5b). Expect
-- relrowsecurity = t, and exactly 3 rows from 5a.
select relrowsecurity
from pg_class
where oid = 'workflow.shop_drawing_submissions'::regclass;

-- 5a. Expect 3 rows (select/insert/update).
select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_submissions'
order by cmd;

-- 5b. Expect the insert and update rows' with_check text to each contain
-- BOTH 'shop_drawing' and 'a_and_a' (Brief 084 §2c) — not 'shop_drawing'
-- alone.
select policyname, cmd, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_submissions'
  and cmd in ('INSERT', 'UPDATE');

-- 6. shop_drawing_submissions now carries TWO triggers, not one — Brief
-- 084 §2B added shop_drawing_submissions_before_insert alongside Brief
-- 083's original shop_drawing_submissions_before_update. Expect 2 rows.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'workflow.shop_drawing_submissions'::regclass
  and not tgisinternal
order by tgname;

-- =============================================================================
-- NEW IN BRIEF 084 — workflow.shop_drawing_checks and the guarded
-- function that is its only writer.
-- =============================================================================

-- 7. workflow.shop_drawing_checks exists with exactly the expected
-- shape. Expect 6 rows (id, item_id, revision, checked_by, checked_at,
-- created_at).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'shop_drawing_checks'
order by ordinal_position;

-- 8. Constraints on shop_drawing_checks: PK; unique(item_id,revision);
-- 1 CHECK (revision>=0); 2 FK (item_id -> shop_drawing_items, checked_by
-- -> user_profiles, both RESTRICT). Expect 5 rows total.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.shop_drawing_checks'::regclass
order by contype, conname;

-- 9. RLS enabled, exactly ONE policy (select only) — no INSERT/UPDATE/
-- DELETE policy of any kind; the guarded function below is the only
-- writer. Expect relrowsecurity = t, and exactly 1 row.
select relrowsecurity
from pg_class
where oid = 'workflow.shop_drawing_checks'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_checks';

-- 10. workflow.record_shop_drawing_check(uuid) exists, SECURITY DEFINER,
-- takes exactly one uuid argument, returns the table's own row type.
-- Expect 1 row.
select p.proname, p.prosecdef, p.pronargs, pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow' and p.proname = 'record_shop_drawing_check';

-- 11. workflow.shop_drawing_submissions_before_insert() exists, SECURITY
-- DEFINER, and its trigger is attached (already covered by query 6
-- above, cross-checked here at the function level). Expect 1 row.
select p.proname, p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'workflow' and p.proname = 'shop_drawing_submissions_before_insert';

-- =============================================================================
-- BACKFILL SANITY (design question e) — UNCHANGED BY BRIEF 084. Run
-- once, right after applying, before any real write happens.
-- =============================================================================

-- 12a. Every item with status='in_progress' now has
-- pre_submission_stage='drafting'. Expect this count to equal
-- `select count(*) from workflow.shop_drawing_items where status =
-- 'in_progress'`.
select count(*) as backfilled_drafting_rows
from workflow.shop_drawing_items
where status = 'in_progress' and pre_submission_stage = 'drafting';

-- 12b. Every item with status='done' now has
-- legacy_done_no_lifecycle_history = true. Expect this count to equal
-- `select count(*) from workflow.shop_drawing_items where status =
-- 'done'`.
select count(*) as backfilled_legacy_done_rows
from workflow.shop_drawing_items
where status = 'done' and legacy_done_no_lifecycle_history = true;

-- 12c. No status='not_started' item was touched by the backfill (stays
-- NULL/false). Expect 0 rows.
select count(*) as wrongly_touched_not_started_rows
from workflow.shop_drawing_items
where status = 'not_started'
  and (pre_submission_stage is not null or legacy_done_no_lifecycle_history = true);

-- 12d. Zero rows exist in the new submissions table immediately after
-- applying — this migration inserts none (design question e's own "no
-- submission history to reconstruct"). Expect 0.
select count(*) as submission_rows_immediately_after_migration
from workflow.shop_drawing_submissions;

-- 12e. Same for the new checks table — the backfill never calls
-- record_shop_drawing_check(); a legacy 'done' item gets NO fabricated
-- check either. Expect 0.
select count(*) as check_rows_immediately_after_migration
from workflow.shop_drawing_checks;

-- =============================================================================
-- BEHAVIOURAL CHECKS — proves RLS, the guard function, the insert gate
-- and immutability all actually work. Run as real authenticated sessions
-- (NOT the migration owner/superuser, which bypasses RLS entirely and
-- would prove nothing). NOT run as part of this drafting session — no
-- UI, no application code exists yet to trigger any of this from; these
-- are for the separate rollback-test brief that follows (same pattern as
-- Brief 079), pasted by hand against real member accounts.
--
-- You will need, on the rollback-test project: a real shop_drawing_items
-- id with no existing submissions; a member account that IS the Shop
-- Drawing team's manager (team='shop_drawing', role='manager'); a member
-- account on the Shop Drawing team but NOT its manager (role='member');
-- a member account on the A&A team; and a member account on neither team
-- (e.g. Project Management or QC), to exercise the full guarantee list.
-- =============================================================================

-- 13. A non-manager Shop Drawing team member CANNOT record a check:
--   select workflow.record_shop_drawing_check('<a real shop_drawing_items id>');
--   -- expect: exception "Only the Shop Drawing team's manager may record
--   -- an internal check."

-- 14. An A&A team member CANNOT record a check either (even though they
-- CAN submit, per decision c — recording the check and recording the
-- submission are governed by two different, deliberately separate
-- gates):
--   select workflow.record_shop_drawing_check('<same item id>');
--   -- expect: same exception as 13.

-- 15. The Shop Drawing team's manager CAN record a check, and the row
-- records THEIR OWN id, not one they could type themselves (the function
-- takes only the item id — there is no parameter to supply a different
-- checker):
--   select * from workflow.record_shop_drawing_check('<same item id>');
--   -- expect: success, one row, revision = 0 (first check on this
--   -- item), checked_by = the manager's own auth.uid(), checked_at ~=
--   -- now.

-- 16. A submission with NO matching check for that item+revision is
-- refused — try this against a DIFFERENT item that has never been
-- checked at all, as any Shop Drawing or A&A member:
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, submitted_by, reviewer_party)
--   values
--     ('<a DIFFERENT, never-checked item id>', 0, auth.uid(), 'consultant');
--   -- expect: exception "No recorded internal check exists for this item
--   -- and revision — the Shop Drawing manager must check it before it
--   -- can be submitted."

-- 17. A check recorded for Rev 0 does NOT allow a Rev 1 submission on
-- the SAME item from step 15 — as any Shop Drawing or A&A member, try
-- revision 1 directly (skipping the still-valid Rev 0 check):
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, submitted_by, reviewer_party)
--   values
--     ('<the item id from step 15>', 1, auth.uid(), 'consultant');
--   -- expect: same exception as 16 (no check exists for revision 1 yet).

-- 18. An A&A member CAN create the Rev 0 submission on the item from
-- step 15 (the check that DOES exist, for revision 0), and the
-- resulting row carries the MANAGER's id as checker, not the A&A
-- member's own id — proving guarantee 5 (copied, never typed by the
-- submitter):
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, submitted_by, reviewer_party)
--   values
--     ('<the item id from step 15>', 0, auth.uid(), 'consultant')
--   returning checked_by, checked_at;
--   -- expect: success, exactly one new row; checked_by equals the
--   -- MANAGER's auth.uid() from step 15, NOT the A&A member's own
--   -- auth.uid() — even though this INSERT never mentioned checked_by
--   -- at all (or if it tried to set checked_by to its own id directly,
--   -- expect the same result: silently overwritten to the manager's id).

-- 19. A returned submission still cannot be changed afterward (Brief
-- 083's original immutability rule, confirmed unbroken by this
-- revision) — record a return on the row from step 18, then try to
-- change it again:
--   update workflow.shop_drawing_submissions
--   set returned_at = now(), code = 'B', comments = 'Approved with minor comments.'
--   where item_id = '<the item id from step 15>' and revision = 0;
--   -- expect: success.
--   update workflow.shop_drawing_submissions
--   set returned_at = now(), code = 'A'
--   where item_id = '<the item id from step 15>' and revision = 0;
--   -- expect: exception "already been returned and is closed".

-- 20. An outsider (a member on neither the Shop Drawing nor A&A team)
-- cannot insert a submission at all, even with a valid check available:
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, submitted_by, reviewer_party)
--   values
--     ('<any item id>', 0, auth.uid(), 'client');
--   -- expect: refused (RLS policy violation — new row violates
--   -- row-level security policy for table shop_drawing_submissions) —
--   -- this fires BEFORE the before-insert trigger's own check-lookup
--   -- would even matter, since RLS is evaluated regardless.
