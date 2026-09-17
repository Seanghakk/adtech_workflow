-- =============================================================================
-- ADTECH Workflow Tracker — Migration 014: procurement writes its own lines
-- Brief: ADTECH_WF_Brief_019_Screen_2c_Procurement_Line §3
--
-- NUMBERING CORRECTION AGAINST THE BRIEF'S OWN TEXT: the brief calls this
-- "Migration 013." Confirmed against the live repo, not assumed: main is
-- b209ac6 (Migration 013: contract value + variation attribution, Brief 020,
-- PR #13) — migration 013 is ALREADY TAKEN by a different, already-merged
-- migration. This is Migration 014. See this round's Result doc §0 for the
-- full account; nothing else about the brief's content is affected.
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST, NOT ASSUMED FROM THE BRIEF'S OWN
-- TEXT: migrations 001-013 are present in supabase/migrations/ and merged to
-- main. Whether 013 has actually been APPLIED to the live database could not
-- be confirmed from this session — no psql/DATABASE_URL/SQL-editor access,
-- the same standing limitation every migration round in this repo has
-- documented since Brief 001. This migration does not depend on 013's
-- content either way (013 touched projects/variations only).
--
-- WHAT THIS MIGRATION DOES, exactly per brief §3, no more:
--
--   workflow.procurement_lines gains INSERT and UPDATE policies, both keyed
--   on TEAM membership rather than PIC-of-the-record — the first team-keyed
--   write policy in this schema (§3.1). Every other write policy so far
--   (migration 006 for progress_updates, migration 009 for floor detail)
--   keys on being the PIC of the record, with NO manager bypass anywhere.
--   Procurement is different on purpose: the project's PIC does not source
--   products and must not be the one recording that work, so the write
--   grant instead follows team membership.
--
--   TEAM IDENTIFICATION (§3.2) — by CODE, never by label, reusing
--   workflow.current_team() (migration 001) rather than inventing a second
--   helper: a label rename must never be able to grant or revoke write
--   access, the same class of failure Brief 013/014 fixed for display
--   strings. workflow.teams carries the procurement team as TWO seeded rows
--   (migration 001): 'procurement_local' and 'procurement_overseas'. BOTH
--   count, confirmed by reading migration 001 directly rather than assumed
--   as one row.
--
--   MANAGERS (§3.3) — read but do not write, matching migration 006's own
--   precedent exactly: migration 006 removed workflow.is_manager() from
--   progress_updates_insert entirely, with no manager bypass surviving
--   anywhere in this schema. That precedent is "no manager bypass, full
--   stop" — so no manager-bypass clause is added here either. Read access
--   for the PIC and for managers needs no new policy: procurement_lines_
--   select (migration 001) is already workflow.is_member(), which already
--   covers both — confirmed by reading migration 001 directly, not assumed.
--
--   NO DELETE (§3.4) — consistent with every other table in this schema. A
--   wrong procurement line gets corrected, not removed. No delete policy is
--   added; RLS default-denies it, same convention as everywhere else.
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor, same as every
-- migration in this project. Applies BY HAND. Wrapped in an explicit
-- transaction. The rollback (014_procurement_team_write_policies_rollback.sql)
-- is meant to be tested FIRST against `adtech-workflow-rollback-test` (carries
-- migrations 001-013 plus the stub public.user_profiles) before this is
-- applied to prod, per this repo's own standing process — see that file and
-- the verification file for the "run rollback, then re-apply, then verify"
-- order. This migration needs no additional public.user_profiles column
-- beyond what that stub already carries (it references no user_profiles
-- column at all — the check is entirely against workflow.members/
-- workflow.teams via workflow.current_team()).
-- =============================================================================

begin;

drop policy if exists procurement_lines_insert on workflow.procurement_lines;

create policy procurement_lines_insert on workflow.procurement_lines
  for insert with check (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

comment on policy procurement_lines_insert on workflow.procurement_lines is
  'Team-keyed, NOT PIC-keyed — the first such write policy in this schema
   (Brief 019 §3.1). An active member of either procurement team (identified
   by workflow.teams.code, never by label — see workflow.current_team(),
   migration 001) may insert a procurement line for any project. The
   project''s PIC is deliberately excluded: they do not source products and
   must not be the one recording that work. No manager bypass, matching
   migration 006''s precedent exactly (no exceptions anywhere in this
   schema).';

drop policy if exists procurement_lines_update on workflow.procurement_lines;

create policy procurement_lines_update on workflow.procurement_lines
  for update
  using (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  )
  with check (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

comment on policy procurement_lines_update on workflow.procurement_lines is
  'Same team-keyed rule as procurement_lines_insert, both directions (using
   and with check) — Brief 019 §3.1/§3.2. No manager bypass, no PIC bypass.';

-- No procurement_lines_delete policy — Brief 019 §3.4, matching every other
-- table in this schema. RLS default-denies DELETE.

commit;
