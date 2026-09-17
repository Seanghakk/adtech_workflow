-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 012
-- Brief: ADTECH_WF_Brief_017_Lookup_Table_Admin §2
--
-- REQUIRED before migration 012 is applied to prod, per this repo's own
-- process (see migrations 009/010/011's own rollback files): run this
-- against the throwaway Supabase project that already carries migrations
-- 001-011 (Seanghakk runs it — this session has no psql/DATABASE_URL/
-- SQL-editor access).
--
-- Reverses, in dependency order: the two new stages write policies, the FK
-- constraints on requests.scope_type and stages.scope_type (and their
-- column comments — dropping the constraint does not remove the comment,
-- so it is reset explicitly to null rather than left describing a
-- constraint that no longer exists), and workflow.scope_types itself
-- (which implicitly drops its own three policies and seed rows — no
-- separate DROP POLICY needed, matching migration 005's rollback for
-- workflow.so_registers).
--
-- Does not touch `public`, does not touch workflow.reason_codes (this
-- migration added no policy there — see 012's own header, part 3).
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

drop policy if exists stages_update on workflow.stages;
drop policy if exists stages_insert on workflow.stages;

alter table workflow.requests drop constraint if exists requests_scope_type_fkey;
comment on column workflow.requests.scope_type is null;

alter table workflow.stages drop constraint if exists stages_scope_type_fkey;
comment on column workflow.stages.scope_type is null;

drop table if exists workflow.scope_types;

commit;
