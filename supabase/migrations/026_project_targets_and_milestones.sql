-- =============================================================================
-- ADTECH Workflow Tracker — Migration 026: project start/target dates and
-- milestones, for the Execution Overview's planned-progress line
-- Brief: ADTECH_WF_Brief_077_Revise_PR48_Progress_History_And_Start_Date
--        (revises Brief 075's own draft, previously numbered 025)
--
-- DRAFT ONLY. NOT APPLIED BY THIS BRIEF. Paste-ready for the Supabase SQL
-- editor once Seanghakk reviews it. NOT URGENT — migration 025 (progress
-- history) is the one that needs applying first and on its own; this one
-- can follow later (Brief 077 §5's own instruction). Wrapped in one
-- transaction, matching every migration in this project.
--
-- RENUMBERED FROM 025 TO 026, FREELY — nothing from Brief 075's own draft
-- was ever applied to any database (confirmed live before starting this
-- revision: no target_date column, no project_milestones table, no
-- set_project_target_date function exist anywhere), so renumbering has
-- no cost. Migration 025 is now the new, separate progress-history
-- migration (Brief 077 §3) — see that file for why it had to be split
-- out and applied first.
--
-- WHAT CHANGED FROM BRIEF 075's OWN DRAFT, per Seanghakk's decisions
-- (21 Sep 2026, this brief's own §1):
--   a. A REAL start_date column is added (§2b's "no usable candidate" gap
--      is now resolved by a product decision, not by picking among the
--      existing imperfect candidates) — see §4 below.
--   b. workflow.set_project_target_date() is REPLACED (not kept
--      alongside) by workflow.set_project_dates(), setting start_date and
--      target_date TOGETHER through one function — never applied before,
--      so no old name needs to survive for compatibility.
--   c. The milestone trigger's lower-bound check, which Brief 075
--      deliberately left out because "start" was undecided, is now
--      enforced — see the EFFECTIVE START section below.
--   d. is_superadmin() stays OUT of every policy here, per Brief 077 §4e's
--      own explicit instruction not to extend a "temporary testing aid"
--      to new work — unchanged from Brief 075's own original position.
-- Everything else (the milestones table shape, its RLS shape, why a
-- trigger and not app-layer-only for validation, why workflow.projects
-- gets a narrow function instead of a raw UPDATE policy) is UNCHANGED
-- from Brief 075's own reasoning, restated below only where the change
-- above touches it.
--
-- =============================================================================
-- (Brief 075 §2a/§2c/§2d FINDINGS, CARRIED FORWARD UNCHANGED — full
-- detail in Brief 075's own Result doc, repeated here only as needed):
--
-- No usable target/due/completion/kickoff DATE column existed anywhere
-- before this migration. The headline finding that actual-progress
-- HISTORY does not exist for a floor-tracked project is what migration
-- 025 (separate, urgent) now answers — not this migration. workflow.
-- is_manager() is reused unchanged; no named "is PIC" SQL helper exists
-- anywhere in this schema, so every policy below uses the same inline
-- `pic_id = (select auth.uid())` join every other PIC-gated policy in
-- this schema already uses.
--
-- =============================================================================
-- START DATE — Seanghakk's decision (Brief 077 §1b), resolving Brief
-- 075's own §2b open question: add a REAL start_date column, set
-- TOGETHER with target_date through the same function. When left blank,
-- the EFFECTIVE start falls back to workflow.projects.opened_at (the
-- most-populated, already-load-bearing candidate Brief 075's own §2b
-- reported, now the officially chosen fallback rather than one option
-- among several).
--
-- THE FALLBACK IS A RULE, DEFINED EXACTLY ONCE (Brief 077 §4c's own
-- explicit instruction — "do not scatter this rule"):
--
--   workflow.project_effective_start_date(project_id) returns
--   coalesce(start_date, opened_at::date)
--
-- A single SQL function, STABLE, SECURITY DEFINER (consistent with this
-- migration's other functions — no meaningful risk in a read-only date
-- derivation, and it avoids any RLS-visibility edge case when called
-- from inside the milestone trigger below). Two things are meant to call
-- this SAME function rather than re-deriving the rule independently:
--   1. workflow.project_milestone_before_write() below, for its own
--      lower-bound check (§2's old deferred rule, now enforced).
--   2. THE FUTURE src/lib/reporting/planned-progress.ts (Brief 075 §4,
--      proposed, not written by either brief) — recommended to call this
--      SAME function via a Supabase RPC (supabase.rpc
--      ('project_effective_start_date', { project_id })) rather than
--      re-implementing `start_date ?? openedAt` in TypeScript, so the
--      chart and this migration's own trigger can never quietly
--      disagree about what "start" means for a given project — the
--      same no-drift principle Brief 067 applied to the delays badge
--      count, and Brief 075 §4 itself asked this migration to satisfy.
--      NOT called from anywhere in the app yet — this migration only
--      defines it; wiring a future chart to call it is that future
--      brief's own work, not built here.
--
-- =============================================================================
-- DESIGN CHOICE CARRIED FORWARD FROM BRIEF 075, EXTENDED TO COVER
-- start_date TOO — HOW THE DATES ARE WRITTEN, NOT A RAW RLS UPDATE
-- POLICY ON workflow.projects:
--
-- workflow.projects carries EXACTLY ONE RLS policy (projects_select) —
-- reconfirmed live again for this revision, not assumed from Brief 075's
-- own prior check. Still no general UPDATE policy, still deliberate
-- (percent_complete's own integrity depends on it — see migration 025's
-- own header for the fullest version of this reasoning, since that
-- migration's trigger depends on the SAME fact).
--
-- workflow.set_project_dates(project_id, start_date, target_date) is now
-- the ONE function covering both columns (Brief 077 §4b's own explicit
-- instruction: "ONE WRITE FUNCTION FOR BOTH... set together"), still
-- mirroring workflow.assign_project_pic()'s own shape (SECURITY DEFINER,
-- checks the caller itself, touches only start_date/target_date/
-- updated_at, nothing else reachable). Validates start_date < target_date
-- INSIDE the function, when both are provided — the one new rule Brief
-- 077 §4b itself asks for.
--
-- =============================================================================
-- VALIDATION THAT IS NOT A SIMPLE CONSTRAINT — THREE RULES NOW, not two:
--
-- Rules 1 and 2 (percent must rise as date rises across a project's own
-- milestones; a milestone may not fall after the project's own
-- target_date) are UNCHANGED from Brief 075's own draft — see that
-- brief's Result doc for the full trigger-vs-app-layer reasoning, which
-- applies identically here.
--
-- RULE 3, NEWLY ENABLED (Brief 077 §4d): a milestone's target_date must
-- not fall BEFORE the project's own EFFECTIVE start (workflow.
-- project_effective_start_date() above). Brief 075 correctly refused to
-- build this because "start" was undecided; it is decided now, so this
-- migration adds it rather than leaving a known, no-longer-blocked gap
-- in place.
--
-- =============================================================================
-- ADDITIVE ONLY. No existing column renamed, retyped, or dropped.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.projects.start_date, workflow.projects.target_date — the
--    project's own planned-progress window (brief §1b/§4a). Both
--    nullable: every existing project has neither today, and this
--    migration must not fail or guess either.
-- -----------------------------------------------------------------------------

alter table workflow.projects
  add column start_date date,
  add column target_date date;

comment on column workflow.projects.start_date is
  'Migration 026 / Brief 077 §1b/§4a. The date the S-curve plans FROM.
   Nullable — when not set, workflow.project_effective_start_date()
   below falls back to opened_at''s own date (Seanghakk''s own decision,
   resolving Brief 075''s own §2b open question). The ONLY write path is
   workflow.set_project_dates() below; see this file''s own header for
   why this table gets a narrow function rather than a raw UPDATE
   policy.';

comment on column workflow.projects.target_date is
  'Migration 026 / Brief 075/077. The date the S-curve (and any
   milestones) plans TOWARD — v5 §9 open item 1''s "target curve."
   Nullable: most existing projects have none yet. Same write path and
   reasoning as start_date above — set together, through the same
   function.';

-- -----------------------------------------------------------------------------
-- 2. workflow.project_effective_start_date() — the effective-start rule,
--    defined exactly once (brief §4c). See this file's own header for
--    the full reasoning and the future chart-side caller this is built
--    for.
-- -----------------------------------------------------------------------------

create or replace function workflow.project_effective_start_date(p_project_id uuid)
returns date
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select coalesce(p.start_date, p.opened_at::date)
  from workflow.projects p
  where p.id = p_project_id;
$$;

comment on function workflow.project_effective_start_date(uuid) is
  'Migration 026 / Brief 077 §4c. THE single definition of "effective
   start" for a project''s planned-progress line: start_date when set,
   else opened_at''s own date. Called from workflow.
   project_milestone_before_write() below for its own lower-bound check;
   the future Execution Overview chart (src/lib/reporting/planned-
   progress.ts, proposed by Brief 075 §4, not written by either brief)
   is recommended to call this SAME function via supabase.rpc() rather
   than re-deriving the rule in TypeScript, so the chart and this
   migration''s own trigger can never disagree about what "start" means
   for a given project. Returns null only if p_project_id does not
   exist (opened_at itself is NOT NULL on every real row, so a real
   project always yields a real date).';

-- -----------------------------------------------------------------------------
-- 3. workflow.set_project_dates() — the sole write path for BOTH
--    columns together (brief §4b), replacing Brief 075's own single-
--    column set_project_target_date() (never applied anywhere — no
--    compatibility name needs to survive). Mirrors workflow.
--    assign_project_pic()'s own shape (migration 009): SECURITY
--    DEFINER, checks the caller itself, touches only start_date/
--    target_date/updated_at. PIC-of-the-project OR manager (brief
--    §1d — assign_project_pic itself is manager-only, a DELIBERATE
--    difference from that precedent per that brief's own §1d, not an
--    inconsistency).
-- -----------------------------------------------------------------------------

create or replace function workflow.set_project_dates(p_project_id uuid, p_start_date date, p_target_date date)
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
    raise exception 'Only this project''s PIC or a manager/admin may set its start/target dates.';
  end if;

  if p_start_date is not null and p_target_date is not null and p_start_date >= p_target_date then
    raise exception 'The start date (%) must be before the target date (%).', p_start_date, p_target_date;
  end if;

  update workflow.projects
  set start_date = p_start_date,
      target_date = p_target_date,
      updated_at = now()
  where id = p_project_id;
end;
$$;

comment on function workflow.set_project_dates(uuid, date, date) is
  'Migration 026 / Brief 077 §4b. The ONLY write path to
   workflow.projects.start_date and .target_date — set together, per
   brief §1b''s own instruction, not two separate functions. SECURITY
   DEFINER, PIC-of-this-project OR manager/admin, checked internally —
   same narrow-function-instead-of-a-raw-RLS-policy shape as workflow.
   assign_project_pic() (migration 009). Validates start_date < target_
   date when both are provided; either may be passed NULL (including to
   clear a previously-set value) independently of the other.';

-- -----------------------------------------------------------------------------
-- 4. workflow.project_milestones — new table (brief §3's 3rd bullet,
--    UNCHANGED from Brief 075's own draft). A brand-new table with no
--    other columns to accidentally expose, so (unlike workflow.projects
--    above) normal RLS write policies are safe here — same reasoning
--    migration 021 already applied to project_towers.
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
  'Migration 026 / Brief 075 §1a/§1c. Optional target percentages for a
   project''s planned-progress line — when present, they OVERRIDE the
   default S-curve between the project''s effective start (workflow.
   project_effective_start_date()) and workflow.projects.target_date
   (the planned line passes through these points instead). A project
   with no rows here just gets the default S-curve. created_by/
   created_at answer brief §3''s own "who set it, when" — trusted from
   the caller''s own verified session, same level of trust this schema
   already places in progress_updates.author_id / variations.raised_by
   (no existing precedent anywhere in this schema forces an attribution
   column via a trigger either).';

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
-- exists to reuse instead).
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

-- NO is_superadmin() BYPASS — brief §4e's own explicit instruction: it
-- is a temporary testing aid (migration 019's own words), not extended
-- to new tables here.

-- -----------------------------------------------------------------------------
-- 5. workflow.project_milestones' own BEFORE INSERT OR UPDATE trigger:
--    bumps updated_at (Brief 056's floor_sub_stages.updated_at gap, not
--    repeated here) AND enforces THREE cross-row/cross-table rules that
--    cannot be plain CHECK constraints — the third one newly enabled by
--    this revision (brief §4d).
-- -----------------------------------------------------------------------------

create or replace function workflow.project_milestone_before_write()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
declare
  v_project_target_date date;
  v_effective_start date;
  v_conflict_date date;
  v_conflict_percent integer;
begin
  new.updated_at := now();

  -- Rule 1 — percent must rise as date rises, across every OTHER
  -- milestone this project already has.
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

  -- Rule 2 — may not fall after the project's own target date, when one
  -- is set.
  select target_date into v_project_target_date
  from workflow.projects
  where id = new.project_id;

  if v_project_target_date is not null and new.target_date > v_project_target_date then
    raise exception
      'This milestone''s date (%) falls after the project''s own target date (%).',
      new.target_date, v_project_target_date;
  end if;

  -- Rule 3 (Brief 077 §4d — NEWLY ENABLED; Brief 075 deliberately left
  -- this out because "start" was undecided) — may not fall before the
  -- project's own EFFECTIVE start (workflow.project_effective_start_date()
  -- above — start_date if set, else opened_at's own date).
  v_effective_start := workflow.project_effective_start_date(new.project_id);

  if v_effective_start is not null and new.target_date < v_effective_start then
    raise exception
      'This milestone''s date (%) falls before the project''s own effective start date (%).',
      new.target_date, v_effective_start;
  end if;

  return new;
end;
$$;

comment on function workflow.project_milestone_before_write() is
  'Migration 026 / Brief 075 §3/§4, Brief 077 §4d. BEFORE INSERT OR
   UPDATE on workflow.project_milestones. Bumps updated_at
   unconditionally. Enforces three rules a plain CHECK constraint cannot
   reach: target percent must rise as target date rises across a
   project''s milestones; a milestone may not fall after the project''s
   own target_date; and (newly enabled by Brief 077, once "start" was
   decided) a milestone may not fall before the project''s own effective
   start date.';

drop trigger if exists project_milestone_before_write on workflow.project_milestones;
create trigger project_milestone_before_write
  before insert or update on workflow.project_milestones
  for each row
  execute function workflow.project_milestone_before_write();

commit;
