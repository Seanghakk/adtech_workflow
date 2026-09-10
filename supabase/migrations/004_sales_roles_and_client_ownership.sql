-- =============================================================================
-- ADTECH Workflow Tracker — Migration 004: Sales Engineer/Supervisor +
-- client ownership + maintenance-scoped read restriction
-- Brief: ADTECH_WF_Brief_003_Sales_Roles (Part B of ADTECH CMMS Brief 092)
--
-- CONFIRMED AGAINST THE REAL SCHEMA FIRST, PER THE BRIEF'S OWN INSTRUCTION
-- (not the CMMS session's unverified guesses in Result 092):
--
-- 1. There is no `contracts` table anywhere in this schema — a tracker
--    project and an SO are the same row (workflow.projects, migration 001's
--    own comment). The SO number's letter suffix ('S' = Service) is the
--    closest existing proxy for "maintenance," but is NOT a reliable one —
--    confirmed with him directly: Service can also cover one-off/ad hoc
--    jobs that are not recurring maintenance. So this migration adds an
--    EXPLICIT boolean rather than inferring maintenance status from the SO
--    suffix or scope_type.
--
-- 2. workflow.members.role carries a REAL database CHECK constraint
--    ('member', 'manager', 'admin' only) — unlike the CMMS's unconstrained
--    text column, extending it here is a genuinely more invasive move, not
--    a schema-cheap one. Confirmed with him: do NOT touch this constraint.
--    Sales Engineer / Sales Supervisor are NOT new role values. They are
--    the EXISTING role vocabulary, read together with team membership:
--      - Sales Engineer  = an active member with team_id = the 'sales'
--        team and role = 'member'.
--      - Sales Supervisor = an active member with team_id = the 'sales'
--        team and role = 'manager'.
--    No new column, no new CHECK, workflow.is_manager()'s existing GLOBAL
--    semantics are untouched (a manager of any other team is completely
--    unaffected by this migration).
--
-- 3. No client-ownership concept exists anywhere in this schema (checked
--    every table) — workflow.client_owners below is genuinely new, not a
--    formalisation of something already half-built.
--
-- 4. Headcount confirmed small (one supervisor, a few engineers) — so this
--    deliberately does NOT add a manager_id/reports_to self-reference for
--    a multi-level hierarchy. "Sales Supervisor sees the whole team" is
--    implemented as "any active manager-role member of the sales team
--    sees every client any sales-team engineer owns" — a flat rule, exactly
--    matching what workflow.members' existing (team_id, role) shape
--    already expresses, not a new structure to maintain. Revisit only if
--    the team ever grows past one flat layer.
--
-- 5. THE BIGGEST NEW THING HERE, confirmed with him directly: every table
--    in this schema up to this point uses exactly ONE read policy —
--    "any active member sees everything" (workflow.is_member()). There is
--    NO existing precedent for one team seeing less than another. This
--    migration introduces the FIRST such restriction: a Sales Engineer or
--    Sales Supervisor (team_id = sales, role in ('member','manager') — NOT
--    'admin', which stays unrestricted like every other admin) sees ONLY
--    maintenance-flagged projects under a client they (or their team) own.
--    Every other role, on every other team, keeps EXACTLY the access it
--    has today — the existing is_member()-only branch is preserved
--    unchanged inside workflow.can_view_project() below, not replaced.
--
-- WHAT THIS MIGRATION DOES:
--
-- A. workflow.projects gains is_maintenance_contract (plain boolean,
--    NOT NULL DEFAULT false — same additive-column shape as every other
--    column added after the fact in this schema so far).
--
-- B. workflow.client_owners: NEW table. One row per client (UNIQUE on
--    client_id — a client has exactly one current owner; reassignment is
--    an UPDATE, not a new historical row, matching "ownership mapping,
--    kept separate from any registration-authorship fact" from Brief 092's
--    own framing). RLS: read is_member() (low-sensitivity — "who owns this
--    client" is metadata, not maintenance progress data, and every other
--    lookup/mapping table in this schema — teams, stages, approval_steps —
--    already reads this way); write (insert/update) is_manager() — an
--    admin/supervisor action, per the brief's own "presumably an admin/
--    supervisor action, confirm this assumption" instruction. No DELETE
--    policy — retire an assignment via UPDATE to a new owner, same
--    deactivate-don't-delete spirit as teams.is_active elsewhere in this
--    schema, without needing a matching is_active column here (a client
--    without a workflow.client_owners row simply has no current owner).
--
-- C. workflow.can_view_project(client_id, is_maintenance): NEW SECURITY
--    DEFINER function, the one new predicate every affected policy below
--    calls. Unrestricted (true) for anyone who is NOT a sales-team member/
--    manager — this is the branch that keeps every existing role's access
--    completely unchanged. Restricted to maintenance-flagged projects
--    under an owned client for sales-team member/manager viewers.
--
-- D. Six existing SELECT policies replaced (DROP + CREATE, same policy
--    names, so nothing downstream needs to know a rename happened):
--    projects_select, variations_select, project_items_select,
--    progress_updates_select, procurement_lines_select,
--    dependency_links_select. Each now ANDs workflow.can_view_project(...)
--    onto the existing workflow.is_member() gate, joining through
--    project_id (or, for progress_updates' polymorphic subject_id,
--    through project_items for subject_type = 'item') to reach the
--    project's client_id and is_maintenance_contract.
--
--    Deliberately OUT OF SCOPE, per the brief's own boundary: requests,
--    request_handoffs, catalogue_items, catalogue_events — a different
--    theme (the daily ticket/routing loop), not maintenance progress
--    monitoring. Their existing is_member()-only policies are untouched.
--
-- E. A REAL GAP FOUND WHILE VERIFYING THE "READ-ONLY" GUARANTEE, not
--    something this migration set out to touch: workflow.progress_updates'
--    existing INSERT policy (migration 001) has an unconditional
--    workflow.is_manager() override branch — ANY manager/admin, of ANY
--    team, can log a progress update for ANY project, regardless of
--    ownership. That was harmless before this migration, when "manager"
--    meant "a manager of finance/tender/PM/etc." Now that Sales
--    Supervisor is a real, actively-used role = 'manager' on the sales
--    team, that same override would let a Sales Supervisor write progress
--    updates on maintenance projects — directly contradicting the
--    brief's own explicit requirement ("Sales does NOT manage ongoing
--    maintenance work... no create/act capability... any write action").
--    Fixed here by excluding sales-team member/manager viewers from that
--    override branch specifically — every OTHER team's managers keep
--    their existing override, completely unchanged.
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor, same as every
-- migration in this project — see supabase/verification/
-- 004_sales_roles_and_client_ownership_verify.sql for the checks to run
-- after applying. This environment has no psql/DATABASE_URL — every claim
-- above is a static reading of migrations 001-003 plus his own direct
-- confirmation on the three genuinely undecidable questions (maintenance
-- filter, role modelling, read-scope enforcement), not a live query.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- A. Explicit maintenance flag on projects.
-- -----------------------------------------------------------------------------
alter table workflow.projects
  add column if not exists is_maintenance_contract boolean not null default false;

comment on column workflow.projects.is_maintenance_contract is
  'Explicit, not inferred from so_number''s letter suffix or scope_type —'
  ' confirmed directly (Brief 092/ADTECH_WF_Brief_003) that a Service (S)'
  ' SO can also be a one-off/ad hoc job, not necessarily recurring'
  ' maintenance. Drives Sales Engineer/Supervisor visibility scope, see'
  ' workflow.can_view_project() below.';

-- -----------------------------------------------------------------------------
-- B. Client ownership.
-- -----------------------------------------------------------------------------
create table if not exists workflow.client_owners (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null default '00000000-0000-0000-0000-000000000001'
                    references workflow.orgs (id),
  client_id         uuid not null references workflow.clients (id) on delete restrict,
  sales_engineer_id uuid not null references public.user_profiles (id) on delete restrict,
  assigned_at       timestamptz not null default now(),
  assigned_by       uuid references public.user_profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (org_id, client_id)
);

comment on table workflow.client_owners is
  'Current owning Sales Engineer per client — a client-ACCOUNT concept,'
  ' deliberately separate from any per-contract registration-authorship'
  ' fact (Brief 092''s own framing). Reassignment is an UPDATE to a new'
  ' sales_engineer_id, not a new row — this table holds current state,'
  ' not a history log. A client with no row here simply has no current'
  ' owner. No is_active column: retiring an assignment means UPDATE-ing'
  ' it to whoever owns the relationship now, not deactivating a row.';

comment on column workflow.client_owners.sales_engineer_id is
  'The individual member who owns this client relationship. Their'
  ' Sales Supervisor (any active manager-role member of the sales team,'
  ' workflow.can_view_project() below) automatically sees this client'
  ' too — no separate supervisor column needed at current team size'
  ' (confirmed small: one supervisor, a few engineers).';

comment on column workflow.client_owners.assigned_by is
  'Nullable — attribution, not operational history (same category'
  ' distinction Brief 092''s CMMS-side audit already drew). ON DELETE'
  ' RESTRICT matches this schema''s own stated blanket rule (migration'
  ' 001 header): never silently lose who did what.';

-- No automatic updated_at trigger — checked first: no such generic helper
-- exists anywhere in this schema (migrations 001-003). Every existing
-- table sets updated_at explicitly wherever a row is updated (e.g.
-- workflow.bump_last_meaningful_movement()'s own `updated_at = now()`).
-- The reassignment write path (app code, not this migration) does the
-- same for client_owners.

alter table workflow.client_owners enable row level security;

create policy client_owners_select on workflow.client_owners
  for select using (workflow.is_member());

create policy client_owners_insert on workflow.client_owners
  for insert with check (workflow.is_manager());

create policy client_owners_update on workflow.client_owners
  for update using (workflow.is_manager()) with check (workflow.is_manager());

-- No DELETE policy — reassign via UPDATE instead, same reasoning as the
-- table comment above.

-- -----------------------------------------------------------------------------
-- C. The one new predicate every restricted policy below calls. Defined
--    AFTER workflow.is_sales_only_member() (§E) so it can call that
--    helper directly instead of duplicating the same EXISTS inline —
--    reordered from the DROP/CREATE sequence below purely so this file
--    reads top-to-bottom without a forward reference; Postgres itself
--    doesn't care about definition order within one transaction.
-- -----------------------------------------------------------------------------
create or replace function workflow.is_sales_only_member()
returns boolean
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select exists (
    select 1
    from workflow.members m
    join workflow.teams t on t.id = m.team_id
    where m.user_id = (select auth.uid())
      and m.is_active
      and t.code = 'sales'
      and m.role in ('member', 'manager')
  );
$$;

comment on function workflow.is_sales_only_member() is
  'True for an active member/manager (not admin) of the sales team —'
  ' the exact cohort workflow.can_view_project() restricts on read'
  ' (below) AND the cohort excluded from progress_updates_insert''s'
  ' manager-override (§E) — factored out to one place so read and write'
  ' restriction can never quietly drift apart from each other.';

create or replace function workflow.can_view_project(p_client_id uuid, p_is_maintenance boolean)
returns boolean
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select
    -- Branch 1, unchanged for everyone this migration does not touch:
    -- NOT a sales-team member/manager => exactly today's access (true).
    -- 'admin' role is deliberately excluded from this restricted set —
    -- an app-wide admin who happens to be tagged team_id = sales stays
    -- unrestricted, same as every other admin in this schema.
    not workflow.is_sales_only_member()
    or (
      -- Branch 2: a sales-team member/manager sees ONLY maintenance-
      -- flagged projects under a client they (engineer) or their team
      -- (manager) own.
      p_is_maintenance
      and exists (
        select 1
        from workflow.client_owners co
        where co.client_id = p_client_id
          and (
            co.sales_engineer_id = (select auth.uid())
            or exists (
              select 1
              from workflow.members m2
              join workflow.teams t2 on t2.id = m2.team_id
              where m2.user_id = (select auth.uid())
                and m2.is_active
                and t2.code = 'sales'
                and m2.role = 'manager'
            )
          )
      )
    );
$$;

comment on function workflow.can_view_project(uuid, boolean) is
  'The first restricted-read predicate in this schema — every other'
  ' table''s SELECT policy is a bare workflow.is_member() with no'
  ' narrower scoping. Confirmed directly (ADTECH_WF_Brief_003) that Sales'
  ' Engineer/Supervisor genuinely need RLS-enforced scoping, not an'
  ' app-layer-only restriction, matching this project''s own stated'
  ' principle that a read-only guarantee belongs at the RLS/API layer.'
  ' auth.uid() wrapped as (select auth.uid()) throughout, per this'
  ' schema''s own Brief 001D fix for the same planner-hoisting reason.';

-- -----------------------------------------------------------------------------
-- D. Apply the predicate to the six affected tables. Same policy NAMES as
--    before (DROP + CREATE), so nothing downstream needs to know anything
--    was renamed — only the USING clause changes, from a bare is_member()
--    to is_member() AND can_view_project(...).
-- -----------------------------------------------------------------------------

drop policy if exists projects_select on workflow.projects;
create policy projects_select on workflow.projects
  for select using (
    workflow.is_member()
    and workflow.can_view_project(client_id, is_maintenance_contract)
  );

drop policy if exists variations_select on workflow.variations;
create policy variations_select on workflow.variations
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = variations.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

drop policy if exists project_items_select on workflow.project_items;
create policy project_items_select on workflow.project_items
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = project_items.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

drop policy if exists procurement_lines_select on workflow.procurement_lines;
create policy procurement_lines_select on workflow.procurement_lines
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = procurement_lines.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

drop policy if exists dependency_links_select on workflow.dependency_links;
create policy dependency_links_select on workflow.dependency_links
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
      where p.id = dependency_links.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- progress_updates: subject_id is polymorphic (Brief 001 §"subject_id is
-- polymorphic... carries no FK") — two join paths, one per subject_type.
drop policy if exists progress_updates_select on workflow.progress_updates;
create policy progress_updates_select on workflow.progress_updates
  for select using (
    workflow.is_member()
    and (
      (
        subject_type = 'project'
        and exists (
          select 1 from workflow.projects p
          where p.id = progress_updates.subject_id
            and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
        )
      )
      or (
        subject_type = 'item'
        and exists (
          select 1 from workflow.project_items i
          join workflow.projects p on p.id = i.project_id
          where i.id = progress_updates.subject_id
            and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
        )
      )
    )
  );

-- -----------------------------------------------------------------------------
-- E. Close the manager-override write gap found above. Reuses
--    workflow.is_sales_only_member(), defined up in §C.
-- -----------------------------------------------------------------------------
drop policy if exists progress_updates_insert on workflow.progress_updates;
create policy progress_updates_insert on workflow.progress_updates
  for insert with check (
    author_id = (select auth.uid())
    and (
      (workflow.is_manager() and not workflow.is_sales_only_member())
      or (
        subject_type = 'project'
        and exists (
          select 1 from workflow.projects p
          where p.id = subject_id and p.owner_id = (select auth.uid())
        )
      )
      or (
        subject_type = 'item'
        and exists (
          select 1 from workflow.project_items i
          where i.id = subject_id and i.pic_id = (select auth.uid())
        )
      )
    )
  );

commit;
