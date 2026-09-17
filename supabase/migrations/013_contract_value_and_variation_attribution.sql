-- =============================================================================
-- ADTECH Workflow Tracker — Migration 013: contract value + variation
-- attribution (raised_by, approved_by, request_id)
-- Brief: ADTECH_WF_Brief_020_Contract_Value_And_Variation_Attribution §2/§3
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST: main is 71a4875 (Migration 012 +
-- Lookup Table Admin, Brief 017, PR #11). PR #12 (screens 2a/2b, Brief 018)
-- is open, not merged — this migration does not depend on it either way,
-- per the brief's own §0. This session has no psql/DATABASE_URL/SQL-editor
-- access — the same standing limitation every migration here has
-- documented since Brief 001 — so nothing below is verified by running;
-- see the verification file and this round's Result doc for exactly what
-- could and could not be checked from here.
--
-- SCHEMA ONLY (§0/§4) — closes two gaps Result 018 found while building
-- screens 2a/2b and reported rather than worked around a second time
-- (Result 018 §3.1: no contract-value column anywhere; §3.3: no
-- per-variation owner, breaking the app's own "named person, then age"
-- invariant at the variation row). No screen changes this round — 2a does
-- not gain the contract-value header or per-variation owners here; that is
-- its own small round once these columns exist and have real data (§4).
--
-- WHAT THIS MIGRATION DOES, two parts, exactly per the brief:
--
--   1. workflow.projects.contract_value (§2) — nullable numeric(14, 2),
--      matching workflow.variations.committed_amount's own type exactly
--      (read directly from migration 001, not assumed) so the two can be
--      summed/compared without a cast. Nullable because a project awaiting
--      an SO (screen 2b) has no contract value either — the ordinary
--      awaiting-SO state, not an error. NO WRITE PATH is built this round
--      (§2.5) — nothing in the UI sets this column yet; it renders empty
--      until the SO register import or a future edit screen populates it.
--
--      CURRENCY (§2.4) — NOT ADDED, ON PURPOSE, NOT DECIDED HERE. Neither
--      this column nor workflow.variations.committed_amount carries a
--      currency column, and none exists anywhere else in this schema
--      either. Cambodia works in both USD and KHR. Whether that absence is
--      safe (everything is USD in practice) or a latent problem is left to
--      Seanghakk — see the Result doc's plain question rather than a
--      currency column added on this session's own initiative.
--
--   2. workflow.variations gains three columns (§3):
--        raised_by    -> FK public.user_profiles(id), ON DELETE RESTRICT
--                        (matches every other person-reference column in
--                        this schema — projects.pic_id, progress_updates.
--                        author_id, etc. — read directly, not assumed).
--                        Pairs with the existing raised_at.
--        approved_by  -> FK public.user_profiles(id), ON DELETE RESTRICT,
--                        nullable. Pairs with the existing approved_at and
--                        is_approved. NULL while unapproved is correct and
--                        expected, not a gap.
--        request_id   -> FK workflow.requests(id), nullable, NO explicit
--                        ON DELETE clause — matches the one existing
--                        precedent for an FK to workflow.requests
--                        (request_handoffs.request_id, migration 001, also
--                        has no explicit ON DELETE clause), rather than
--                        picking RESTRICT/CASCADE fresh for this one. The
--                        Rev 2 mockup annotates variations with the request
--                        that raised them ("from REQ-0299") and there was
--                        nothing to join against (Result 018 §3.3) — this
--                        is that join. Nullable: not every variation starts
--                        as a request.
--      FK target is public.user_profiles, NOT workflow.members — nothing
--      in this schema references members, which is why unlinking a member
--      orphans nothing (Result 014 §3); matching that precedent here too.
--
--      raised_by NULLABLE OR NOT — DECIDED AT APPLY TIME, EXPLICITLY,
--      PER §3.3, NOT BURIED. This session has no SQL access to run the
--      count that decides this (§1), so the column is added nullable
--      first, then the DO block below inspects workflow.variations' own
--      row count AT THE MOMENT THIS MIGRATION ACTUALLY RUNS and picks the
--      branch itself:
--        - 0 rows  -> tightens raised_by to NOT NULL. Every variation from
--                     now on carries a named person and the invariant
--                     holds properly rather than staying optional.
--        - >0 rows -> leaves raised_by NULLABLE. Backfilling who raised a
--                     historical variation would mean inventing an answer,
--                     which is worse than an honest null (§3.3's own
--                     instruction). Tightening this later needs a real
--                     backfill decision, not a guess made here.
--      Either branch RAISE NOTICEs which one it took and why, so the
--      choice is visible in the Supabase SQL editor's own output when this
--      is applied — not something Seanghakk has to infer afterward. The
--      verification file's block 0 gives the same pre-flight counts to
--      read by eye BEFORE applying, per §1's own instruction.
--
-- NO GRANTS ADDED. Both workflow.projects and workflow.variations already
-- hold migration 002's blanket SELECT/INSERT/UPDATE grants (both tables
-- predate that migration) — adding a column to an existing table needs no
-- new grant, same reasoning migration 005 and 012 both already documented
-- for their own new columns.
--
-- NO RLS CHANGES. Both tables' existing SELECT policies (workflow.
-- projects_select / variations_select, migration 004, can_view_project()-
-- gated) already cover every column on the row, including these new ones —
-- nothing to add for reads. NO WRITE POLICIES either (§4): nothing in the
-- UI writes workflow.variations or workflow.projects.contract_value today,
-- and a policy for a write path that does not exist yet is speculative —
-- migration 009 found DELETE policies that had sat inert since the schema
-- began for exactly this reason, and this round does not repeat it.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.projects.contract_value — §2
-- -----------------------------------------------------------------------------

alter table workflow.projects
  add column contract_value numeric(14, 2);

comment on column workflow.projects.contract_value is
  'The SO''s own headline contract value, against which variations are '
  'measured (screen 2a) — this column did not exist when that screen was '
  'built (Brief 018 / Result 018 §3.1), so its headline figure had nothing '
  'behind it. Nullable: a project awaiting an SO (screen 2b) has no '
  'contract value either — the ordinary awaiting-SO state, not an error. '
  'Type matches workflow.variations.committed_amount (numeric(14,2)) '
  'exactly so the two can be summed/compared without a cast. NO WRITE '
  'PATH EXISTS YET (Brief 020 §2.5) — nothing in the UI sets this column '
  'this round; it will be populated by the SO register import or a future '
  'edit screen, and an empty value here means "not yet entered," not '
  '"broken." NO CURRENCY COLUMN anywhere in this schema (Brief 020 §2.4) — '
  'flagged as an open question for Seanghakk in the Result doc, not '
  'decided in this migration.';

-- -----------------------------------------------------------------------------
-- 2. workflow.variations — raised_by, approved_by, request_id — §3
-- -----------------------------------------------------------------------------

alter table workflow.variations
  add column raised_by uuid references public.user_profiles (id) on delete restrict;

alter table workflow.variations
  add column approved_by uuid references public.user_profiles (id) on delete restrict;

alter table workflow.variations
  add column request_id uuid references workflow.requests (id);

comment on column workflow.variations.raised_by is
  'Who raised this variation — closes the gap Result 018 §3.3 found: a '
  'variation row carried no named person, breaking the app''s own "named '
  'person, then age" invariant at exactly the row where money sits at '
  'risk. FK to public.user_profiles(id), matching projects.pic_id and '
  'progress_updates.author_id''s own target, ON DELETE RESTRICT — a '
  'person leaving must not delete the record of a variation they raised. '
  'Pairs with the existing raised_at. NULLABLE OR NOT NULL was decided at '
  'apply time from workflow.variations'' own live row count — see this '
  'migration''s header and the Result doc for which branch was taken.';

comment on column workflow.variations.approved_by is
  'Who approved this variation, nullable — NULL while is_approved is '
  'false is correct and expected, not a gap (pairs with the existing '
  'approved_at/is_approved). FK to public.user_profiles(id), ON DELETE '
  'RESTRICT, same reasoning as raised_by above.';

comment on column workflow.variations.request_id is
  'The request that raised this variation, if any — the Rev 2 mockup '
  'annotates variations with their originating request ("from REQ-0299") '
  'and nothing existed to join against (Result 018 §3.3). Nullable: not '
  'every variation starts as a request. FK to workflow.requests(id) with '
  'no explicit ON DELETE clause, matching the one existing precedent for '
  'this FK target (request_handoffs.request_id, migration 001) rather '
  'than choosing RESTRICT/CASCADE fresh.';

-- -----------------------------------------------------------------------------
-- 3. raised_by NOT NULL vs nullable — decided here, at apply time, per §3.3.
--    See this file's header for the full reasoning behind each branch.
-- -----------------------------------------------------------------------------

do $$
declare
  v_variation_count integer;
begin
  select count(*) into v_variation_count from workflow.variations;

  if v_variation_count = 0 then
    alter table workflow.variations alter column raised_by set not null;
    raise notice 'Migration 013: workflow.variations had 0 rows — raised_by set NOT NULL (Brief 020 §3.3, empty-table branch). Every variation from now on carries a named person.';
  else
    raise notice 'Migration 013: workflow.variations had % row(s) — raised_by left NULLABLE (Brief 020 §3.3, non-empty branch). Backfilling who raised a historical variation would mean inventing an answer; tightening this later needs a real backfill decision, not a guess.', v_variation_count;
  end if;
end $$;

commit;
