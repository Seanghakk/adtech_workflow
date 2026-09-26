-- =============================================================================
-- The minimum Supabase-shaped environment this repo's migrations assume.
-- Applied to a fresh pglite before migrations 001…NNN.
-- =============================================================================
--
-- Ported from adtech-cmms's own preamble (its Brief 033 built the rollback
-- runner first), with one deliberate difference: that file carries a STUB of
-- the `workflow` schema, because CMMS migration 039 reads this app's tables
-- across the two repos. Here the workflow schema is created by our OWN
-- migrations, so stubbing it would collide with migration 001. The mirror
-- image is public.user_profiles below — CMMS owns that table, our migrations
-- only FK into it, so here it is the stub.
--
-- Everything in this file mirrors what Supabase provisions BEFORE a project's
-- own migrations run. Nothing here is a migration; nothing here may assert.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Roles and default privileges.
-- ---------------------------------------------------------------------------
DO $$ BEGIN CREATE ROLE anon           NOLOGIN;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated  NOLOGIN;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role   NOLOGIN BYPASSRLS;  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- authenticator is the role PostgREST logs in AS before switching to anon /
-- authenticated. Migration 002 grants to it by name, so the stack will not
-- build without it.
DO $$ BEGIN CREATE ROLE authenticator  NOLOGIN;            EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN GRANT anon, authenticated, service_role TO authenticator; EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- auth schema. Our migrations reference auth.users (FK target for
-- updated_by / added_by columns) and auth.uid() (read by nearly every RLS
-- policy and by workflow.is_superadmin / current_team).
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (
  instance_id        uuid,
  id                 uuid PRIMARY KEY,
  aud                varchar(255),
  role               varchar(255),
  email              varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
AS $$
  SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;

-- ---------------------------------------------------------------------------
-- public.user_profiles — the CMMS's table, not ours.
--
-- It lives in the SAME Supabase database but is created by the separate
-- adtech-cmms repo's migrations. This harness only applies THIS repo's
-- supabase/migrations/*.sql, so without a stub every migration that FKs into
-- it fails with "relation public.user_profiles does not exist" — not a real
-- bug, just the harness not knowing about the other repo.
--
-- Column set copied from PRODUCTION on 26 Sep 2026, read-only, so the stub
-- matches what is actually there rather than what we assume. If a future
-- migration reads another column, extend it then; there is no mechanism to
-- keep two repos in lockstep automatically, and pretending otherwise is how
-- a mirror quietly becomes its own diverging thing (docs/rollback-test-sync.md
-- makes the same point about the catalog comparison).
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_profiles (
  id                   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name            text NOT NULL,
  role                 text NOT NULL DEFAULT 'technician',
  telegram_chat_id     text,
  telegram_username    text,
  telegram_linked_at   timestamptz,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  username             text,
  must_change_password boolean NOT NULL DEFAULT true
);
