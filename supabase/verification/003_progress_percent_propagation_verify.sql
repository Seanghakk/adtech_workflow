-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 003
-- Brief: ADTECH_WF_Brief_002_Auth_Shell_And_Screen_6a §3
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 003_progress_percent_propagation.sql. Catalog-only checks, same
-- discipline as every other verification file here — but see the note
-- at the bottom: this migration's actual BEHAVIOUR (does an insert really
-- propagate the percentage?) cannot be proven by a catalog query alone.
-- =============================================================================

-- 1. Both triggers exist on workflow.progress_updates, in the right timing.
-- Expect 2 rows: progress_updates_compute_delta | BEFORE,
--                progress_updates_bump_movement  | AFTER
select tgname as trigger_name,
       case when tgtype & 2 = 2 then 'BEFORE' else 'AFTER' end as timing
from pg_trigger
where tgrelid = 'workflow.progress_updates'::regclass
  and not tgisinternal
order by timing desc, trigger_name;


-- 2. Both functions exist in schema `workflow`, not `public`.
-- Expect 2 rows, both nspname = 'workflow'.
select p.proname as function_name, n.nspname as schema_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('compute_progress_update_delta', 'bump_last_meaningful_movement')
order by p.proname;


-- 3. Read the live source of bump_last_meaningful_movement() and eyeball
-- it for the two rules: percent_complete set unconditionally, and
-- last_meaningful_movement_at gated on meets_threshold. Not a pass/fail
-- query — a listing to review, same as 001's verify block 13.
select pg_get_functiondef('workflow.bump_last_meaningful_movement()'::regprocedure);


-- 4. Same, for compute_progress_update_delta() — eyeball that old_percent
-- is read from the live table, not trusted from NEW.
select pg_get_functiondef('workflow.compute_progress_update_delta()'::regprocedure);


-- =============================================================================
-- WHAT THIS FILE CANNOT PROVE
-- =============================================================================
-- Blocks 1-4 confirm the triggers and functions EXIST with the intended
-- source text. They do NOT prove an actual INSERT propagates correctly —
-- that requires a real row to exist in workflow.projects, and
-- projects/project_items are both empty in prod today (Brief 002 §5.4).
-- Rather than insert-then-delete a throwaway row against production here
-- (which this environment cannot do anyway — no psql, no DATABASE_URL,
-- no Docker), the real behavioural test is: apply supabase/seed_dev.sql
-- in a review/dev context, then exercise screen 6a itself end to end and
-- confirm the project's percentage changes as a RESULT of the insert. See
-- Result 002 §"what was verified by running code vs by reading" for what
-- was and wasn't actually run this round.
-- =============================================================================
