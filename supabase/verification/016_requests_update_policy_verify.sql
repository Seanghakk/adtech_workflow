-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 016
-- Brief: ADTECH_WF_Brief_021_Screens_1c_And_1e_Triage_And_Request_Detail §4/§7
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 016_requests_update_policy.sql — and after having run the rollback
-- against a non-production target first (rollback-test project carrying
-- 001-015 plus the stub public.user_profiles, per this migration's own
-- header).
--
-- STANDING TRAP (carried forward from Briefs 009/010/011/012/014/015 §0):
-- these queries go through pg_policies (the view), never the raw pg_policy
-- catalog — a block run in the SQL editor executes as table owner and
-- bypasses RLS entirely, so nothing here can PROVE a policy blocks or
-- admits anyone. The is_member() gate itself CANNOT be proven from here at
-- all (block 3) — it needs a real signed-in account through the app.
-- =============================================================================

-- 1. workflow.requests now has select/insert/update policies, all
--    confirmed together rather than assumed.
-- Expect 3 rows: requests_select (migration 001), requests_insert
-- (migration 011, untouched), requests_update (new, this migration).
-- qual/with_check on requests_update both mention is_member.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'requests'
order by cmd;


-- 2. THE GRANT — re-confirms migration 002's blanket grant actually
--    reaches workflow.requests, rather than trusting the migration's own
--    comment.
-- Expect rows covering INSERT and UPDATE (at minimum) for role
-- 'authenticated' on table 'requests'.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow' and table_name = 'requests' and grantee = 'authenticated'
order by privilege_type;


-- 3. No delete policy exists for workflow.requests.
-- Expect 0 rows.
select policyname
from pg_policies
where schemaname = 'workflow' and tablename = 'requests' and cmd = 'DELETE';


-- 4. workflow.request_handoffs remains append-only — untouched by this
--    migration, re-confirmed rather than assumed.
-- Expect 2 rows: request_handoffs_select, request_handoffs_insert. No
-- UPDATE or DELETE row.
select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'request_handoffs'
order by cmd;


-- 5. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as real signed-in accounts:
--   a. As any active member, triage an unrouted request on screen 1c
--      (destination_unsure = true or destination_team_id null). Confirm
--      the UPDATE succeeds and the request drops out of the triage queue.
--   b. As any active member, open a routed request's detail (screen 1e)
--      and "hand it on" to a named person. Confirm the UPDATE succeeds,
--      current_owner_id changes, and a new workflow.request_handoffs row
--      is inserted (request_handoffs_insert, migration 001 — untouched).
--   c. As the requester (not the current owner), close a request from
--      screen 1e. Confirm the UPDATE succeeds (closed_at set).
--   d. As the current owner (not the requester), close a DIFFERENT
--      request. Confirm the UPDATE also succeeds — §1.3 allows either.
--   e. As a member who is neither the requester nor the current owner,
--      attempt "close it" through the app. Confirm this is refused by the
--      APPLICATION layer (Brief §1.3 — not a database policy; requests_
--      update itself does not distinguish these callers).
--   f. Confirm no delete control exists anywhere and a direct delete
--      attempt (if tried via the API) is refused.
-- These verdicts belong to Seanghakk — see the Result doc's own numbered
-- hand-verification script.
