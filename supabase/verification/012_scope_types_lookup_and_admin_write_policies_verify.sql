-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 012
-- Brief: ADTECH_WF_Brief_017_Lookup_Table_Admin §2
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 012_scope_types_lookup_and_admin_write_policies.sql — and after having
-- run the rollback against a non-production target first (rollback-test
-- project carrying 001-011 plus the stub public.user_profiles, per this
-- migration's own header).
--
-- STANDING TRAP (carried forward from Briefs 009/010/011/014 §0): these
-- queries go through pg_policies (the view), never the raw pg_policy
-- catalog — a block run in the SQL editor executes as table owner and
-- bypasses RLS entirely, so nothing here can PROVE a policy blocks
-- anyone. The real test is a real member/manager account, through the
-- app (block 6 below, and the Result doc's hand-verification script).
-- =============================================================================

-- 0. PRE-FLIGHT — run this BEFORE applying, not after (see the migration's
--    own header). Confirms the requests.scope_type FK will not fail on
--    live data.
-- Expect 0 rows.
select id, scope_type
from workflow.requests
where scope_type is not null and scope_type not in ('T', 'S', 'C', 'P', 'D');


-- 1. workflow.scope_types exists with exactly the five seeded rows, all
--    active, label_km carrying the placeholder convention (never real
--    Khmer — confirms this migration did not invent translations).
-- Expect 5 rows: T, S, C, P, D in sort_order, every label_km starting
-- with '[provisional'.
select code, label_en, label_km, sort_order, is_active
from workflow.scope_types
order by sort_order;


-- 2. workflow.scope_types' RLS policies — select for any member,
--    insert/update for a manager, both is_manager()-gated, no delete.
-- Expect 3 rows: select, insert, update. with_check on insert/update
-- mentions is_manager.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'scope_types'
order by cmd;


-- 3. workflow.stages now has insert/update policies alongside its
--    original select policy, all confirmed together rather than assumed.
-- Expect 3 rows: select (from migration 001, untouched), insert, update
-- (both new, both is_manager()-gated).
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'stages'
order by cmd;


-- 4. workflow.reason_codes is UNCHANGED by this migration — still exactly
--    the three policies migration 001 created (select, insert, update),
--    nothing added or removed here (this migration's own header, part 3).
-- Expect 3 rows, all already present before this migration ran.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'workflow' and tablename = 'reason_codes'
order by cmd;


-- 5. The two new foreign keys exist, point at scope_types.code, and carry
--    ON DELETE RESTRICT.
-- Expect 2 rows: stages_scope_type_fkey, requests_scope_type_fkey.
select
  tc.table_name,
  tc.constraint_name,
  rc.update_rule,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
where tc.table_schema = 'workflow'
  and tc.constraint_type = 'FOREIGN KEY'
  and tc.constraint_name in ('stages_scope_type_fkey', 'requests_scope_type_fkey');


-- 6. THE REAL TEST — cannot be proven from the SQL editor (see header).
-- Through the app, as a real signed-in member/manager:
--   a. As a non-manager member, confirm the /lookups screen is not
--      offered in navigation and, if reached directly by URL, shows the
--      same "no access" treatment restricted screens already use.
--   b. As a manager, open /lookups. Confirm all five scope_types rows
--      render, all eight reason_codes rows render (unchanged), and
--      workflow.stages renders its "nothing defined yet" empty state.
--   c. Create the first real stage: pick a scope type, enter a code,
--      label_en, sequence, and owner_team_id. Confirm it saves and
--      appears in the table, inactive by default (no label_km yet).
--   d. Attempt to activate that stage with no label_km set. Confirm the
--      activation is refused with the reason stated inline, and that no
--      row is changed if the underlying Server Function is called
--      directly without a real label_km.
--   e. Add a label_km, activate. Confirm it succeeds.
--   f. Attempt to edit that stage's code or scope type. Confirm no
--      control exists to do so (Brief §3.4 — immutable after creation).
--   g. As a non-manager member, confirm none of the above write actions
--      are reachable — RLS is the real enforcement; this is belt-and-
--      suspenders confirmation, not the only check.
-- These verdicts belong to Seanghakk — see the Result doc's own numbered
-- hand-verification script.
