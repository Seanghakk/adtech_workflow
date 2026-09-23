-- =============================================================================
-- ADTECH Workflow Tracker — Migration 029: project owner/consultant for the
-- AutoCAD export title block
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §3 item 1
--
-- CHECKED THE LIVE SCHEMA FIRST (§2's own instruction): workflow.projects
-- already has an `owner_id` column (migration 001) — but that is a
-- DIFFERENT, older concept: a uuid FK to public.user_profiles(id),
-- superseded by pic_id as the project's real accountable person
-- (migration 006's own header discusses this at length — "neither 'keep
-- owner_id as the project-level X' ... " — owner_id is legacy, not the
-- concept this brief needs). What Concept Note Rev 3 means by OWNER for
-- the AutoCAD title block is a TEXT NAME (the building/asset owner
-- organisation, e.g. a government ministry or landlord — not a person,
-- not an app user, not the main contractor, which is what workflow.
-- clients already carries via projects.client_id, unchanged). Reusing
-- owner_id's name would collide with a live, differently-typed column;
-- this migration adds two plainly-named new columns instead rather than
-- overloading an existing one. See this brief's own Result doc §1 for
-- the naming call spelled out.
--
-- Both fields optional, both text, no default, no backfill — an existing
-- project simply has neither until someone fills them in on a later
-- screen (not built here).
-- =============================================================================

begin;

alter table workflow.projects
  add column if not exists cad_owner_name text,
  add column if not exists cad_consultant_name text;

comment on column workflow.projects.cad_owner_name is
  'The building/asset OWNER organisation''s name, for the AutoCAD export
   title block (Concept Note Rev 3''s own OWNER field) — a plain text
   name, not an app user and not workflow.projects.owner_id (a different,
   older, person-FK concept — see this migration''s own header). Optional;
   no relation to workflow.clients, which still carries the main
   contractor unchanged.';

comment on column workflow.projects.cad_consultant_name is
  'The consulting engineer/firm''s name, for the AutoCAD export title
   block (Concept Note Rev 3''s own CONSULTANT field). Plain text, not an
   FK — no consultant table or user concept exists anywhere in this
   schema, and none is invented here. Optional.';

commit;
