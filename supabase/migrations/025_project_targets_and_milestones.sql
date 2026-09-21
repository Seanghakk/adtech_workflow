-- =============================================================================
-- ADTECH Workflow Tracker — Migration 025: project target date and
-- milestones, for the Execution Overview's planned-progress line
-- Brief: ADTECH_WF_Brief_075_Project_Targets_For_Progress_Chart_Investigate_And_Draft
--
-- DRAFT ONLY. NOT APPLIED BY THIS BRIEF. Paste-ready for the Supabase SQL
-- editor once Seanghakk reviews it — same convention as every migration in
-- this project, but stated here with extra emphasis because this brief's
-- own §0 is explicit: investigate, draft, report; apply nothing. Applies
-- BY HAND, rollback-test database first, then production, then this PR
-- merges — the established order (see this brief's own Result doc).
--
-- WHY THIS EXISTS: v5 §9 open item 1 (the "target curve") blocks the
-- Execution Overview's line chart (build steps 6-7) — it needs a planned
-- line per project to compare against actual progress. Decisions already
-- made by Seanghakk (21 Sep 2026, this brief's own §1): a target DATE
-- (mostly) plus optional target PERCENTAGES (milestones); a default
-- S-curve between start and target when no milestones exist; milestones
-- override the default when they do; either the project's PIC or a
-- manager may set either.
--
-- =============================================================================
-- INVESTIGATION FINDINGS THIS DRAFT IS BUILT ON (full detail, live-data
-- counts, and everything NOT resolved here, in this brief's own Result
-- doc — summarized here only to the extent it explains a design choice
-- below):
--
-- (§2a/§2b) NO usable target/due/completion/kickoff DATE column exists
-- anywhere in the workflow schema today (confirmed: grepped every table's
-- columns) — so this migration adds one, per §3's own instruction ("ONLY
-- if one does not already exist in a usable form"). NO new start-date
-- column is added: workflow.projects.opened_at (not null, 100% populated,
-- and ALREADY the anchor date every staleness/age calculation in this app
-- reads when a project has never moved — src/app/(app)/page.tsx and
-- siblings) is a genuinely usable existing candidate, among others
-- (so_assigned_at, created_at, first progress_updates row) — see the
-- Result doc for the full population-count comparison. Per §3's own
-- instruction ("ONLY if §2(b) finds no usable candidate"), since usable
-- candidates DO exist, none is added here. WHICH candidate to actually
-- use for the S-curve's own start point remains Seanghakk's own decision
-- — this migration does not choose, and nothing below hardcodes one.
--
-- (§2c) — THE HEADLINE FINDING, repeated here because it changes what
-- "done" can mean for the eventual chart, not just this migration: a
-- genuine time series of ACTUAL progress does NOT exist for a
-- floor-tracked project (the majority mechanism — 1 of the 4 real live
-- projects checked this session tracks floors, and it has ZERO
-- progress_updates rows). workflow.recalculate_project_rollup()
-- (migration 008) overwrites projects.percent_calculated /
-- percent_complete IN PLACE on every floor/shop-drawing-item status
-- change, with no audit trail anywhere — there is no way to ask "what was
-- this project's calculated percent two weeks ago." A time series DOES
-- exist, but only for the manually-overridden percent path
-- (workflow.progress_updates.new_percent, timestamped by recorded_at,
-- written exclusively by 6a's own submitProgressUpdate — migration 003)
-- — and even there it is sparse/irregular (whenever a PIC happens to
-- submit an update, not a regular cadence). This migration does not
-- attempt to fix this — it is a second blocker for the chart, separate
-- from the target curve this migration addresses, and is surfaced in
-- full in this brief's own Result doc rather than discovered mid-build.
--
-- (§2d) PERMISSIONS, REUSED NOT REINVENTED: workflow.is_manager()
-- (migration 001) is this schema's own manager/admin check, used
-- unchanged below. "Project PIC" has NO named SQL helper anywhere in this
-- schema (checked directly) — every existing PIC-gated policy (migration
-- 009's project_floors/project_towers policies, migration 021's own
-- project_towers policies) does the same inline
-- `p.pic_id = (select auth.uid())` join instead of a function; this
-- migration follows that exact precedent rather than introducing a first
-- one.
--
-- =============================================================================
-- DESIGN CHOICE FLAGGED FOR SEANGHAKK'S OWN REVIEW — HOW target_date IS
-- WRITTEN, NOT A RAW RLS UPDATE POLICY ON workflow.projects:
--
-- Checked live before designing this: workflow.projects carries EXACTLY
-- ONE RLS policy today (projects_select) — confirmed by querying
-- pg_policies directly, not assumed from an old migration's comment.
-- Every prior migration that touches this table says the same thing in
-- its own words (migration 003: "that table has never had an UPDATE
-- policy"; migration 009's own assign_project_pic comment, quoted in
-- part: "a broad RLS UPDATE policy would let any manager rewrite ANY
-- column on ANY project, which is far more than [the narrow intent]").
-- This is deliberate, existing architecture — percent_complete's own
-- integrity depends on workflow.projects staying un-updatable by a raw
-- client UPDATE, full stop; every mutation goes through a narrow,
-- SECURITY DEFINER, internally-checked function instead (assign_project_pic
-- being the direct precedent for exactly this shape).
--
-- This migration follows that SAME established pattern, not a new one:
-- workflow.set_project_target_date(project_id, target_date) below is the
-- ONLY write path to the new column, mirroring assign_project_pic's own
-- shape line for line (SECURITY DEFINER, checks the caller itself, updates
-- exactly target_date + updated_at, nothing else reachable). NO new RLS
-- UPDATE policy is added to workflow.projects, and NO GRANT changes on
-- that table are needed (functions carry their own internal check; the
-- schema-wide default EXECUTE privilege on newly created functions is
-- unchanged, matching how assign_project_pic/list_unlinked_accounts are
-- already called from the app via supabase.rpc() with no explicit GRANT
-- EXECUTE anywhere in this repo).
--
-- THE ALTERNATIVE CONSIDERED AND REJECTED: a column-scoped GRANT
-- (revoke the schema-wide default UPDATE grant on workflow.projects,
-- then `grant update (target_date) on workflow.projects to authenticated`)
-- combined with a new RLS UPDATE policy, would ALSO correctly restrict
-- writes to just this one column — technically valid Postgres, but it
-- would be the first migration in this repo to lean on column-level
-- privileges at all (none exist anywhere today), a real complexity/
-- inconsistency cost for no benefit over the function-based approach this
-- schema already uses for the identical problem on this identical table.
-- Not built. Flagged here as the road not taken, in case Seanghakk
-- prefers it for a reason not visible from this session.
--
-- workflow.project_milestones (the new TABLE, below) is different: it is
-- a brand-new table with no other columns to accidentally expose, so a
-- normal RLS INSERT/UPDATE/DELETE policy (PIC or manager, per this
-- brief's own §3 instruction) is safe and appropriate there, matching
-- migration 021's own project_towers precedent for a new table exactly.
-- The "narrow function instead of a policy" concern is specific to
-- workflow.projects' own history, not a rule this migration applies
-- everywhere.
--
-- =============================================================================
-- VALIDATION THAT IS NOT A SIMPLE CONSTRAINT (brief §3's own 4th bullet):
--
-- Two rules cannot be expressed as a plain CHECK (which can only see the
-- row being written, never sibling rows or another table):
--   1. A project's milestones' target_percent must RISE as target_date
--      rises (no milestone may promise LESS progress at a LATER date
--      than an earlier milestone already promises, and vice versa).
--   2. A milestone's target_date must not fall AFTER the project's own
--      target_date (when the project has one set).
-- PROPOSED AS A TRIGGER, not app-layer-only validation — consistent with
-- this schema's own repeatedly-stated philosophy that the database is the
-- REAL enforcement and app-layer checks are belt-and-suspenders on top of
-- it (stated almost verbatim in migrations 006/009/021's own comments),
-- and consistent with migration 003's own precedent of using a trigger
-- for exactly this class of "the client cannot be trusted to compute
-- this / cannot be trusted to preserve this invariant" problem
-- (compute_progress_update_delta). The lighter alternative — app-layer
-- only — was considered and is NOT recommended: it would let a direct API
-- call, a future bulk-import script, or an admin SQL fix silently insert
-- a nonsensical milestone sequence, exactly the class of gap a trigger
-- closes and an app-layer check cannot.
--
-- A THIRD rule this trigger deliberately does NOT enforce, flagged rather
-- than silently added: "milestone dates should fall between start and
-- target" (brief §3's own suggested check) is only HALF built here — the
-- upper bound (<= project target_date) is enforced; the LOWER bound
-- (>= project start) is not, because §2(b) is explicit that Seanghakk has
-- not yet chosen what "start" means for this app. Hardcoding one of the
-- four candidates into a validation trigger would be this migration
-- quietly making that product decision instead of surfacing it. Once
-- Seanghakk picks a start-date field, this trigger needs a follow-up
-- migration to add that half of the check — noted here so it is not
-- forgotten.
--
-- =============================================================================
-- ADDITIVE ONLY. No existing column renamed, retyped, or dropped.
-- Wrapped in one transaction, matching every migration in this project.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.projects.target_date — the project's own target completion
--    date (brief §1a/§1b). Nullable: every existing project has none
--    today, and this migration must not fail or guess one.
-- -----------------------------------------------------------------------------

alter table workflow.projects
  add column target_date date;

comment on column workflow.projects.target_date is
  'Migration 025 / Brief 075. The date the S-curve (and any milestones)
   plans toward — v5 §9 open item 1''s "target curve." Nullable: most
   existing projects have none yet. The ONLY write path is
   workflow.set_project_target_date() below — this table has never had a
   general UPDATE policy (migration 003) and this migration does not add
   one; see this file''s own header for the full reasoning.';

-- -----------------------------------------------------------------------------
-- 2. workflow.set_project_target_date() — the sole write path, mirroring
--    workflow.assign_project_pic()'s own shape (migration 009) exactly.
--    PIC-of-the-project OR manager, per brief §1d/§3 (assign_project_pic
--    itself is manager-only — a DELIBERATE difference from that
--    precedent, not an inconsistency: this brief's own §1d explicitly
--    names PIC-or-manager for target dates and milestones, unlike PIC
--    assignment itself, which only a manager may do).
-- -----------------------------------------------------------------------------

create or replace function workflow.set_project_target_date(p_project_id uuid, p_target_date date)
returns void
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
declare
  v_pic_id uuid;
begin
  select pic_id into v_pic_id
  from workflow.projects
  where id = p_project_id;

  if not found then
    raise exception 'No such project.';
  end if;

  if not (workflow.is_manager() or v_pic_id = (select auth.uid())) then
    raise exception 'Only this project''s PIC or a manager/admin may set its target date.';
  end if;

  update workflow.projects
  set target_date = p_target_date,
      updated_at = now()
  where id = p_project_id;
end;
$$;

comment on function workflow.set_project_target_date(uuid, date) is
  'Migration 025 / Brief 075 §1d/§3. The ONLY write path to
   workflow.projects.target_date. SECURITY DEFINER, PIC-of-this-project OR
   manager/admin, checked internally — same narrow-function-instead-of-a-
   raw-RLS-policy shape as workflow.assign_project_pic() (migration 009),
   for the identical reason: this table has never had a general UPDATE
   policy, and a raw one would expose every other column, not just this
   one. Pass NULL to clear a previously-set target date.';

-- -----------------------------------------------------------------------------
-- 3. workflow.project_milestones — new table (brief §3's 3rd bullet).
--    A brand-new table with no other columns to accidentally expose, so
--    (unlike workflow.projects above) normal RLS write policies are safe
--    here — same reasoning migration 021 already applied to
--    project_towers.
-- -----------------------------------------------------------------------------

create table workflow.project_milestones (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references workflow.projects (id) on delete restrict,
  target_date    date not null,
  target_percent integer not null,
  created_by     uuid not null references public.user_profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint project_milestones_target_percent_check
    check (target_percent between 0 and 100),
  constraint project_milestones_project_date_unique
    unique (project_id, target_date)
);

comment on table workflow.project_milestones is
  'Migration 025 / Brief 075 §1a/§1c. Optional target percentages for a
   project''s planned-progress line — when present, they OVERRIDE the
   default S-curve between start and workflow.projects.target_date (the
   planned line passes through these points instead). A project with no
   rows here just gets the default S-curve. created_by/created_at answer
   brief §3''s own "who set it, when" — trusted from the caller''s own
   verified session, same level of trust this schema already places in
   progress_updates.author_id / variations.raised_by (no existing
   precedent anywhere in this schema forces an attribution column via a
   trigger either).';

comment on constraint project_milestones_target_percent_check on workflow.project_milestones is
  'Brief 075 §3 — a milestone promises a percentage, and percentage means
   0-100, full stop. Matches projects_percent_complete_check''s own bound
   (migration 001).';

comment on constraint project_milestones_project_date_unique on workflow.project_milestones is
  'Brief 075 §3''s own explicit requirement: one milestone per project per
   date. A project revising a milestone''s target percent for an existing
   date should UPDATE that row, not insert a second one for the same
   date.';

alter table workflow.project_milestones enable row level security;

-- READ: as broadly as the project itself is readable today (brief §3),
-- same is_member() + can_view_project() shape as project_towers_select
-- (migration 021) — see that policy's own comment for the full reasoning
-- this one inherits unchanged.
create policy project_milestones_select on workflow.project_milestones
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = project_milestones.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- WRITE: PIC-of-the-project OR manager/admin (brief §1d/§3) — reusing
-- workflow.is_manager() and the same inline pic_id join every other
-- PIC-gated policy in this schema already uses (no named PIC helper
-- exists to reuse instead — see this file's own header, §2d).
create policy project_milestones_insert on workflow.project_milestones
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_milestones.project_id
        and (p.pic_id = (select auth.uid()) or workflow.is_manager())
    )
  );

create policy project_milestones_update on workflow.project_milestones
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_milestones.project_id
        and (p.pic_id = (select auth.uid()) or workflow.is_manager())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_milestones.project_id
        and (p.pic_id = (select auth.uid()) or workflow.is_manager())
    )
  );

create policy project_milestones_delete on workflow.project_milestones
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_milestones.project_id
        and (p.pic_id = (select auth.uid()) or workflow.is_manager())
    )
  );

-- DELETE grant — migration 002's default privileges cover SELECT/INSERT/
-- UPDATE automatically for a table created after it; DELETE has never
-- been auto-granted anywhere in this schema (migration 009's own header),
-- explicit grant required, matching migrations 009/019/020/021's pattern.
grant delete on workflow.project_milestones to authenticated;

-- -----------------------------------------------------------------------------
-- 4. workflow.project_milestones' own BEFORE INSERT OR UPDATE trigger:
--    bumps updated_at (brief §3's own explicit "actually written on
--    change" requirement — Brief 056 found floor_sub_stages.updated_at
--    was NEVER written, because this schema has no generic trigger for
--    it; this migration does not repeat that for its own new table) AND
--    enforces the two cross-row/cross-table rules from this file's own
--    header that cannot be plain CHECK constraints.
-- -----------------------------------------------------------------------------

create or replace function workflow.project_milestone_before_write()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
declare
  v_project_target_date date;
  v_conflict_date date;
  v_conflict_percent integer;
begin
  new.updated_at := now();

  -- Rule 1 (this file's own header) — percent must rise as date rises,
  -- across every OTHER milestone this project already has.
  select target_date, target_percent
  into v_conflict_date, v_conflict_percent
  from workflow.project_milestones m
  where m.project_id = new.project_id
    and m.id <> new.id
    and (
      (m.target_date < new.target_date and m.target_percent > new.target_percent)
      or (m.target_date > new.target_date and m.target_percent < new.target_percent)
    )
  limit 1;

  if v_conflict_date is not null then
    raise exception
      'This milestone (% at % percent) conflicts with an existing milestone on % (% percent) — target percent must rise as target date rises.',
      new.target_date, new.target_percent, v_conflict_date, v_conflict_percent;
  end if;

  -- Rule 2 (this file's own header) — may not fall after the project's
  -- own target date, when one is set. Lower bound (>= start) deliberately
  -- NOT enforced here — see this file's own header for why.
  select target_date into v_project_target_date
  from workflow.projects
  where id = new.project_id;

  if v_project_target_date is not null and new.target_date > v_project_target_date then
    raise exception
      'This milestone''s date (%) falls after the project''s own target date (%).',
      new.target_date, v_project_target_date;
  end if;

  return new;
end;
$$;

comment on function workflow.project_milestone_before_write() is
  'Migration 025 / Brief 075 §3/§4. BEFORE INSERT OR UPDATE on
   workflow.project_milestones. Bumps updated_at unconditionally (this
   table''s own answer to Brief 056''s floor_sub_stages.updated_at gap).
   Enforces the two rules a plain CHECK constraint cannot reach: target
   percent must rise as target date rises across a project''s milestones,
   and a milestone may not fall after the project''s own target_date.
   Does NOT enforce a lower bound against a project "start" date — see
   this migration''s own file header for why that half is deliberately
   left for a follow-up once Seanghakk decides what "start" means here.';

drop trigger if exists project_milestone_before_write on workflow.project_milestones;
create trigger project_milestone_before_write
  before insert or update on workflow.project_milestones
  for each row
  execute function workflow.project_milestone_before_write();

commit;
