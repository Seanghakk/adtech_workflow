-- =============================================================================
-- ADTECH Workflow Tracker — Migration 002: PostgREST exposure and role grants
-- Brief: ADTECH_WF_Brief_001D_Post_Apply_Reconciliation_And_Rollback_Test §2
--
-- Folds two steps into the repo that were run BY HAND against prod during
-- the Brief 001C apply and existed nowhere in any file until now. If this
-- database were rebuilt from the repository as it stood before this
-- migration, the app would fail with permission errors and nothing in the
-- codebase would explain why — the same class of drift (database ahead of
-- the repo, with the difference living only in someone's memory) that cost
-- the CMMS project real time.
--
-- PLACEMENT: a separate numbered migration, not appended to 001. Migration
-- 001 is now applied and verified in prod — it is a record of what has
-- already run, not a draft to keep editing (see its own header). These two
-- steps are net-new grants of capability that never existed in the repo in
-- any form, unlike Brief 001D §3's policy fix (which corrects text migration
-- 001 already contains). A separate file also matches this project's own
-- numbered-migration convention for anything that changes the live database
-- from here on.
--
-- IDEMPOTENT BY CONSTRUCTION: this file will be re-run against a database
-- that already has every one of these settings applied (they were done by
-- hand first, this file documents them second). ALTER ROLE ... SET is a
-- plain assignment; GRANT and ALTER DEFAULT PRIVILEGES ... GRANT are both
-- no-ops in Postgres when the privilege is already held. Nothing here uses
-- IF NOT EXISTS because nothing here needs it.
--
-- Touches ONLY the `workflow` schema's objects and the `authenticator`
-- role's config — no DDL against `public`, no CMMS grant touched.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. POSTGREST EXPOSED SCHEMAS
-- -----------------------------------------------------------------------------
--
-- PostgREST only serves schemas listed in the `authenticator` role's
-- pgrst.db_schemas setting. Migration 001's own header used to point at
-- Project Settings > API > Exposed schemas in the dashboard for this — that
-- field did not surface `workflow` as an option on the current dashboard
-- version, so SQL is the supported path here, not a workaround.
--
-- `graphql_public` is included DELIBERATELY, not left over from a template.
-- It is in Supabase's stock default list; omitting it here would silently
-- remove GraphQL access for the CMMS sharing this database. This is a
-- ROLE-LEVEL setting shared by both applications, not a per-app one — any
-- future edit to this line MUST preserve the full list (public,
-- graphql_public, workflow, and whatever else is added later), never
-- narrow it down to just what this app happens to need.
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, workflow';

notify pgrst, 'reload config';

-- -----------------------------------------------------------------------------
-- 2. ROLE GRANTS
-- -----------------------------------------------------------------------------
--
-- RLS policies FILTER access a role already has. They do NOT GRANT it.
-- Migration 001 enabled RLS on 19 tables and defined 27 policies but never
-- granted schema USAGE or any table privilege — so every query would have
-- failed with "permission denied for schema workflow", not an RLS-filtered
-- empty result. DO NOT delete the block below as redundant-looking noise
-- sitting next to a full set of policies: it is the other half of the
-- access-control story, not a duplicate of it.
--
-- No DELETE is granted anywhere, matching the schema having no DELETE
-- policy on any table (Brief §5, §4.1). The 13 SELECT-only tables (see
-- Result 001B §1) stay write-denied in practice: this grant lets
-- `authenticated` ATTEMPT an insert/update, and RLS's default-deny (no
-- policy for that command) refuses it — granting here does not loosen
-- what those tables actually allow.
grant usage on schema workflow to anon, authenticated;
grant select on all tables in schema workflow to anon, authenticated;
grant insert, update on all tables in schema workflow to authenticated;

-- Applies the same split to any table added to `workflow` by a future
-- migration, so ordinary schema growth doesn't require its own grant
-- block every time — this is what makes a later CREATE TABLE additive
-- rather than silently ungranted until someone remembers this file.
alter default privileges in schema workflow grant select on tables to anon, authenticated;
alter default privileges in schema workflow grant insert, update on tables to authenticated;

commit;
