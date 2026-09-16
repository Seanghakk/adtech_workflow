-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 011
-- Brief: ADTECH_WF_Brief_015_Screen_1a_Post_A_Request §2
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 011_requests_insert_policy.sql — and after having run the rollback
-- against a non-production target first.
--
-- STANDING TRAP (carried forward from Briefs 009/010/014 §0): these
-- queries go through pg_policies (the view), never the raw pg_policy
-- catalog — a block run in the SQL editor executes as table owner and
-- bypasses RLS entirely, so nothing here can PROVE the policy blocks
-- anyone or that a non-member's insert is actually refused. The real test
-- is a real member account, through the app (block 3 below, and the
-- hand-verification script in the Result doc).
-- =============================================================================

-- 1. requests_insert exists, on workflow.requests, is_member()-gated, and
--    is the ONLY new policy this migration added (requests_select from
--    migration 001 is untouched).
-- Expect 2 rows total for workflow.requests (select, insert), and the
-- insert row's `with_check` mentions is_member.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'requests'
order by cmd;


-- 2. workflow.request_handoffs is UNCHANGED by this migration — still
--    exactly the two policies migration 001 created (select, insert),
--    nothing added or removed here.
-- Expect 2 rows: select and insert, both already present before this
-- migration ran.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'request_handoffs'
order by cmd;


-- 3. The INSERT grant on workflow.requests predates this migration
--    (migration 002's blanket grant) and is still there — confirms §2.3
--    of the migration's own header rather than trusting the comment.
-- Expect workflow.requests to appear here already, unchanged by this
-- migration.
select table_name
from information_schema.role_table_grants
where table_schema = 'workflow'
  and table_name = 'requests'
  and grantee = 'authenticated'
  and privilege_type = 'INSERT';


-- 4. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as a real signed-in member:
--   a. Post a request with only the required fields filled in (the body,
--      and either a destination team or "I'm not sure"). Confirm it
--      succeeds and the confirmation state shows on the form.
--   b. Confirm the new row exists in workflow.requests with
--      requester_id = that member's own id, and with the fields left
--      blank on the form (client_id, site_id, project_id, current_owner_id,
--      current_stage_id) all null.
--   c. Post a second request with every optional field filled in (client,
--      site, project link). Confirm all of them saved correctly.
--   d. Attempting to leave BOTH the destination team unset AND "I'm not
--      sure" unclicked: confirm the Post action stays disabled with the
--      reason stated inline, and that no row is created if the underlying
--      Server Function is called directly without one of the two set.
-- These verdicts belong to Seanghakk — see the Result doc's own numbered
-- hand-verification script.
