-- =============================================================================
-- ADTECH Workflow Tracker — Migration 019: superadmin bypass
-- Brief: ADTECH_WF_Brief_040_Superadmin_Implementation
-- Investigation: ADTECH_WF_Result_038_Superadmin_Investigate_And_Propose
--
-- TEMPORARY TESTING AID, NOT A PERMANENT ROLE — per Brief 040's decision 3.
-- Everything this migration adds (the is_superadmin column, the
-- is_superadmin() function, every edited policy's added OR clause, and
-- every new BOQ write policy) is built for clean removal: each touched
-- policy's PRE-superadmin text is quoted verbatim in this header so the
-- paired rollback file can restore it exactly, not approximately. Nothing
-- here should still exist once superadmin testing is done.
--
-- SCOPE, per Seanghakk's answers to Result 038's three open questions:
--   1. EVERY writable field gets the bypass, not just status fields.
--   2. BOQ tables get superadmin write access too (first write path onto
--      any BOQ table, for anyone — migration 018 shipped all seven BOQ
--      tables SELECT-only).
--   3. Temporary testing aid — must be trivially and completely removable.
--
-- NO ONE IS FLAGGED is_superadmin = true BY THIS MIGRATION. That is a
-- per-person, hand-run UPDATE Seanghakk runs himself after applying (same
-- pattern as the original first-member bootstrap) — not baked into a
-- migration file. Everyone stays non-superadmin, and the app's existing
-- access rules are completely unchanged, until that manual UPDATE runs.
--
-- FRESH RE-DERIVATION, NOT REUSE: every policy text quoted below was
-- re-extracted directly from the current migration files for this brief,
-- not copied from Result 038's own survey uncritically. Confirmed no
-- schema drift since Result 038 beyond migration 018 landing (the only
-- known change, per `git log` against origin/main). One correction to
-- Result 038's own prose along the way: qc_inspections_insert/update and
-- qc_inspection_floors_insert/update are TEAM-keyed
-- (workflow.current_team() = 'qc'), not PIC-keyed — Result 038's table
-- correctly listed them as team-keyed already; only a first-pass
-- extraction script in this round briefly mismatched them against a
-- commented-out design block earlier in migration 017's own file before
-- the real DROP/CREATE further down was located and used.
--
-- APPLY-TIME CORRECTNESS DOES NOT DEPEND ON THESE QUOTES BEING EXACT.
-- Every DROP POLICY below uses IF EXISTS and every CREATE POLICY defines
-- its full new text explicitly, so this migration applies correctly even
-- if a quoted "original text" comment has some drift from history. Only
-- the ROLLBACK file's fidelity depends on these quotes being exact restores.
--
-- READS: folded into workflow.can_view_project() itself (per Result 038's
-- own recommendation) rather than duplicated per-policy — this one edit
-- covers roughly 20 tables' SELECT policies since they already all route
-- through it, directly or via an exists-join to another RLS'd table.
--
-- Current full body of workflow.can_view_project(uuid, boolean), quoted
-- verbatim from migration 004 before this migration's edit:
--
--   create or replace function workflow.can_view_project(p_client_id uuid, p_is_maintenance boolean)
--   returns boolean
--   language sql
--   stable
--   security definer
--   set search_path = workflow, pg_temp
--   as $$
--     select
--       not workflow.is_sales_only_member()
--       or (
--         p_is_maintenance
--         and exists (
--           select 1
--           from workflow.client_owners co
--           where co.client_id = p_client_id
--             and (
--               co.sales_engineer_id = (select auth.uid())
--               or exists (
--                 select 1
--                 from workflow.members m2
--                 join workflow.teams t2 on t2.id = m2.team_id
--                 where m2.user_id = (select auth.uid())
--                   and m2.is_active
--                   and t2.code = 'sales'
--                   and m2.role = 'manager'
--               )
--             )
--         )
--       );
--   $$;
--
-- is_manager()-GATED TABLES: edited INDIVIDUALLY, per policy, rather than
-- folding the bypass into is_manager() itself. is_manager() may be read
-- elsewhere in the app for non-RLS purposes (e.g. a "Manager" badge in the
-- UI) and quietly redefining what it means schema-wide is a bigger change
-- than this brief asked for. The 13 policies below are gated by
-- is_manager() directly, not through can_view_project(): members_insert,
-- members_update, members_delete, stages_insert, stages_update,
-- scope_types_insert, scope_types_update, reason_codes_insert,
-- reason_codes_update, reporting_periods_insert, reporting_periods_update,
-- client_owners_insert, client_owners_update. Confirmed via fresh
-- extraction: all 13 match Result 038's own catalogue exactly, no drift.
--
-- PIC-KEYED / TEAM-KEYED WRITE POLICIES: 21 policies across 9 tables,
-- each gets `workflow.is_superadmin() OR (...)` added to its existing
-- USING/WITH CHECK clause, original clause otherwise unchanged.
--
-- SPECIAL CASE — progress_updates_insert: migration 006 deliberately
-- REMOVED a manager bypass here once (Result 038's own finding). Adding a
-- superadmin bypass now reverses that specific prior decision. This is
-- deliberate and reasoned, not an accidental regression of migration
-- 006's own fix — superadmin is a categorically different, temporary,
-- fully-removable testing mechanism, not a permanent re-grant of manager
-- override power over progress updates.
--
-- OUT OF SCOPE, NOTED BUT NOT FIXED HERE: Result 038 found
-- qc_inspections/qc_inspection_floors carrying a dead DELETE grant from
-- migration 009 that migration 017 never recreated a policy for. Real,
-- separate gap — left alone this round; bundling an unrelated fix into a
-- security-sensitive migration makes the diff harder to reason about and
-- harder to cleanly roll back.
--
-- BOQ TABLES: GRANT CHECK — migration 002's `alter default privileges in
-- schema workflow grant insert, update on tables to authenticated` already
-- covers INSERT/UPDATE for all seven BOQ tables (they postdate that
-- default-privilege rule and inherited it automatically). DELETE is NEVER
-- auto-granted in this schema (migration 002's own header says so
-- explicitly) and migration 018 added no DELETE grant for any BOQ table —
-- confirmed by direct inspection, not assumed. This migration adds the
-- missing explicit `grant delete`, matching the established pattern from
-- migrations 009/010/015 ("policies filter a grant, they do not create
-- one").
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. INFRASTRUCTURE
-- -----------------------------------------------------------------------------

alter table workflow.members
  add column is_superadmin boolean not null default false;

comment on column workflow.members.is_superadmin is
  'TEMPORARY testing aid — Brief 040. Not set true for anyone by this '
  'migration; Seanghakk hand-runs a per-person UPDATE after applying, '
  'same pattern as the original first-member bootstrap. Fully removed, '
  'along with every policy edit this migration made, when this '
  'migration''s rollback runs.';

create function workflow.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select exists (
    select 1 from workflow.members m
    where m.user_id = auth.uid() and m.is_active and m.is_superadmin
  );
$$;

comment on function workflow.is_superadmin() is
  'TEMPORARY testing aid — Brief 040, mirrors workflow.current_team()''s '
  'own pattern (reads the caller''s own active members row via '
  'auth.uid()). Bypasses read and write restrictions schema-wide while '
  'this migration is applied. Dropped by this migration''s rollback.';

-- -----------------------------------------------------------------------------
-- 2. READS — folded into workflow.can_view_project()
-- Original body quoted verbatim in this migration's own header above.
-- -----------------------------------------------------------------------------

create or replace function workflow.can_view_project(p_client_id uuid, p_is_maintenance boolean)
returns boolean
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select
    workflow.is_superadmin()
    or not workflow.is_sales_only_member()
    or (
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
  ' schema''s own Brief 001D fix for the same planner-hoisting reason.'
  ' TEMPORARY superadmin bypass added on top — Brief 040 —'
  ' workflow.is_superadmin() short-circuits both branches below;'
  ' removed by this migration''s own rollback.';

-- -----------------------------------------------------------------------------
-- 3. is_manager()-GATED WRITE POLICIES — edited individually, 13 policies.
-- Each policy's PRE-superadmin text is quoted immediately above its
-- replacement, extracted fresh from its current source migration.
-- -----------------------------------------------------------------------------

-- workflow.members (migration 001, 010)
--   members_insert:
--     for insert with check (workflow.is_manager());
--   members_update:
--     for update using (workflow.is_manager()) with check (workflow.is_manager());
--   members_delete (migration 010):
--     for delete using (workflow.is_manager());

drop policy if exists members_insert on workflow.members;
create policy members_insert on workflow.members
  for insert with check (workflow.is_superadmin() or workflow.is_manager());

drop policy if exists members_update on workflow.members;
create policy members_update on workflow.members
  for update
  using (workflow.is_superadmin() or workflow.is_manager())
  with check (workflow.is_superadmin() or workflow.is_manager());

drop policy if exists members_delete on workflow.members;
create policy members_delete on workflow.members
  for delete using (workflow.is_superadmin() or workflow.is_manager());

-- workflow.stages (migration 012)
--   stages_insert:
--     for insert with check (workflow.is_manager());
--   stages_update:
--     for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists stages_insert on workflow.stages;
create policy stages_insert on workflow.stages
  for insert with check (workflow.is_superadmin() or workflow.is_manager());

drop policy if exists stages_update on workflow.stages;
create policy stages_update on workflow.stages
  for update
  using (workflow.is_superadmin() or workflow.is_manager())
  with check (workflow.is_superadmin() or workflow.is_manager());

-- workflow.scope_types (migration 012)
--   scope_types_insert:
--     for insert with check (workflow.is_manager());
--   scope_types_update:
--     for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists scope_types_insert on workflow.scope_types;
create policy scope_types_insert on workflow.scope_types
  for insert with check (workflow.is_superadmin() or workflow.is_manager());

drop policy if exists scope_types_update on workflow.scope_types;
create policy scope_types_update on workflow.scope_types
  for update
  using (workflow.is_superadmin() or workflow.is_manager())
  with check (workflow.is_superadmin() or workflow.is_manager());

-- workflow.reason_codes (migration 001)
--   reason_codes_insert:
--     for insert with check (workflow.is_manager());
--   reason_codes_update:
--     for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists reason_codes_insert on workflow.reason_codes;
create policy reason_codes_insert on workflow.reason_codes
  for insert with check (workflow.is_superadmin() or workflow.is_manager());

drop policy if exists reason_codes_update on workflow.reason_codes;
create policy reason_codes_update on workflow.reason_codes
  for update
  using (workflow.is_superadmin() or workflow.is_manager())
  with check (workflow.is_superadmin() or workflow.is_manager());

-- workflow.reporting_periods (migration 001)
--   reporting_periods_insert:
--     for insert with check (workflow.is_manager());
--   reporting_periods_update:
--     for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists reporting_periods_insert on workflow.reporting_periods;
create policy reporting_periods_insert on workflow.reporting_periods
  for insert with check (workflow.is_superadmin() or workflow.is_manager());

drop policy if exists reporting_periods_update on workflow.reporting_periods;
create policy reporting_periods_update on workflow.reporting_periods
  for update
  using (workflow.is_superadmin() or workflow.is_manager())
  with check (workflow.is_superadmin() or workflow.is_manager());

-- workflow.client_owners (migration 004)
--   client_owners_insert:
--     for insert with check (workflow.is_manager());
--   client_owners_update:
--     for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists client_owners_insert on workflow.client_owners;
create policy client_owners_insert on workflow.client_owners
  for insert with check (workflow.is_superadmin() or workflow.is_manager());

drop policy if exists client_owners_update on workflow.client_owners;
create policy client_owners_update on workflow.client_owners
  for update
  using (workflow.is_superadmin() or workflow.is_manager())
  with check (workflow.is_superadmin() or workflow.is_manager());

-- -----------------------------------------------------------------------------
-- 4. PIC-KEYED / TEAM-KEYED WRITE POLICIES — 21 policies across 9 tables.
-- -----------------------------------------------------------------------------

-- workflow.project_floors (migration 009)
--   project_floors_insert:
--     for insert with check (
--       exists (select 1 from workflow.projects p
--         where p.id = project_floors.project_id and p.pic_id = (select auth.uid())));
--   project_floors_update: same exists(...) in both using and with check.
--   project_floors_delete: same exists(...) in using.

drop policy if exists project_floors_insert on workflow.project_floors;
create policy project_floors_insert on workflow.project_floors
  for insert with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_floors_update on workflow.project_floors;
create policy project_floors_update on workflow.project_floors
  for update using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_floors_delete on workflow.project_floors;
create policy project_floors_delete on workflow.project_floors
  for delete using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- workflow.shop_drawing_items (migration 009), same PIC-keyed shape.

drop policy if exists shop_drawing_items_insert on workflow.shop_drawing_items;
create policy shop_drawing_items_insert on workflow.shop_drawing_items
  for insert with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_items_update on workflow.shop_drawing_items;
create policy shop_drawing_items_update on workflow.shop_drawing_items
  for update using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_items_delete on workflow.shop_drawing_items;
create policy shop_drawing_items_delete on workflow.shop_drawing_items
  for delete using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- workflow.floor_sub_stages (migration 009), PIC-keyed via a join through
-- project_floors to projects.

drop policy if exists floor_sub_stages_insert on workflow.floor_sub_stages;
create policy floor_sub_stages_insert on workflow.floor_sub_stages
  for insert with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists floor_sub_stages_update on workflow.floor_sub_stages;
create policy floor_sub_stages_update on workflow.floor_sub_stages
  for update using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists floor_sub_stages_delete on workflow.floor_sub_stages;
create policy floor_sub_stages_delete on workflow.floor_sub_stages
  for delete using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

-- workflow.project_handover_items (migration 009), same PIC-keyed shape as
-- project_floors.

drop policy if exists project_handover_items_insert on workflow.project_handover_items;
create policy project_handover_items_insert on workflow.project_handover_items
  for insert with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_handover_items_update on workflow.project_handover_items;
create policy project_handover_items_update on workflow.project_handover_items
  for update using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_handover_items_delete on workflow.project_handover_items;
create policy project_handover_items_delete on workflow.project_handover_items
  for delete using (
    workflow.is_superadmin()
    or exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- workflow.progress_updates (migration 006) — progress_updates_insert only,
-- no update/delete policy exists for this table.
--
-- SPECIAL CASE: migration 006 deliberately REMOVED a manager bypass here
-- once (Result 038's finding). This migration's superadmin OR-clause
-- reverses that specific prior decision, deliberately — see this
-- migration's own header for why that reversal is reasoned, not
-- accidental.
--
--   progress_updates_insert:
--     for insert with check (
--       author_id = (select auth.uid())
--       and (
--         (subject_type = 'project' and exists (select 1 from workflow.projects p
--           where p.id = subject_id and p.pic_id = (select auth.uid())))
--         or (subject_type = 'item' and exists (select 1 from workflow.project_items i
--           where i.id = subject_id and i.pic_id = (select auth.uid())))
--       )
--     );

drop policy if exists progress_updates_insert on workflow.progress_updates;
create policy progress_updates_insert on workflow.progress_updates
  for insert with check (
    workflow.is_superadmin()
    or (
      author_id = (select auth.uid())
      and (
        (
          subject_type = 'project'
          and exists (
            select 1 from workflow.projects p
            where p.id = subject_id and p.pic_id = (select auth.uid())
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
    )
  );

comment on policy progress_updates_insert on workflow.progress_updates is
  'TEMPORARY superadmin bypass — Brief 040. Migration 006 deliberately '
  'REMOVED a manager bypass here once; this OR-clause reverses that '
  'specific prior decision on purpose. Superadmin is a categorically '
  'different, temporary, fully-removable testing mechanism, not a '
  'permanent re-grant of manager override power over progress updates — '
  'this is not an accidental regression of migration 006''s own fix.';

-- workflow.procurement_lines (migration 014), team-keyed.
--   procurement_lines_insert:
--     for insert with check (workflow.current_team() in ('procurement_local', 'procurement_overseas'));
--   procurement_lines_update: same predicate in both using and with check.

drop policy if exists procurement_lines_insert on workflow.procurement_lines;
create policy procurement_lines_insert on workflow.procurement_lines
  for insert with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

drop policy if exists procurement_lines_update on workflow.procurement_lines;
create policy procurement_lines_update on workflow.procurement_lines
  for update
  using (
    workflow.is_superadmin()
    or workflow.current_team() in ('procurement_local', 'procurement_overseas')
  )
  with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

-- workflow.procurement_line_floors (migration 015), same team-keyed
-- predicate as procurement_lines.
--   procurement_line_floors_insert:
--     for insert with check (workflow.current_team() in ('procurement_local', 'procurement_overseas'));
--   procurement_line_floors_delete:
--     for delete using (workflow.current_team() in ('procurement_local', 'procurement_overseas'));

drop policy if exists procurement_line_floors_insert on workflow.procurement_line_floors;
create policy procurement_line_floors_insert on workflow.procurement_line_floors
  for insert with check (
    workflow.is_superadmin()
    or workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

drop policy if exists procurement_line_floors_delete on workflow.procurement_line_floors;
create policy procurement_line_floors_delete on workflow.procurement_line_floors
  for delete using (
    workflow.is_superadmin()
    or workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

-- workflow.qc_inspections (migration 017), team-keyed (NOT PIC-keyed —
-- replaced migration 009's original PIC-keyed text). No delete policy
-- exists (migration 017 deliberately did not recreate one; RLS
-- default-denies).
--   qc_inspections_insert:
--     for insert with check (workflow.current_team() = 'qc');
--   qc_inspections_update: same predicate in both using and with check.

drop policy if exists qc_inspections_insert on workflow.qc_inspections;
create policy qc_inspections_insert on workflow.qc_inspections
  for insert with check (
    workflow.is_superadmin() or workflow.current_team() = 'qc'
  );

drop policy if exists qc_inspections_update on workflow.qc_inspections;
create policy qc_inspections_update on workflow.qc_inspections
  for update
  using (workflow.is_superadmin() or workflow.current_team() = 'qc')
  with check (workflow.is_superadmin() or workflow.current_team() = 'qc');

-- workflow.qc_inspection_floors (migration 017), same team-keyed shape as
-- qc_inspections. No delete policy exists.
--   qc_inspection_floors_insert:
--     for insert with check (workflow.current_team() = 'qc');
--   qc_inspection_floors_update: same predicate in both using and with check.

drop policy if exists qc_inspection_floors_insert on workflow.qc_inspection_floors;
create policy qc_inspection_floors_insert on workflow.qc_inspection_floors
  for insert with check (
    workflow.is_superadmin() or workflow.current_team() = 'qc'
  );

drop policy if exists qc_inspection_floors_update on workflow.qc_inspection_floors;
create policy qc_inspection_floors_update on workflow.qc_inspection_floors
  for update
  using (workflow.is_superadmin() or workflow.current_team() = 'qc')
  with check (workflow.is_superadmin() or workflow.current_team() = 'qc');

-- -----------------------------------------------------------------------------
-- 5. BOQ TABLES — new superadmin-only write policies (migration 018 shipped
-- all seven read-only; zero write policies existed anywhere on these
-- tables before this migration). No one but superadmin gets write access
-- here — this is not a general "open up BOQ writes" change.
-- -----------------------------------------------------------------------------

create policy tender_boq_lines_insert on workflow.tender_boq_lines
  for insert with check (workflow.is_superadmin());
create policy tender_boq_lines_update on workflow.tender_boq_lines
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
create policy tender_boq_lines_delete on workflow.tender_boq_lines
  for delete using (workflow.is_superadmin());

create policy tender_boq_line_locations_insert on workflow.tender_boq_line_locations
  for insert with check (workflow.is_superadmin());
create policy tender_boq_line_locations_update on workflow.tender_boq_line_locations
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
create policy tender_boq_line_locations_delete on workflow.tender_boq_line_locations
  for delete using (workflow.is_superadmin());

create policy tender_boq_location_map_insert on workflow.tender_boq_location_map
  for insert with check (workflow.is_superadmin());
create policy tender_boq_location_map_update on workflow.tender_boq_location_map
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
create policy tender_boq_location_map_delete on workflow.tender_boq_location_map
  for delete using (workflow.is_superadmin());

create policy contract_boq_lines_insert on workflow.contract_boq_lines
  for insert with check (workflow.is_superadmin());
create policy contract_boq_lines_update on workflow.contract_boq_lines
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
create policy contract_boq_lines_delete on workflow.contract_boq_lines
  for delete using (workflow.is_superadmin());

create policy shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines
  for insert with check (workflow.is_superadmin());
create policy shop_drawing_boq_lines_update on workflow.shop_drawing_boq_lines
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
create policy shop_drawing_boq_lines_delete on workflow.shop_drawing_boq_lines
  for delete using (workflow.is_superadmin());

create policy shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations
  for insert with check (workflow.is_superadmin());
create policy shop_drawing_boq_line_locations_update on workflow.shop_drawing_boq_line_locations
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
create policy shop_drawing_boq_line_locations_delete on workflow.shop_drawing_boq_line_locations
  for delete using (workflow.is_superadmin());

create policy shop_drawing_boq_location_map_insert on workflow.shop_drawing_boq_location_map
  for insert with check (workflow.is_superadmin());
create policy shop_drawing_boq_location_map_update on workflow.shop_drawing_boq_location_map
  for update using (workflow.is_superadmin()) with check (workflow.is_superadmin());
create policy shop_drawing_boq_location_map_delete on workflow.shop_drawing_boq_location_map
  for delete using (workflow.is_superadmin());

comment on policy tender_boq_lines_insert on workflow.tender_boq_lines is
  'TEMPORARY, superadmin-only — Brief 040 §4. First write path onto any '
  'BOQ table, for anyone. Not a general BOQ-writes-open change.';
comment on policy tender_boq_line_locations_insert on workflow.tender_boq_line_locations is
  'TEMPORARY, superadmin-only — Brief 040 §4.';
comment on policy tender_boq_location_map_insert on workflow.tender_boq_location_map is
  'TEMPORARY, superadmin-only — Brief 040 §4.';
comment on policy contract_boq_lines_insert on workflow.contract_boq_lines is
  'TEMPORARY, superadmin-only — Brief 040 §4.';
comment on policy shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines is
  'TEMPORARY, superadmin-only — Brief 040 §4.';
comment on policy shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations is
  'TEMPORARY, superadmin-only — Brief 040 §4.';
comment on policy shop_drawing_boq_location_map_insert on workflow.shop_drawing_boq_location_map is
  'TEMPORARY, superadmin-only — Brief 040 §4.';

-- DELETE grant: migration 002 never auto-grants DELETE (its own header
-- says so explicitly); migration 018 added no DELETE grant for any BOQ
-- table (confirmed by direct inspection). INSERT/UPDATE are already
-- covered by migration 002's `alter default privileges` rule, which
-- applies automatically to any table created after it — no fresh grant
-- needed for those two. Matches the established explicit-grant pattern
-- from migrations 009/010/015.
grant delete on
  workflow.tender_boq_lines,
  workflow.tender_boq_line_locations,
  workflow.tender_boq_location_map,
  workflow.contract_boq_lines,
  workflow.shop_drawing_boq_lines,
  workflow.shop_drawing_boq_line_locations,
  workflow.shop_drawing_boq_location_map
to authenticated;

commit;
