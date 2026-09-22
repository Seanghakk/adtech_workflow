-- =============================================================================
-- ADTECH Workflow Tracker — Migration 028: shop drawing shared control and
-- automatic status
-- Brief: ADTECH_WF_Brief_086_Shop_Drawing_Shared_Control_And_Auto_Status_Draft
--
-- DRAFT ONLY. NOT APPLIED BY THIS BRIEF, NOT EVEN TO THE ROLLBACK-TEST
-- PROJECT (a separate rollback-test brief follows, same pattern as
-- migrations 025/026/027). No UI reads or writes any of this yet — not
-- even the shared "which done-reading is this" display function (§4d
-- below only confirms the DATA supports deriving it; writing that
-- function is explicitly UI/application work for a later build brief).
--
-- WHY: migration 027 built the shop drawing approval lifecycle but left
-- two questions open (Brief 084's own §5 carried-forward list, items 1
-- and 2). Seanghakk has now decided both:
--   (a) SHARED CONTROL — both the project's PIC and the Shop Drawing/A&A
--       teams may move a drawing between drafting/internal_check, set
--       its status by hand, and record submissions/returns. The internal
--       CHECK itself stays Shop Drawing manager-only (record_shop_drawing_
--       check(), migration 027) — NOT widened here.
--   (b) APPROVAL AUTO-MARKS DONE — an A or B return sets status='done',
--       so the existing rollup/history chain (migrations 008/025) picks
--       it up automatically, same as a manual status change would.
--   (c) THE MANUAL DROPDOWN STAYS — not retired; anyone in (a) can still
--       set status by hand, in either direction.
--
-- ADDITION TO BRIEF 086 (same date, on this same branch/PR before it was
-- reviewed further): shop_drawing_items.drafting_started_at (timestamptz,
-- nullable) — set automatically the FIRST time a drawing leaves
-- not_started, BY ANY ROUTE, and never overwritten after. See §5 below
-- for why this needs no new trigger and no change to §3's own function
-- at all: every route already funnels through §2's single BEFORE UPDATE
-- trigger, which fires on EVERY update to this table regardless of who
-- or what issued it (no WHEN clause, no "OF column" restriction — see
-- that trigger's own CREATE TRIGGER statement).
--
-- =============================================================================
-- §4 INVESTIGATION FINDINGS (from the migration files directly, not
-- memory or a database read — production reads may be blocked per this
-- brief's own standing instruction, and were not needed: every question
-- below is answered by the files already in this repo):
--
-- 1. shop_drawing_items' LIVE update policy (migration 009 created it,
--    migration 019 replaced it with a superadmin bypass added — 019's
--    version is what is actually live today, quoted verbatim):
--      create policy shop_drawing_items_update on workflow.shop_drawing_items
--        for update using (
--          workflow.is_superadmin()
--          or exists (
--            select 1 from workflow.projects p
--            where p.id = shop_drawing_items.project_id
--              and p.pic_id = (select auth.uid())
--          )
--        ) with check ( <identical> );
--    This migration adds ONE more OR arm — current_team() IN
--    ('shop_drawing', 'a_and_a') — to both the USING and WITH CHECK
--    clauses. The superadmin and PIC arms are copied byte-for-byte
--    unchanged. Scope note: only the UPDATE policy is widened, per this
--    brief's own §4 instruction ("the exact current UPDATE policy...").
--    INSERT/DELETE on shop_drawing_items are untouched — items are
--    created only by workflow.seed_floor_children() (SECURITY DEFINER,
--    bypasses RLS) or a project-scope insert by a PIC/superadmin
--    (unchanged), never manually by a team member in the current or
--    planned flow, so widening INSERT was out of this brief's own scope.
--
-- 2. shop_drawing_submissions' LIVE insert/update policies (migration
--    027, revised by migration 027's own Brief-084 pass — quoted
--    verbatim, both identical in shape):
--      create policy shop_drawing_submissions_insert ... for insert
--        with check ( workflow.current_team() in ('shop_drawing','a_and_a') );
--      create policy shop_drawing_submissions_update ... for update
--        using (that same expression) with check (that same expression);
--    No PIC arm exists on either today. This migration ADDS one,
--    reached the same way the table's own SELECT policy already joins
--    item -> project (migration 027): a subquery from
--    shop_drawing_submissions.item_id -> shop_drawing_items.project_id
--    -> projects.pic_id = auth.uid(). The team-gated arm is preserved
--    unchanged; the PIC arm is additive via OR.
--
-- 3. workflow.shop_drawing_items.updated_at — checked directly (grepped
--    every migration for a trigger touching this table): NONE EXISTS.
--    migration 008 created ONLY workflow.shop_drawing_items_recalculate_
--    rollup (after insert or update of status — calls recalculate_
--    project_rollup(), which writes to workflow.projects only, never to
--    shop_drawing_items itself). No BEFORE UPDATE trigger of any kind
--    sits on this table before this migration. Brief 056's own finding
--    ("this schema has no generic updated_at trigger anywhere") is
--    confirmed still true for this specific table — updated_at has never
--    actually been bumped on a status or pre_submission_stage change,
--    which matters because the Shop Drawing cross-project list's age key
--    reads updated_at (Briefs 080/082). FIXED below (§2 of this
--    migration) — combined into the same new BEFORE UPDATE trigger this
--    migration needs anyway for the forward-only auto-status rule (same
--    "one trigger, more than one job" shape migration 026's
--    project_milestone_before_write and migration 027's shop_drawing_
--    submissions_before_update already use in this schema).
--
-- 4. THE ROLLUP/HISTORY CHAIN — read directly, not assumed:
--    workflow.recalculate_project_rollup(p_project_id) (migration 008,
--    quoted): its ONLY write is
--      update workflow.projects
--      set percent_calculated = v_pct, percent_complete = coalesce(v_pct, percent_complete),
--          percent_override_at = null, updated_at = now()
--      where id = p_project_id;
--    — ONE statement, ONE table (workflow.projects), nothing else.
--    workflow.shop_drawing_items_recalculate_rollup (migration 008) is
--    `after insert or update of status on workflow.shop_drawing_items`
--    — UNCONDITIONAL on the new value, fires on ANY status write.
--    workflow.record_project_progress_history's own trigger (migration
--    025) is gated by `when (old.percent_calculated is distinct from
--    new.percent_calculated or old.percent_complete is distinct from
--    new.percent_complete)` — genuinely conditional on the VALUE
--    actually changing, not just the statement running.
--    CONCLUSION: this migration's own new triggers only ever need to
--    perform a plain `update workflow.shop_drawing_items set status = ...`
--    — the existing rollup-recalc trigger on that table already picks it
--    up automatically and pushes it through to workflow.projects, whose
--    own existing history trigger then only fires (and only produces ONE
--    row) if the recomputed percentage genuinely differs from before.
--    Nothing in this migration touches workflow.projects or workflow.
--    project_progress_history directly.
--
-- =============================================================================
-- §b — THE FORWARD-ONLY AUTO-STATUS TRIGGERS: WHY THEY CANNOT LOOP OR
-- DOUBLE-COUNT (traced, not asserted):
--
-- Two new triggers, each guarded so it only ever fires the ONE plain
-- UPDATE it exists to make, and each UPDATE itself carries a WHERE guard
-- so it becomes a genuine no-op (zero rows matched) once the target
-- state is already reached:
--
--   A. shop_drawing_items_before_update (BEFORE UPDATE on shop_drawing_
--      items itself) — modifies NEW.status INLINE, within the SAME
--      statement/row that is already being written. This issues NO
--      second UPDATE at all for the "entering the lifecycle" case — it
--      cannot recurse because there is no second statement to recurse
--      through. Condition: pre_submission_stage is actually changing,
--      landing on 'drafting' or 'internal_check', AND old.status =
--      new.status = 'not_started' (the "new.status" half of this
--      condition means: only auto-advance when the CALLER did not
--      themselves set a different status in this same statement — a
--      manual choice made in the same write always wins, per rule 2).
--
--   B. shop_drawing_submissions_auto_status (AFTER INSERT OR UPDATE on
--      shop_drawing_submissions) — issues exactly ONE conditional UPDATE
--      on shop_drawing_items per firing:
--        INSERT: `update ... set status='in_progress' where id=new.item_id
--          and status='not_started'` — matches 0 or 1 rows; 0 once the
--          item is no longer not_started, so a second submission (after
--          a C return, say) does nothing here.
--        UPDATE (a return just recorded, code in ('A','B')): `update ...
--          set status='done' where id=new.item_id and status<>'done'` —
--          same shape, becomes a no-op once already done.
--
-- TRACE OF THE FULL CHAIN, to show it terminates and cannot loop:
--   trigger A or B issues -> ONE UPDATE on workflow.shop_drawing_items
--     -> fires the EXISTING shop_drawing_items_recalculate_rollup trigger
--        (unconditional on status changing, migration 008)
--     -> calls recalculate_project_rollup(), whose ONLY write is
--     -> ONE UPDATE on workflow.projects
--        -> fires the EXISTING record_project_progress_history trigger
--           (migration 025), gated on the PERCENTAGE actually differing
--     -> ONE INSERT into workflow.project_progress_history, IF AND ONLY
--        IF the percentage genuinely changed — a table with NO trigger
--        of its own, so the chain ends here. Nothing anywhere in this
--        chain writes back to shop_drawing_items or shop_drawing_
--        submissions, so it cannot loop by construction, not merely by
--        the WHERE guards above (the guards prevent a REDUNDANT run of
--        the chain; the ABSENCE of any write-back is what prevents an
--        actual cycle).
-- DOUBLE-COUNTING: two independent layers. (1) Each new trigger's own
-- WHERE guard means a redundant automatic UPDATE matches zero rows and
-- so never even reaches the rollup-recalc trigger a second time for the
-- same transition. (2) Even in a scenario where recalculate_project_
-- rollup() DOES run again (e.g. because something else, unrelated,
-- changed a floor's status in the same transaction) and computes the
-- exact SAME percentage as before, migration 025's own `is distinct
-- from` WHEN clause means no second history row is ever inserted for an
-- unchanged value — this protection was already there, built for the
-- floor/QC paths, and this migration relies on it rather than
-- duplicating it.
--
-- =============================================================================
-- §4d — RULE 3's THREE "DONE" READINGS, CONFIRMED DERIVABLE FROM THE
-- DATA AS IT WILL EXIST AFTER THIS MIGRATION (no schema addition
-- needed; the actual derivation function is explicitly NOT written
-- here — UI/application work for a later brief):
--
--   LEGACY DONE, PRE-LIFECYCLE:
--     status = 'done' AND legacy_done_no_lifecycle_history = true
--     (migration 027's own backfill flag — untouched by this migration).
--
--   APPROVED (A or B):
--     status = 'done' AND EXISTS a shop_drawing_submissions row for this
--     item_id with code IN ('A','B') — in practice the item's own
--     highest-revision row, since a C return keeps the lifecycle open
--     for a next revision and an A/B return is terminal (no further
--     submission is expected after an approval); a caller can find it
--     with a plain `order by revision desc limit 1` or an EXISTS check
--     against code, either is sufficient to answer the yes/no question
--     this rule asks for.
--
--   MARKED MANUALLY, NO RECORDED APPROVAL:
--     status = 'done' AND legacy_done_no_lifecycle_history = false AND
--     NO shop_drawing_submissions row for this item_id has code IN
--     ('A','B') — i.e. everything that is neither of the two cases
--     above. This is exactly rule 3's own "done, but nothing on record
--     explains why" case, and it is the logical complement of the other
--     two given status='done' — no new column or flag is needed; the
--     THREE readings partition every possible 'done' row completely
--     using only columns/tables that already exist as of migration 027.
--
-- =============================================================================
-- CONFIRMATION — EVERY EXISTING READER/WRITER OF shop_drawing_items AND
-- shop_drawing_submissions KEEPS WORKING (walked through individually,
-- same reader/writer list Brief 083 §3b already established):
--
--   - update/page.tsx's shop_drawing_items query (id, floor_id, scope,
--     drawing_type, status) — reads only unchanged columns, unaffected.
--   - FloorBreakdown.tsx / floor-actions.ts's updateShopDrawingStatus —
--     still a plain UPDATE ... SET status = ... through the SAME table;
--     the PIC path this already relied on is byte-for-byte unchanged
--     (copied verbatim into the new policy, see §4 finding 1 above); it
--     simply now ALSO works for Shop Drawing/A&A members, which is the
--     point of this migration, not a regression.
--   - floors/actions.ts's isPristine check — reads status only,
--     unaffected; the floor-deletion ON DELETE RESTRICT interaction
--     (already flagged, Brief 084 §5 item 3) is UNCHANGED by this
--     migration and remains carried forward, not solved here.
--   - shop-drawing/page.tsx (Briefs 080/082) — reads status only via
--     computeShopDrawingCounts(); this migration adds no new required
--     column and does not touch that file. Its "interim, no lifecycle
--     awareness" framing (Brief 082's own header) is now slightly MORE
--     accurate automatically, since status can move on its own — still
--     out of scope to update the list's own copy/labels here.
--   - compute_project_rollup_percent() — reads status only, exactly the
--     same read it already performed before this migration; this
--     migration changes WHEN status changes and WHO can change it, never
--     what the rollup function itself does with that value.
--   - workflow.seed_floor_children() — writes the original columns only
--     (unchanged); this migration's two new triggers fire on UPDATE (the
--     items-side one) or on shop_drawing_submissions (unrelated table),
--     never on the seed trigger's own INSERT into shop_drawing_items, so
--     a freshly seeded row is unaffected at creation time.
--   - migration 027's own record_shop_drawing_check() and shop_drawing_
--     submissions_before_insert/_before_update — none of their own logic
--     is touched; the manager-only internal-check gate is explicitly
--     NOT widened (decision a's own "do not widen it").
--
-- Wrapped in one transaction, matching every migration in this project.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. shop_drawing_items.drafting_started_at — ADDITIVE column, nullable,
--    no default, so every EXISTING row stays NULL (per the addition's own
--    explicit "leave it NULL for existing rows" instruction — no backfill
--    attempted, since there is no real "when did drafting start" fact to
--    recover for a pre-migration row, the same reasoning migration 027
--    already applied to legacy_done_no_lifecycle_history rather than
--    guessing a timestamp). Set exactly once, going forward, by §2 below.
-- -----------------------------------------------------------------------------

alter table workflow.shop_drawing_items
  add column drafting_started_at timestamptz;

comment on column workflow.shop_drawing_items.drafting_started_at is
  'Set automatically the FIRST time this drawing leaves not_started, by
   ANY route — pre_submission_stage set to drafting/internal_check, a
   submission created, or a manual status change — never overwritten
   once set (see workflow.shop_drawing_items_before_update()''s own
   comment for the single unified condition that catches all three
   routes). NULL means either the drawing is still not_started, or it
   left not_started before this migration existed (no backfill — see
   this file''s own header). Never written anywhere except that one
   trigger function.';

-- -----------------------------------------------------------------------------
-- 1. Policy widenings (§4 findings 1 and 2 above).
-- -----------------------------------------------------------------------------

drop policy if exists shop_drawing_items_update on workflow.shop_drawing_items;
create policy shop_drawing_items_update on workflow.shop_drawing_items
  for update using (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('shop_drawing', 'a_and_a')
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

comment on policy shop_drawing_items_update on workflow.shop_drawing_items is
  'Migration 028 / Brief 086 §2a. Superadmin and PIC arms copied
   byte-for-byte from migration 019''s own policy — see this file''s own
   header §4 finding 1. Adds current_team() IN (''shop_drawing'',''a_and_a'')
   as a third OR arm: both teams now also control the manual status
   dropdown and pre_submission_stage, alongside the project''s PIC.';

drop policy if exists shop_drawing_submissions_insert on workflow.shop_drawing_submissions;
create policy shop_drawing_submissions_insert on workflow.shop_drawing_submissions
  for insert with check (
    workflow.current_team() in ('shop_drawing', 'a_and_a')
    or exists (
      select 1
      from workflow.shop_drawing_items i
      join workflow.projects p on p.id = i.project_id
      where i.id = shop_drawing_submissions.item_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_submissions_update on workflow.shop_drawing_submissions;
create policy shop_drawing_submissions_update on workflow.shop_drawing_submissions
  for update using (
    workflow.current_team() in ('shop_drawing', 'a_and_a')
    or exists (
      select 1
      from workflow.shop_drawing_items i
      join workflow.projects p on p.id = i.project_id
      where i.id = shop_drawing_submissions.item_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.current_team() in ('shop_drawing', 'a_and_a')
    or exists (
      select 1
      from workflow.shop_drawing_items i
      join workflow.projects p on p.id = i.project_id
      where i.id = shop_drawing_submissions.item_id
        and p.pic_id = (select auth.uid())
    )
  );

comment on policy shop_drawing_submissions_insert on workflow.shop_drawing_submissions is
  'Migration 028 / Brief 086 §2a. Team-gated arm (migration 027)
   preserved unchanged; adds an OR arm for the project''s PIC, reached
   item_id -> shop_drawing_items.project_id -> projects.pic_id, the same
   join shape this table''s own SELECT policy already uses (migration
   027). Governs submitting and recording a return ONLY — the internal
   CHECK itself (record_shop_drawing_check()) is untouched and stays
   Shop Drawing manager-only, per decision (a)''s own explicit "do not
   widen it".';

-- -----------------------------------------------------------------------------
-- 2. shop_drawing_items — ONE new BEFORE UPDATE trigger, two jobs
--    (§4 finding 3 — updated_at was never bumped on this table at all;
--    and rule 1's "entering the lifecycle" case). See this file's own
--    header §b for the full loop/double-count proof.
-- -----------------------------------------------------------------------------

create or replace function workflow.shop_drawing_items_before_update()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  -- §4 finding 3 — this table has NEVER had a generic updated_at
  -- trigger (Brief 056's own finding, reconfirmed here); bumped
  -- unconditionally on every UPDATE, same shape as workflow.
  -- project_milestone_before_write (migration 026) and workflow.
  -- shop_drawing_submissions_before_update (migration 027).
  new.updated_at := now();

  -- Rule 1, "entering the lifecycle" case — modifies NEW.status INLINE,
  -- within this same row/statement, so this branch issues NO second
  -- UPDATE and cannot recurse (see this file's own header §b). The
  -- `new.status = 'not_started'` half of this condition means a manual
  -- status change made in the SAME statement always wins over this
  -- automatic one (rule 2) — this only auto-advances when the caller
  -- did not themselves set a different status here.
  if new.pre_submission_stage is distinct from old.pre_submission_stage
    and new.pre_submission_stage in ('drafting', 'internal_check')
    and old.status = 'not_started'
    and new.status = 'not_started'
  then
    new.status := 'in_progress';
  end if;

  -- ADDITION TO BRIEF 086 — drafting_started_at. Checked AFTER the
  -- block above so it sees this statement's FINAL new.status (the
  -- pre_submission_stage-triggered auto-advance may have just set it).
  -- ONE condition catches ALL THREE routes named by the addition,
  -- because every one of them arrives here as an ordinary UPDATE on
  -- THIS table, and this trigger has no WHEN clause / "OF column"
  -- restriction (see its own CREATE TRIGGER statement) — it fires on
  -- every UPDATE regardless of who or what issued it:
  --   1. pre_submission_stage set to drafting/internal_check: caught by
  --      the block above already changing new.status in this same call.
  --   2. a submission is created: workflow.shop_drawing_submissions_
  --      auto_status()'s own INSERT branch issues `update
  --      shop_drawing_items set status='in_progress' where
  --      status='not_started'` — that UPDATE is itself a normal write
  --      to this table, so it fires THIS trigger too, arriving here with
  --      old.status='not_started' and new.status='in_progress' as
  --      supplied by that UPDATE statement. No separate logic needed in
  --      that other function at all.
  --   3. a manual status change away from not_started (by anyone in
  --      §2a, per rule 2) — an ordinary UPDATE ... SET status = ...,
  --      caught the same way.
  -- "Never overwrite it once set": guarded twice over — old.status must
  -- still read 'not_started' (permanently false forever after the first
  -- real departure) AND old.drafting_started_at must still be null
  -- (false forever after the first time this branch runs) — either
  -- guard alone would already be sufficient.
  if old.status = 'not_started'
    and new.status is distinct from 'not_started'
    and old.drafting_started_at is null
  then
    new.drafting_started_at := now();
  end if;

  return new;
end;
$$;

comment on function workflow.shop_drawing_items_before_update() is
  'Migration 028 / Brief 086 §3/§4, extended by this brief''s own
   drafting_started_at addition. BEFORE UPDATE on workflow.
   shop_drawing_items. Bumps updated_at unconditionally (§4 finding 3 —
   this table never had this before). Enforces rule 1''s "entering the
   lifecycle while not_started" forward-only auto-status case inline, on
   the same row being written — no second statement, so this branch
   cannot recurse by construction. Also sets drafting_started_at, once,
   the first time status actually leaves not_started by ANY route — see
   the inline comment above that block for why this single, unconditional
   trigger is the one place that can observe every route without any
   change to workflow.shop_drawing_submissions_auto_status().';

drop trigger if exists shop_drawing_items_before_update on workflow.shop_drawing_items;
create trigger shop_drawing_items_before_update
  before update on workflow.shop_drawing_items
  for each row
  execute function workflow.shop_drawing_items_before_update();

-- -----------------------------------------------------------------------------
-- 3. shop_drawing_submissions — ONE new AFTER trigger, rule 1's other
--    two cases: a submission being created, and a return with code A/B
--    being recorded. Each branch issues exactly one guarded UPDATE on
--    shop_drawing_items — see this file's own header §b for the full
--    trace showing this cannot loop or double-count.
--
--    Deliberately UNCHANGED by this brief's own drafting_started_at
--    addition: this function's UPDATE on shop_drawing_items (below)
--    already flows through §2's own BEFORE UPDATE trigger on that
--    table, which is where drafting_started_at is actually set — see
--    that trigger's own comment for why no logic needs to be duplicated
--    here.
-- -----------------------------------------------------------------------------

create or replace function workflow.shop_drawing_submissions_auto_status()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Rule 1, "a submission is created" case. No-op (0 rows matched)
    -- once the item is no longer not_started — e.g. a second submission
    -- after a C return does nothing here, which is correct: the item is
    -- already in_progress and rule 1 only ever moves status forward.
    update workflow.shop_drawing_items
    set status = 'in_progress'
    where id = new.item_id and status = 'not_started';
  elsif tg_op = 'UPDATE' then
    -- Rule 1, "a return with code A or B is recorded" case. Fires only
    -- on the transition into "just returned" (old.returned_at null,
    -- new.returned_at set) — migration 027's own immutability trigger
    -- already guarantees a submission can be returned exactly once, so
    -- this branch can itself only ever run once per submission row. A C
    -- return does not match `new.code in ('A','B')`, so status is left
    -- exactly as it was, per rule 1's own explicit "a C return does NOT
    -- change status" instruction.
    if old.returned_at is null and new.returned_at is not null and new.code in ('A', 'B') then
      update workflow.shop_drawing_items
      set status = 'done'
      where id = new.item_id and status <> 'done';
    end if;
  end if;

  return null; -- AFTER trigger; return value ignored either way.
end;
$$;

comment on function workflow.shop_drawing_submissions_auto_status() is
  'Migration 028 / Brief 086 §3/§4. AFTER INSERT OR UPDATE on workflow.
   shop_drawing_submissions. Issues at most ONE guarded UPDATE on
   shop_drawing_items per firing — see this file''s own header §b for
   the full chain trace proving this cannot loop (nothing downstream
   ever writes back to shop_drawing_items or shop_drawing_submissions)
   or double-count (each UPDATE''s own WHERE guard, plus migration 025''s
   independent is-distinct-from guard on the history trigger it
   eventually reaches).';

drop trigger if exists shop_drawing_submissions_auto_status on workflow.shop_drawing_submissions;
create trigger shop_drawing_submissions_auto_status
  after insert or update on workflow.shop_drawing_submissions
  for each row
  execute function workflow.shop_drawing_submissions_auto_status();

commit;
