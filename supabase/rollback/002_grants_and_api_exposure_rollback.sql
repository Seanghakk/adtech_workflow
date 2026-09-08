-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 002
-- Brief: ADTECH_WF_Brief_001D_Post_Apply_Reconciliation_And_Rollback_Test §2
--
-- Reverses 002_grants_and_api_exposure.sql: revokes the workflow-schema
-- grants and default privileges, and removes `workflow` from PostgREST's
-- exposed schema list — restoring pgrst.db_schemas to Supabase's stock
-- default (public, graphql_public), the value in effect before Brief 001D.
--
-- Does not touch `public`, does not touch any CMMS grant, does not touch
-- `graphql_public`'s own exposure — only removes `workflow` from the list
-- and undoes grants scoped to the `workflow` schema.
--
-- Ordering relative to 001's rollback: if tearing all the way down, run
-- THIS file before 001's rollback — 002's REVOKE/ALTER DEFAULT PRIVILEGES
-- statements target schema `workflow`, which 001's rollback then drops.
-- Running 001's rollback first would still work (dropping the schema
-- removes the grants along with it), but leaves nothing for this file to
-- act on and its checks would read as a false pass. Run in the stated
-- order for a clean audit trail. See Brief 001D §5's rollback test.
--
-- Wrapped in an explicit transaction, matching every other file in this
-- project.
-- =============================================================================

begin;

revoke insert, update on all tables in schema workflow from authenticated;
revoke select on all tables in schema workflow from anon, authenticated;
alter default privileges in schema workflow revoke insert, update on tables from authenticated;
alter default privileges in schema workflow revoke select on tables from anon, authenticated;
revoke usage on schema workflow from anon, authenticated;

alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public';

notify pgrst, 'reload config';

commit;
