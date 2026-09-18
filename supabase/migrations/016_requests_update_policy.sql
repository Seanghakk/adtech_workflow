-- =============================================================================
-- ADTECH Workflow Tracker — Migration 016: UPDATE policy for workflow.requests
-- Brief: ADTECH_WF_Brief_021_Screens_1c_And_1e_Triage_And_Request_Detail §4
--
-- NUMBERING CORRECTION AGAINST THE BRIEF'S OWN TEXT: the brief calls this
-- "Migration 014" and states "Migrations 001-013 are applied to production."
-- Confirmed against the live repo, not assumed: main is 9e69ef3 (Migration
-- 015: procurement line identity/owner/floors, Brief 022, PR #15) —
-- migrations 014 (procurement_team_write_policies, Brief 019) and 015
-- (procurement_line_identity_owner_and_floors, Brief 022) are ALREADY TAKEN
-- by different, already-merged migrations. This is Migration 016, the same
-- class of drift migration 014's own header already hit and corrected
-- against Brief 019's text. See this round's Result doc §0 for the full
-- account; nothing else about the brief's content is affected — this
-- migration does not depend on 014 or 015's content either way (both
-- touched workflow.procurement_lines only).
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST, NOT ASSUMED FROM THE BRIEF'S OWN
-- TEXT: migrations 001-015 are present in supabase/migrations/ and merged to
-- main. Whether migration 015 has actually been APPLIED to the live
-- database could not be confirmed from this session — no psql/DATABASE_URL/
-- SQL-editor access, the same standing limitation every migration round in
-- this repo has documented since Brief 001.
--
-- THE BRIEF'S OWN PREMISE, CHECKED RATHER THAN ASSUMED (§4.1): "Round 015
-- added only an INSERT policy on workflow.requests (requests_insert,
-- is_member()-gated). There is no UPDATE policy." Confirmed true by reading
-- migration 011 directly — requests_insert is the only write policy that
-- table has ever gained; requests_select (migration 001) is the only other
-- policy on it.
--
-- workflow.request_handoffs ALREADY HAS both request_handoffs_select and
-- request_handoffs_insert (migration 001, is_member()-gated) and is
-- append-only by design (no update/delete policy — confirmed by reading
-- migration 001's own table comment directly, per §4.1). NOT TOUCHED here.
--
-- THE POLICY ITSELF (§4.2) — gated on workflow.is_member(), matching
-- requests_insert's own gate exactly. Not is_manager(), not team
-- membership: per Brief §1.1, any active member may triage or route a
-- request, and per §1.3 either the requester or the current owner may
-- close one — both are application-layer decisions (see triage/actions.ts
-- and requests/[requestId]/actions.ts), not something this policy narrows,
-- exactly as §4.2 specifies.
--
-- THE GRANT (§4.3 — migration 002's own reminder that a policy filters a
-- grant, it does not create one). Migration 002 already runs a BLANKET
-- grant:
--   grant insert, update on all tables in schema workflow to authenticated;
-- workflow.requests already has this grant — confirmed by reading migration
-- 002 directly, nothing to add here. Verification block 2 re-confirms this
-- against the live grants table rather than trusting this claim.
--
-- NO DELETE (§4.4) — a request that was a mistake gets closed
-- (requests.closed_at), never erased. No delete policy is added; RLS
-- default-denies it, same convention as every other table in this schema.
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor, same as every
-- migration in this project. Applies BY HAND. Wrapped in an explicit
-- transaction. The rollback (016_requests_update_policy_rollback.sql) is
-- meant to be tested FIRST against `adtech-workflow-rollback-test` (carries
-- migrations 001-015 plus the stub public.user_profiles) before this is
-- applied to prod, per this repo's own standing process — see that file and
-- the verification file for the "run rollback, then re-apply, then verify"
-- order.
-- =============================================================================

begin;

drop policy if exists requests_update on workflow.requests;

create policy requests_update on workflow.requests
  for update
  using (workflow.is_member())
  with check (workflow.is_member());

comment on policy requests_update on workflow.requests is
  'Brief 021 §4.2 — any active member may update a request: triage (screen
   1c, routes destination_team_id/destination_unsure), hand-it-on (screen
   1e, routes current_owner_id) and close (screen 1e, sets closed_at). Gated
   on workflow.is_member() only, matching requests_insert exactly. The finer
   rules in Brief §1 (who may close; how re-routing is recorded) are
   application-layer decisions, not narrowed here — see this round''s
   Result doc §1 for exactly where each one lives, since Brief §1 calls all
   three provisional and expects them to change after team discovery.';

commit;
