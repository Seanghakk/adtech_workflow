-- =============================================================================
-- ADTECH Workflow Tracker — Migration 025: project progress history
-- Brief: ADTECH_WF_Brief_077_Revise_PR48_Progress_History_And_Start_Date
--
-- DRAFT ONLY. NOT APPLIED BY THIS BRIEF. Paste-ready for the Supabase SQL
-- editor once Seanghakk reviews it — see this brief's own Result doc for
-- the numbered apply procedure (rollback-test project first). Wrapped in
-- one transaction, matching every migration in this project.
--
-- URGENT AND STANDALONE, per Brief 077 §2: this migration does not depend
-- on anything in 026 (the target-date/milestones migration, itself
-- renumbered from Brief 075's own draft) and is meant to be reviewed and
-- applied on its own, without waiting on 026 — every day this is not
-- live is a day of progress history the future chart can never recover
-- (Seanghakk's own words, this brief's §1a).
--
-- WHY THIS EXISTS: Brief 075's own investigation found that NO time
-- series of ACTUAL progress exists for a floor-tracked project —
-- workflow.recalculate_project_rollup() (migration 008) overwrites
-- projects.percent_calculated / percent_complete IN PLACE on every
-- floor/shop-drawing-item status change, with no audit trail anywhere.
-- This migration is the audit trail.
--
-- =============================================================================
-- THE TRIGGER-ON-PROJECTS DECISION (brief §3's own explicit "if you find
-- a reason this is wrong, stop and flag it" instruction) — CHECKED, NOT
-- FOUND WRONG:
--
-- Queried live before designing this: workflow.projects carries ZERO
-- triggers of its own today (`select tgname from pg_trigger where
-- tgrelid = 'workflow.projects'::regclass and not tgisinternal` returns
-- no rows). Every existing percent-changing write path reaches
-- workflow.projects the SAME way — a SECURITY DEFINER function
-- (recalculate_project_rollup, called from triggers ON OTHER TABLES —
-- floor_sub_stages, shop_drawing_items; bump_last_meaningful_movement,
-- called from an AFTER INSERT trigger ON progress_updates) issuing a
-- single, plain UPDATE workflow.projects SET ... statement. Neither
-- function calls the other, neither fires more than once per logical
-- event, and nothing anywhere currently depends on workflow.projects
-- having no trigger of its own. Adding this migration's OWN AFTER UPDATE
-- trigger, scoped by a WHEN clause to fire only when percent_calculated
-- OR percent_complete actually changes value, therefore:
--   - catches BOTH existing percent-changing paths automatically, without
--     editing either of their function bodies (recalculate_project_
--     rollup and bump_last_meaningful_movement are BYTE-FOR-BYTE
--     UNCHANGED by this migration) — and catches any FUTURE path too,
--     per the brief's own reasoning for preferring this over editing
--     recalculate_project_rollup() alone (which would miss the override
--     path and anything added later).
--   - does NOT fire on migration 026's own set_project_dates() (renamed
--     from Brief 075's set_project_target_date()) — that function only
--     ever touches start_date/target_date/updated_at, never the two
--     percent columns this trigger's WHEN clause checks.
--   - cannot recurse: this trigger only INSERTs into a DIFFERENT table
--     (project_progress_history below), never UPDATEs workflow.projects
--     again.
-- No evidence of double-recording, broken existing writes, or any other
-- reason this approach is wrong was found. Built as recommended.
--
-- =============================================================================
-- source IS DERIVABLE WITHOUT GUESSING, from the two known write paths'
-- own real behaviour (read directly, migration 008): recalculate_
-- project_rollup() is the ONLY function that EVER writes
-- percent_calculated; bump_last_meaningful_movement() never touches it.
-- So: if percent_calculated changed in this UPDATE, the source was the
-- floor rollup; if it did not change (only percent_complete did), the
-- source was a manual entry/override. No inference beyond "which column
-- actually moved" — a hard fact available inside the trigger itself, not
-- a guess about which caller ran it.
--
-- changed_by IS RELIABLY AVAILABLE: auth.uid() reads the ORIGINAL
-- calling session's own JWT claim (a per-request GUC), not the identity
-- of whichever SECURITY DEFINER function is currently executing — so it
-- survives correctly through recalculate_project_rollup() and bump_
-- last_meaningful_movement()'s own SECURITY DEFINER calls back to the
-- real end user who triggered the whole chain (the PIC who submitted a
-- progress update, or the team member who marked a floor sub-stage
-- done). Nullable regardless: a maintenance script or a future
-- non-interactive write path could legitimately have no session: brief's
-- own instruction is to omit rather than guess, not to force a value.
--
-- =============================================================================
-- ADDITIVE ONLY. No existing column renamed, retyped, or dropped.
-- recalculate_project_rollup() and bump_last_meaningful_movement() are
-- NOT edited by this migration — confirmed nothing below touches either.
-- DOES NOT TOUCH FloorBreakdown.tsx or floor-actions.ts, and needs no
-- application code change at all (brief §3's own instruction) — this
-- migration is schema-only; the trigger does the work with zero changes
-- to any write path the app already calls.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.project_progress_history — the audit table.
-- -----------------------------------------------------------------------------

create table workflow.project_progress_history (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references workflow.projects (id) on delete restrict,
  percent_calculated integer,
  percent_complete   integer not null,
  recorded_at        timestamptz not null default now(),
  source             text not null,
  changed_by         uuid references public.user_profiles (id) on delete restrict,
  constraint project_progress_history_percent_calculated_check
    check (percent_calculated is null or percent_calculated between 0 and 100),
  constraint project_progress_history_percent_complete_check
    check (percent_complete between 0 and 100),
  constraint project_progress_history_source_check
    check (source in ('floor_rollup', 'manual', 'backfill_current', 'backfill_progress_update'))
);

comment on table workflow.project_progress_history is
  'Migration 025 / Brief 077 §1a/§3. One row per REAL change to a
   project''s percent_calculated or percent_complete, written exclusively
   by the project_progress_history AFTER UPDATE trigger below — an audit
   record, never edited or deleted by any client (see the RLS section
   below: no client role has an INSERT/UPDATE/DELETE policy on this
   table at all). percent_calculated/percent_complete are the values
   AFTER the change, matching workflow.projects'' own columns of the same
   name at the moment this row was written. History only exists from the
   day this migration is applied forward, plus the backfill rows below —
   every day of delay before applying is data this table can never
   recover (Seanghakk''s own words, this brief''s §1a).';

comment on column workflow.project_progress_history.percent_calculated is
  'Nullable, matching workflow.projects.percent_calculated''s own
   nullability (null for a project with no floor rows — the rollup does
   not apply to it, migration 008).';

comment on column workflow.project_progress_history.source is
  'floor_rollup: this row was produced by workflow.recalculate_project_
   rollup() (percent_calculated changed). manual: produced by workflow.
   bump_last_meaningful_movement() (percent_calculated did NOT change;
   only percent_complete did — a 6a self-reported entry or override).
   backfill_current / backfill_progress_update: this migration''s own
   one-time backfill inserts (see below) — never produced by the live
   trigger, kept distinguishable from real post-migration rows on
   purpose, not merged into ''manual''.';

comment on column workflow.project_progress_history.changed_by is
  'The session that caused this change, via auth.uid() — reliably
   available through both existing write paths (see this file''s own
   header for why SECURITY DEFINER does not hide it). Nullable: a future
   non-interactive write path, or a backfilled row (see source), may
   legitimately have none — omitted rather than guessed, per brief §3''s
   own instruction.';

-- "One project's history, in date order" (brief §3's own phrasing) — the
-- query shape every future chart read will use.
create index project_progress_history_project_recorded_idx
  on workflow.project_progress_history (project_id, recorded_at);

comment on index workflow.project_progress_history_project_recorded_idx is
  'Brief 077 §3 — supports "this project''s history, in date order," the
   only access pattern this table exists to serve.';

alter table workflow.project_progress_history enable row level security;

-- READ: as broadly as the project itself is readable today, same
-- is_member() + can_view_project() shape as project_towers_select
-- (migration 021) and Brief 075''s own project_milestones_select draft.
create policy project_progress_history_select on workflow.project_progress_history
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = project_progress_history.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- NO INSERT/UPDATE/DELETE POLICY FOR ANY CLIENT ROLE — brief §3's own
-- explicit requirement: "Clients must NOT be able to write history rows
-- directly... The trigger is the only writer. History is an audit
-- record; it is never edited." The trigger function below is SECURITY
-- DEFINER, so it writes regardless of RLS — no policy is needed for it,
-- and none is added for anyone else. (Migration 002's schema-wide
-- default privileges still GRANT insert/update to `authenticated` at
-- the SQL privilege level, same as every table in this schema — RLS,
-- not the grant, is what actually blocks a client write here, exactly
-- the same enforcement shape workflow.projects itself has relied on
-- since migration 003.)

-- -----------------------------------------------------------------------------
-- 2. The trigger — the only writer.
-- -----------------------------------------------------------------------------

create or replace function workflow.record_project_progress_history()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
declare
  v_source text;
begin
  if new.percent_calculated is distinct from old.percent_calculated then
    v_source := 'floor_rollup';
  else
    v_source := 'manual';
  end if;

  insert into workflow.project_progress_history
    (project_id, percent_calculated, percent_complete, recorded_at, source, changed_by)
  values
    (new.id, new.percent_calculated, new.percent_complete, now(), v_source, (select auth.uid()));

  return null; -- AFTER trigger; return value is ignored either way.
end;
$$;

comment on function workflow.record_project_progress_history() is
  'Migration 025 / Brief 077 §3. AFTER UPDATE on workflow.projects, gated
   by this trigger''s own WHEN clause (fires only when percent_calculated
   OR percent_complete actually changes — see the CREATE TRIGGER
   statement below). SECURITY DEFINER so it can write to project_
   progress_history despite that table having no client-writable policy
   at all. Distinguishes source from a hard fact (which column moved),
   not a guess — see this file''s own header.';

drop trigger if exists record_project_progress_history on workflow.projects;
create trigger record_project_progress_history
  after update on workflow.projects
  for each row
  when (
    old.percent_calculated is distinct from new.percent_calculated
    or old.percent_complete is distinct from new.percent_complete
  )
  execute function workflow.record_project_progress_history();

comment on trigger record_project_progress_history on workflow.projects is
  'Migration 025 / Brief 077 §3. The FIRST trigger ever placed directly
   on workflow.projects (checked live before adding it — see this file''s
   own header for the full "is a trigger here safe" reasoning). Catches
   every existing percent-changing write path (recalculate_project_
   rollup via floor_sub_stages/shop_drawing_items triggers;
   bump_last_meaningful_movement via progress_updates) and any future one,
   without editing either function''s own body.';

-- -----------------------------------------------------------------------------
-- 3. Backfill — two parts, per brief §3. Neither part touches
--    workflow.projects (both are plain INSERTs into project_progress_
--    history directly), so NEITHER can accidentally fire the trigger
--    above and double-record anything — the trigger only exists on
--    workflow.projects' own UPDATE, which this backfill never issues.
-- -----------------------------------------------------------------------------

-- 3a. One starting row per existing project, its CURRENT values, dated
-- "now" (the day this migration is applied) — brief §3 part 1, "so every
-- project has a first point the day history begins."
insert into workflow.project_progress_history
  (project_id, percent_calculated, percent_complete, recorded_at, source, changed_by)
select id, percent_calculated, percent_complete, now(), 'backfill_current', null
from workflow.projects;

-- 3b. Every existing manual-override point already on file, from
-- workflow.progress_updates — brief §3 part 2. Preserves each row's OWN
-- original recorded_at (a REAL past timestamp, always before "now",
-- since these already happened) — not backdated to "now" like 3a, and
-- not the same event as 3a: 3a is a snapshot of today's live values
-- marked as the history-begins-here anchor; 3b is each historical entry
-- exactly as it was recorded, preserved with its real timestamp. For a
-- project with NO floor rows, 3a's "current" value and 3b's MOST RECENT
-- row will show the same percent (percent_complete only ever changes via
-- progress_updates for such a project) — that is two genuinely distinct
-- points in time (different recorded_at), not a duplicate: one is "what
-- was submitted on that date," the other is "the value as of when this
-- migration ran." percent_calculated is NULL here — progress_updates
-- never carried it (Brief 075''s own finding) — not guessed.
insert into workflow.project_progress_history
  (project_id, percent_calculated, percent_complete, recorded_at, source, changed_by)
select subject_id, null, new_percent, recorded_at, 'backfill_progress_update', author_id
from workflow.progress_updates
where subject_type = 'project'
  and new_percent is not null;

commit;
