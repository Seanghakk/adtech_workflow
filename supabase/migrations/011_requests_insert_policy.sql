-- =============================================================================
-- ADTECH Workflow Tracker — Migration 011: INSERT policy for workflow.requests
-- Brief: ADTECH_WF_Brief_015_Screen_1a_Post_A_Request §2
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST: main is 3770bfc, migration 010
-- merged (PR #9). This session has no psql/DATABASE_URL/SQL-editor access —
-- the same standing limitation every migration here has documented since
-- Brief 001 — so nothing below is verified by running; see the
-- verification file and this round's Result doc for exactly what could and
-- could not be checked from here.
--
-- THE BRIEF'S OWN PREMISE, CHECKED RATHER THAN ASSUMED (§2): "workflow.
-- requests and workflow.request_handoffs almost certainly have SELECT
-- policies and no write policies." Read migration 001 directly (lines
-- ~772-778): this is only HALF true.
--
--   - workflow.requests has requests_select only. No INSERT policy exists.
--     THIS is what this migration adds.
--   - workflow.request_handoffs already has BOTH request_handoffs_select
--     AND request_handoffs_insert (is_member()-gated), created in
--     migration 001 itself, with an explicit comment that it is meant to
--     stay append-only (no UPDATE/DELETE). Nothing more is needed on this
--     table, and this round does not touch it — see Result doc §1.
--
-- THE GRANT (§2.3, migration 002's own reminder that a policy filters a
-- grant, it does not create one): migration 002 already runs
--   grant insert, update on all tables in schema workflow to authenticated;
-- as a BLANKET grant across every table in the schema, plus a matching
-- ALTER DEFAULT PRIVILEGES clause for any table added later. workflow.
-- requests already has this grant — confirmed by reading migration 002
-- directly, nothing to add here. Verification block 3 below re-confirms
-- this against the live grants table rather than trusting this comment.
--
-- THE POLICY ITSELF (§2.1): any active member may create a request —
-- gated on workflow.is_member(), matching request_handoffs_insert's own
-- gate exactly, not is_manager() and not team/PIC membership. Posting a
-- request is meant to be as easy as sending a Telegram message.
--
-- UPDATE and DELETE are deliberately NOT added here (§2.2) — editing or
-- withdrawing a request is a real question that belongs with screen 1e,
-- not something to guess at while building the intake form.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

create policy requests_insert on workflow.requests
  for insert with check (workflow.is_member());

commit;
