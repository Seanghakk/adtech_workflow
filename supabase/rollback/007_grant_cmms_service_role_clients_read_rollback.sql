-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 007
-- Brief: ADTECH_CrossApp_Brief_Shared_Clients_Schema_And_Progress_Visibility
--
-- Reverses 007_grant_cmms_service_role_clients_read.sql: revokes
-- service_role's USAGE on schema workflow and SELECT on workflow.clients.
--
-- Does not touch anon or authenticated's own grants (migration 002),
-- does not touch client_owners/projects/any other table — this migration
-- only ever added the two grants below, so undoing it is exactly their
-- REVOKE, nothing broader.
--
-- WARNING, more consequential than most rollbacks in this project: the
-- CMMS's own migration 040_grant_service_role_workflow_clients.sql and
-- public.client_progress_summary() function depend on this grant for any
-- CMMS server-side code that reads workflow.clients directly (not through
-- that SECURITY DEFINER function, which doesn't need it). Running this
-- rollback breaks that CMMS-side capability immediately — coordinate with
-- whoever is working the CMMS repo before running this, don't run it
-- unilaterally just because a rollback file exists.
--
-- Wrapped in an explicit transaction, matching every other file in this
-- project.
-- =============================================================================

begin;

revoke select on workflow.clients from service_role;
revoke usage  on schema workflow  from service_role;

commit;
