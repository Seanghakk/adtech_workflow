-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 027
-- Brief: ADTECH_WF_Brief_083_Shop_Drawing_Lifecycle_Investigate_And_Draft
--
-- STANDING TRAP (carried forward from every prior verify file in this
-- project): run through a superuser/service-role session and you bypass
-- RLS entirely — nothing here proves anything about app-level access,
-- only about the objects' shape. Queries 7-8 below specifically need a
-- real authenticated Shop Drawing team member session to exercise RLS.
-- =============================================================================

-- 1. workflow.shop_drawing_items gained exactly its two new columns,
-- correct types/nullability. Expect 2 rows.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'shop_drawing_items'
  and column_name in ('pre_submission_stage', 'legacy_done_no_lifecycle_history')
order by column_name;

-- 2. The pre_submission_stage CHECK constraint exists and allows exactly
-- drafting/internal_check (plus null). Expect 1 row.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.shop_drawing_items'::regclass
  and conname = 'shop_drawing_items_pre_submission_stage_check';

-- 3. workflow.shop_drawing_submissions exists with exactly the expected
-- shape. Expect 14 rows (id through updated_at).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'shop_drawing_submissions'
order by ordinal_position;

-- 4. Constraints: PK; unique(item_id,revision); 6 CHECK constraints
-- (revision>=0, reviewer_party enum, code enum, return-shape pairing,
-- checked<=submitted, returned>=submitted); 3 FK constraints (item_id ->
-- shop_drawing_items, checked_by -> user_profiles, submitted_by ->
-- user_profiles, all RESTRICT). Expect 11 rows total.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.shop_drawing_submissions'::regclass
order by contype, conname;

-- 5. RLS enabled, exactly 3 policies (select/insert/update) — no DELETE
-- policy at all. Expect relrowsecurity = t, and exactly 3 rows.
select relrowsecurity
from pg_class
where oid = 'workflow.shop_drawing_submissions'::regclass;

select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'shop_drawing_submissions'
order by cmd;

-- 6. The immutability/updated_at trigger exists.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'workflow.shop_drawing_submissions'::regclass
  and not tgisinternal;

-- 7. BACKFILL SANITY (design question e) — run once, right after
-- applying, before any real write happens:
--   a. Every item with status='in_progress' now has
--      pre_submission_stage='drafting'. Expect this count to equal
--      `select count(*) from workflow.shop_drawing_items where status =
--      'in_progress'`.
select count(*) as backfilled_drafting_rows
from workflow.shop_drawing_items
where status = 'in_progress' and pre_submission_stage = 'drafting';

--   b. Every item with status='done' now has
--      legacy_done_no_lifecycle_history = true. Expect this count to
--      equal `select count(*) from workflow.shop_drawing_items where
--      status = 'done'`.
select count(*) as backfilled_legacy_done_rows
from workflow.shop_drawing_items
where status = 'done' and legacy_done_no_lifecycle_history = true;

--   c. No status='not_started' item was touched by the backfill (stays
--      NULL/false). Expect 0 rows.
select count(*) as wrongly_touched_not_started_rows
from workflow.shop_drawing_items
where status = 'not_started'
  and (pre_submission_stage is not null or legacy_done_no_lifecycle_history = true);

--   d. Zero rows exist in the new submissions table immediately after
--      applying — this migration inserts none (design question e's own
--      "no submission history to reconstruct"). Expect 0.
select count(*) as submission_rows_immediately_after_migration
from workflow.shop_drawing_submissions;

-- =============================================================================
-- BEHAVIOURAL CHECKS — proves the RLS and immutability rules actually
-- work. Run as a real authenticated Shop Drawing team member session
-- (not the migration owner), against a real shop_drawing_items row's id
-- and a real user_profiles id for that member. NOT run as part of this
-- drafting session (no UI, no application code exists yet to trigger
-- this from — see this brief's own Result doc).
-- =============================================================================

-- 8. A Shop Drawing team member can record a submission (revision 0):
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, checked_by, checked_at, submitted_by, reviewer_party)
--   values
--     ('<a real shop_drawing_items id>', 0, auth.uid(), now(), auth.uid(), 'consultant');
--   -- expect: success, exactly one new row, returned_at and code both null.

-- 9. Recording a return (code B) on that same row succeeds; a SECOND
-- attempt to record a return on the same row is refused:
--   update workflow.shop_drawing_submissions
--   set returned_at = now(), code = 'B', comments = 'Approved with minor comments.'
--   where item_id = '<same item id>' and revision = 0;
--   -- expect: success.
--   update workflow.shop_drawing_submissions
--   set returned_at = now(), code = 'A'
--   where item_id = '<same item id>' and revision = 0;
--   -- expect: exception "already been returned and is closed".

-- 10. A non-Shop-Drawing-team member (e.g. a Project team member) cannot
-- insert a submission:
--   insert into workflow.shop_drawing_submissions
--     (item_id, revision, checked_by, checked_at, submitted_by, reviewer_party)
--   values
--     ('<same item id>', 1, auth.uid(), now(), auth.uid(), 'client');
--   -- expect: refused (RLS policy violation — new row violates row-level
--   -- security policy for table shop_drawing_submissions).

-- 11. Attempting to change an immutable field on an OPEN submission (not
-- yet returned) is refused:
--   update workflow.shop_drawing_submissions
--   set reviewer_party = 'client'
--   where item_id = '<an item id with an open submission>' and revision = <its revision>;
--   -- expect: exception "Only returned_at, code and comments may be set...".
