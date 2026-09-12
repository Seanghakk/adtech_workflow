-- =============================================================================
-- ADTECH Workflow Tracker — Migration 007: grant the CMMS's service_role
-- read access to workflow.clients
-- Brief: ADTECH_CrossApp_Brief_Shared_Clients_Schema_And_Progress_Visibility
-- (rev 3) — Stage 2 GoAhead, item 1/3, from the CMMS side's own Claude Code
-- session. See adtech-cmms's PR #85 (crossapp-shared-clients-stage2) and its
-- own 039_workflow_clients_link.sql / 040_grant_service_role_workflow_
-- clients.sql for the full cross-app context.
--
-- WHAT AND WHY: the CMMS added sites.client_id (a cross-schema FK to
-- workflow.clients) and public.client_progress_summary() (a SECURITY
-- DEFINER function joining CMMS tables with workflow.projects via
-- workflow.clients) — rev 3's decision to adopt this schema's own,
-- pre-existing clients table as the one shared client entity rather than
-- building a new schema. Neither of those needed this grant to work (DDL
-- and the one-time backfill ran via the privileged Supabase SQL-editor
-- session; the function is SECURITY DEFINER, so it runs as its owner, not
-- as whatever role calls it). What DOES need it: ordinary CMMS server-side
-- code using its own plain service-role key (no SECURITY DEFINER wrapper)
-- to read workflow.clients directly — confirmed missing during that
-- session's own Stage 1a investigation ("permission denied for schema
-- workflow", Postgres 42501): migration 002 in THIS repo only ever granted
-- schema USAGE / table SELECT to anon and authenticated, never
-- service_role, because until now nothing outside this app's own RLS-
-- gated session clients had a reason to read this schema directly.
--
-- NARROWEST WORKING GRANT, proposed in the CMMS's own Stage 2 Result doc
-- and approved without modification in its GoAhead brief: workflow.clients
-- ONLY, service_role ONLY. Does NOT touch client_owners, projects, or any
-- other table in this schema, and does NOT touch anon/authenticated (their
-- own grants from migration 002 are untouched).
--
-- APPLIED BY HAND already (Seanghakk, Supabase SQL editor, 2026-09-12),
-- same "database ahead of the repo" convention this project has followed
-- since migration 001 — this file documents it, matching exactly the
-- reasoning migration 002's own header gives for existing: "if this
-- database were rebuilt from the repository as it stood before this
-- migration, the app would fail with permission errors and nothing in the
-- codebase would explain why." Confirmed working after application: the
-- CMMS's own service-role key successfully SELECTed from workflow.clients
-- (see the CMMS's ADTECH_CrossApp_Result_Shared_Clients_Schema_Stage2_
-- GoAhead for the confirmation).
--
-- IDEMPOTENT BY CONSTRUCTION: GRANT is a no-op in Postgres when the
-- privilege is already held, so re-running this against the already-
-- granted prod database is safe — same reasoning migration 002 states for
-- itself. This file's purpose is the repo-as-record-of-truth, not a
-- pending change.
--
-- service_role already exists as a role in this project (it's the same
-- Supabase project as the CMMS) — this migration only adds grants on it,
-- it does not create the role.
-- =============================================================================

begin;

grant usage  on schema workflow  to service_role;
grant select on workflow.clients to service_role;

commit;
