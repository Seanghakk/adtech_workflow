-- =============================================================================
-- ADTECH Workflow Tracker — Migration 027: shop drawing approval lifecycle
-- Brief: ADTECH_WF_Brief_083_Shop_Drawing_Lifecycle_Investigate_And_Draft
--
-- DRAFT ONLY. NOT APPLIED BY THIS BRIEF, NOT EVEN TO THE ROLLBACK-TEST
-- PROJECT (a separate rollback-test brief follows, same pattern as
-- migrations 025/026 and Brief 079). No UI reads or writes any of this
-- yet — that is a later, separate Claude Design brief once this data
-- model exists and Seanghakk has confirmed §4d below.
--
-- WHY: workflow.shop_drawing_items' 3-state status (not_started/
-- in_progress/done, migration 008) cannot say "our team is drawing it"
-- vs "the consultant has it" — the single most useful fact a PIC needs
-- (whose court the ball is in). Brief 080 guessed at this mapping and
-- guessed wrong; Brief 082 replaced the guess with plain status labels
-- as an interim measure. This migration is the real fix, decided by
-- Seanghakk 22 Sep 2026: not started -> drafting -> internal check ->
-- submitted -> returned (code A/B/C) -> approved, with reviewer identity
-- and revision history tracked per submission.
--
-- =============================================================================
-- THE OVERRIDING CONSTRAINT (brief's own words): ADDITIVE, NOTHING
-- EXISTING BREAKS. Confirmed against every real reader/writer of
-- workflow.shop_drawing_items found by reading the actual app code, not
-- assumed — see this brief's own Result doc §3b for the full list with
-- file:line. In summary, all of these keep working completely unchanged
-- because this migration touches NEITHER shop_drawing_items.status NOR
-- any existing policy/trigger/grant on that table:
--
--   - workflow.compute_project_rollup_percent() (migration 008) reads
--     shop_drawing_items.status directly (done=100/in_progress=50/
--     not_started=0) for BOTH the project-level bucket and every floor's
--     bucket. status is UNCHANGED by this migration — rollup percent is
--     therefore byte-for-byte unaffected. The new lifecycle is
--     deliberately NOT wired to status in this migration (no UI exists
--     to keep them in sync yet); see design question (a) below for how
--     that should eventually work.
--   - src/app/(app)/projects/[projectId]/update/page.tsx's shop_drawing_
--     items query (id, floor_id, scope, drawing_type, status) — reads
--     ONLY status, unaffected.
--   - src/app/.../update/floor-actions.ts's updateShopDrawingStatus() —
--     writes ONLY status, through shop_drawing_items' EXISTING PIC-keyed
--     UPDATE policy (migration 019). This migration adds no column to
--     shop_drawing_items that changes what that policy governs.
--   - src/app/.../floors/actions.ts's floor-deletion "isPristine" check
--     reads shop_drawing_items.status (every floor-scope item must be
--     'not_started') and, if clean, DELETEs the floor's shop_drawing_
--     items rows. This migration's new submissions table references
--     item_id ON DELETE RESTRICT — see §4b's own note on why this is
--     safe in practice, flagged rather than silently assumed.
--   - src/app/(app)/shop-drawing/page.tsx (Briefs 080/082) reads status
--     only, via computeShopDrawingCounts() — untouched by this brief on
--     purpose (brief §5 out-of-scope), unaffected either way.
--   - workflow.seed_floor_children() (migration 008) inserts new
--     shop_drawing_items rows with only project_id/floor_id/scope/
--     drawing_type set — status defaults to 'not_started' as before;
--     the new pre_submission_stage column defaults to NULL, which is the
--     correct "nothing has happened yet" state for a freshly seeded row.
--
-- Wrapped in one transaction, matching every migration in this project.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.shop_drawing_items — two ADDITIVE columns.
-- -----------------------------------------------------------------------------

alter table workflow.shop_drawing_items
  add column pre_submission_stage text,
  add column legacy_done_no_lifecycle_history boolean not null default false;

alter table workflow.shop_drawing_items
  add constraint shop_drawing_items_pre_submission_stage_check
    check (pre_submission_stage is null or pre_submission_stage in ('drafting', 'internal_check'));

comment on column workflow.shop_drawing_items.pre_submission_stage is
  'Design question (a) — STORED, not derivable, and deliberately narrow:
   the ONLY sub-state this migration stores on the item itself, because
   it is the ONLY part of the lifecycle with no natural home in the
   submissions history below (there is no submission row yet to hang
   "currently drafting" or "currently being checked" off of). Meaningful
   ONLY when the item has no OPEN (unreturned) submission and its LATEST
   submission (if any) was not approved (code is null or ''C'') — in
   every other case the item''s real current stage is DERIVED from
   shop_drawing_submissions and this column should be ignored by any
   reader. See this brief''s Result doc §4a for the full derivation rule
   and how drift is prevented (one shared function, once a UI consumes
   this — not built here, no UI in this brief).
   NULL = not yet started on this lifecycle at all (matches status =
   ''not_started'' for a fresh/legacy row, or between revisions before
   drafting resumes). Nothing writes to this column yet — no UI exists;
   see the Result doc for why RLS on this column is inherited from the
   TABLE''s existing PIC-keyed policy (migration 019), not team-gated,
   until a future brief decides whether that should change.';

comment on column workflow.shop_drawing_items.legacy_done_no_lifecycle_history is
  'Design question (e) — set true ONLY by this migration''s own one-time
   backfill below, for a row that was ''done'' before this migration with
   no way to know whether a real reviewer ever approved it (this schema
   had no reviewer concept before now — see this file''s own header).
   Never set true by anything else afterwards. Lets a future UI show
   "done (pre-lifecycle, unverified)" honestly instead of either
   fabricating an approval record or silently losing the distinction
   between a real, reviewer-approved item and old test data.';

-- -----------------------------------------------------------------------------
-- 2. workflow.shop_drawing_submissions — the history table (design
--    question b). Design question (a)'s own instruction, applied here:
--    the current stage should never be able to contradict this history,
--    so this table — not a stored "current stage" column — is the
--    source of truth for every submitted-or-later state.
-- -----------------------------------------------------------------------------

create table workflow.shop_drawing_submissions (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references workflow.shop_drawing_items (id) on delete restrict,
  revision      integer not null,

  -- Written ONCE, at submission time (design question b's own "a
  -- submission row is written once when sent" — the internal check that
  -- gates sending is recorded HERE, on the same row, rather than a
  -- separate table: the check necessarily happens before/at the moment
  -- of submission, so this row already IS "which revision, checked by
  -- whom, when" — see design question (d), where WHO is allowed to check
  -- is flagged as Seanghakk's own decision, not this migration's).
  checked_by    uuid not null references public.user_profiles (id) on delete restrict,
  checked_at    timestamptz not null,
  submitted_at  timestamptz not null default now(),
  submitted_by  uuid not null references public.user_profiles (id) on delete restrict,
  reviewer_party text not null,
  reviewer_org  text,

  -- Filled in ONCE, when returned (design question b's own "completed
  -- once when returned" — never altered again after both are set; see
  -- the immutability trigger below, §3).
  returned_at   timestamptz,
  code          text,
  comments      text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint shop_drawing_submissions_revision_unique unique (item_id, revision),
  constraint shop_drawing_submissions_revision_check check (revision >= 0),
  constraint shop_drawing_submissions_reviewer_party_check
    check (reviewer_party in ('client', 'consultant', 'main_contractor', 'other')),
  constraint shop_drawing_submissions_code_check
    check (code is null or code in ('A', 'B', 'C')),
  -- "Open" (no returned_at) means no code either, and vice versa — the
  -- pair is filled in together, exactly once, by the same action.
  constraint shop_drawing_submissions_return_shape_check
    check ((returned_at is null and code is null) or (returned_at is not null and code is not null)),
  constraint shop_drawing_submissions_checked_before_submitted_check
    check (checked_at <= submitted_at),
  constraint shop_drawing_submissions_returned_after_submitted_check
    check (returned_at is null or returned_at >= submitted_at)
);

comment on table workflow.shop_drawing_submissions is
  'Migration 027 / Brief 083, design question (b). One row per submission
   (per item, per revision) — NEVER overwritten after its two write
   points (created once when sent, completed once when returned; see the
   immutability trigger below). Design question (c) — reviewer_party is a
   fixed vocabulary (client/consultant/main_contractor/other) so the app
   can say "with the consultant" generically; reviewer_org is free text
   for "which one," where known, matching this schema''s own existing
   precedent for free-text organisation names (e.g. workflow.projects has
   no client-org enum either — client identity already lives as free
   text/a linked row elsewhere in this schema, not a fixed list). A
   dedicated reviewers table was considered and rejected: this schema has
   no existing "external party" table to extend (workflow.client_owners,
   the nearest candidate, models ADTECH''S OWN sales ownership of a
   client relationship, not a third-party reviewing organisation — reusing
   it would conflate two different concepts), and a party type + free
   org name is enough to answer every display requirement §2 of the
   brief actually asks for, without inventing a directory of reviewer
   organisations nothing else in this schema needs yet.';

comment on column workflow.shop_drawing_submissions.revision is
  'Zero-based (Rev 0, Rev 1, ...), matching the brief''s own "Rev 0, Rev
   1" phrasing. NOT auto-incremented by a sequence — the caller supplies
   it (current highest revision for this item, from a SELECT, + 1),
   because the caller also needs to know that number to label the
   submission in the UI; a generated column would just be re-read
   immediately. Enforced unique per item (not globally) — see the
   constraint above.';

comment on column workflow.shop_drawing_submissions.reviewer_org is
  'Free text, nullable — "with the consultant" is a complete, useful
   answer on its own (reviewer_party); naming WHICH consultant is
   additional detail, not always known or necessary at submission time.';

alter table workflow.shop_drawing_submissions enable row level security;

-- READ: as broadly as the item's own project is readable today — same
-- is_member() + can_view_project() shape every other new project-child
-- table in this schema uses (migrations 021/025/026).
create policy shop_drawing_submissions_select on workflow.shop_drawing_submissions
  for select using (
    workflow.is_member()
    and exists (
      select 1
      from workflow.shop_drawing_items i
      join workflow.projects p on p.id = i.project_id
      where i.id = shop_drawing_submissions.item_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- WRITE — design question (f): team-gated to the Shop Drawing team
-- (workflow.teams.code = 'shop_drawing'), reusing workflow.current_team()
-- (migration 001) — the exact mechanism migration 022 already uses for
-- floor_sub_stages/project_handover_items/shop_drawing_boq_lines, not a
-- third definition. NO manager/superadmin bypass, matching migration
-- 022's own explicit precedent ("No manager bypass, matching every
-- team-keyed policy in this schema") — not extending superadmin's
-- migration-019 bypass to this brand-new table either, for the same
-- reason. FLAGGED, NOT DECIDED SILENTLY: migration 022's shop_drawing_boq
-- policies gate on current_team() IN ('shop_drawing', 'a_and_a') — two
-- teams, not one — because A&A co-owns that BOQ. This brief's own text
-- names only the Shop Drawing team for the approval lifecycle, so this
-- migration follows that literally ('shop_drawing' alone); if A&A should
-- also be able to record a submission/return, that is Seanghakk's own
-- call to make, same shape as §4d.
create policy shop_drawing_submissions_insert on workflow.shop_drawing_submissions
  for insert with check (
    workflow.current_team() = 'shop_drawing'
  );

create policy shop_drawing_submissions_update on workflow.shop_drawing_submissions
  for update using (
    workflow.current_team() = 'shop_drawing'
  ) with check (
    workflow.current_team() = 'shop_drawing'
  );

-- No DELETE policy — matches migrations 014/017/022's own precedent for
-- every team-keyed conversion in this schema ("No ... delete recreated").
-- Brief's own explicit instruction: "No deletes by clients."

-- -----------------------------------------------------------------------------
-- 3. Immutability + updated_at — ONE trigger, both jobs (design
--    questions b and g).
-- -----------------------------------------------------------------------------

create or replace function workflow.shop_drawing_submissions_before_update()
returns trigger
language plpgsql
as $$
begin
  -- Design question (g) — Brief 056 found this schema has NO generic
  -- updated_at trigger anywhere; not repeating that bug. Bumped
  -- unconditionally, same as workflow.project_milestone_before_write()
  -- (migration 026).
  new.updated_at := now();

  -- Design question (b) — "written once when sent, completed once when
  -- returned, never altered after." Enforced here, not just documented:
  -- everything except the return fields must stay byte-for-byte
  -- identical to what INSERT wrote.
  if new.item_id is distinct from old.item_id
    or new.revision is distinct from old.revision
    or new.checked_by is distinct from old.checked_by
    or new.checked_at is distinct from old.checked_at
    or new.submitted_at is distinct from old.submitted_at
    or new.submitted_by is distinct from old.submitted_by
    or new.reviewer_party is distinct from old.reviewer_party
    or new.reviewer_org is distinct from old.reviewer_org
  then
    raise exception 'Only returned_at, code and comments may be set on an existing shop drawing submission — every other field is fixed at submission time.';
  end if;

  -- Once returned, the row is closed: no further UPDATE of any kind,
  -- including a second "return" — a submission is completed exactly
  -- once. (A dispute or correction is a new revision, not a rewrite of
  -- a closed row — same "history is never overwritten" principle as
  -- migration 025''s progress history.)
  if old.returned_at is not null then
    raise exception 'This shop drawing submission has already been returned and is closed — record a new revision instead of changing it.';
  end if;

  return new;
end;
$$;

comment on function workflow.shop_drawing_submissions_before_update() is
  'Migration 027 / Brief 083, design questions (b) and (g). Enforces
   "written once when sent, completed once when returned, then closed"
   at the database level, not just by convention — and bumps updated_at
   on the one legitimate UPDATE (recording the return) every row ever
   gets.';

create trigger shop_drawing_submissions_before_update
  before update on workflow.shop_drawing_submissions
  for each row
  execute function workflow.shop_drawing_submissions_before_update();

-- -----------------------------------------------------------------------------
-- 4. Existing-data mapping (design question e) — ONE-TIME BACKFILL,
--    honest, not fabricated. Current rows are test data; there is no
--    existing submission history to reconstruct (this schema had no
--    reviewer concept before this migration), so this backfill touches
--    ONLY shop_drawing_items' two new columns above, inserts NOTHING
--    into shop_drawing_submissions.
-- -----------------------------------------------------------------------------

-- not_started -> pre_submission_stage stays NULL (nothing has happened
-- yet — the correct "not started" reading, no guess involved).

-- in_progress -> 'drafting'. FLAGGED AS A GUESS, not a certainty: this
-- migration cannot know whether a real in-progress item was actually
-- mid-internal-check rather than mid-drafting — 'drafting' is the more
-- conservative reading (a false "still drafting" undercounts progress;
-- a false "internal check" would overstate it) and matches this
-- migration's own header note that in_progress "is the likely reading."
update workflow.shop_drawing_items
set pre_submission_stage = 'drafting'
where status = 'in_progress';

-- done -> NO submission row fabricated (there is no real reviewer to
-- attribute an approval to), pre_submission_stage stays NULL (the item
-- is past the pre-submission phase entirely, so that column genuinely
-- does not apply), and legacy_done_no_lifecycle_history is set true so
-- a future UI can render this honestly ("done (pre-lifecycle, no
-- recorded approval)") instead of either inventing an approval or
-- silently treating it as identical to a real, reviewer-approved item.
update workflow.shop_drawing_items
set legacy_done_no_lifecycle_history = true
where status = 'done';

commit;
