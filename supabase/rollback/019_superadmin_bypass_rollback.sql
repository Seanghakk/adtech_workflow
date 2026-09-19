-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 019: superadmin bypass
-- Brief: ADTECH_WF_Brief_040_Superadmin_Implementation
--
-- Restores every touched policy to its EXACT pre-migration text (quoted
-- verbatim in migration 019's own header), drops every new BOQ write
-- policy entirely, drops the is_superadmin() function, revokes the DELETE
-- grant this migration added on the seven BOQ tables, and drops the
-- is_superadmin column. Run immediately after migration 019 in the same
-- database, this should leave the schema byte-for-byte equivalent to its
-- pre-019 state (informational comments aside).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 5. BOQ TABLES — drop every superadmin-only write policy this migration
-- added. No pre-existing write policies to restore (migration 018 shipped
-- all seven SELECT-only).
-- -----------------------------------------------------------------------------

drop policy if exists tender_boq_lines_insert on workflow.tender_boq_lines;
drop policy if exists tender_boq_lines_update on workflow.tender_boq_lines;
drop policy if exists tender_boq_lines_delete on workflow.tender_boq_lines;

drop policy if exists tender_boq_line_locations_insert on workflow.tender_boq_line_locations;
drop policy if exists tender_boq_line_locations_update on workflow.tender_boq_line_locations;
drop policy if exists tender_boq_line_locations_delete on workflow.tender_boq_line_locations;

drop policy if exists tender_boq_location_map_insert on workflow.tender_boq_location_map;
drop policy if exists tender_boq_location_map_update on workflow.tender_boq_location_map;
drop policy if exists tender_boq_location_map_delete on workflow.tender_boq_location_map;

drop policy if exists contract_boq_lines_insert on workflow.contract_boq_lines;
drop policy if exists contract_boq_lines_update on workflow.contract_boq_lines;
drop policy if exists contract_boq_lines_delete on workflow.contract_boq_lines;

drop policy if exists shop_drawing_boq_lines_insert on workflow.shop_drawing_boq_lines;
drop policy if exists shop_drawing_boq_lines_update on workflow.shop_drawing_boq_lines;
drop policy if exists shop_drawing_boq_lines_delete on workflow.shop_drawing_boq_lines;

drop policy if exists shop_drawing_boq_line_locations_insert on workflow.shop_drawing_boq_line_locations;
drop policy if exists shop_drawing_boq_line_locations_update on workflow.shop_drawing_boq_line_locations;
drop policy if exists shop_drawing_boq_line_locations_delete on workflow.shop_drawing_boq_line_locations;

drop policy if exists shop_drawing_boq_location_map_insert on workflow.shop_drawing_boq_location_map;
drop policy if exists shop_drawing_boq_location_map_update on workflow.shop_drawing_boq_location_map;
drop policy if exists shop_drawing_boq_location_map_delete on workflow.shop_drawing_boq_location_map;

-- Revoke the DELETE grant migration 019 added. INSERT/UPDATE were never
-- explicitly granted by 019 (they came from migration 002's default
-- privileges), so nothing to revoke for those.
revoke delete on
  workflow.tender_boq_lines,
  workflow.tender_boq_line_locations,
  workflow.tender_boq_location_map,
  workflow.contract_boq_lines,
  workflow.shop_drawing_boq_lines,
  workflow.shop_drawing_boq_line_locations,
  workflow.shop_drawing_boq_location_map
from authenticated;

-- -----------------------------------------------------------------------------
-- 4. PIC-KEYED / TEAM-KEYED WRITE POLICIES — restore exact pre-019 text.
-- -----------------------------------------------------------------------------

drop policy if exists project_floors_insert on workflow.project_floors;
create policy project_floors_insert on workflow.project_floors
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_floors_update on workflow.project_floors;
create policy project_floors_update on workflow.project_floors
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_floors_delete on workflow.project_floors;
create policy project_floors_delete on workflow.project_floors
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_floors.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_items_insert on workflow.shop_drawing_items;
create policy shop_drawing_items_insert on workflow.shop_drawing_items
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_items_update on workflow.shop_drawing_items;
create policy shop_drawing_items_update on workflow.shop_drawing_items
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists shop_drawing_items_delete on workflow.shop_drawing_items;
create policy shop_drawing_items_delete on workflow.shop_drawing_items
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists floor_sub_stages_insert on workflow.floor_sub_stages;
create policy floor_sub_stages_insert on workflow.floor_sub_stages
  for insert with check (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists floor_sub_stages_update on workflow.floor_sub_stages;
create policy floor_sub_stages_update on workflow.floor_sub_stages
  for update using (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists floor_sub_stages_delete on workflow.floor_sub_stages;
create policy floor_sub_stages_delete on workflow.floor_sub_stages
  for delete using (
    exists (
      select 1 from workflow.project_floors f
      join workflow.projects p on p.id = f.project_id
      where f.id = floor_sub_stages.floor_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_handover_items_insert on workflow.project_handover_items;
create policy project_handover_items_insert on workflow.project_handover_items
  for insert with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_handover_items_update on workflow.project_handover_items;
create policy project_handover_items_update on workflow.project_handover_items
  for update using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_handover_items_delete on workflow.project_handover_items;
create policy project_handover_items_delete on workflow.project_handover_items
  for delete using (
    exists (
      select 1 from workflow.projects p
      where p.id = project_handover_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists progress_updates_insert on workflow.progress_updates;
create policy progress_updates_insert on workflow.progress_updates
  for insert with check (
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
  );

drop policy if exists procurement_lines_insert on workflow.procurement_lines;
create policy procurement_lines_insert on workflow.procurement_lines
  for insert with check (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

drop policy if exists procurement_lines_update on workflow.procurement_lines;
create policy procurement_lines_update on workflow.procurement_lines
  for update
  using (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  )
  with check (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

drop policy if exists procurement_line_floors_insert on workflow.procurement_line_floors;
create policy procurement_line_floors_insert on workflow.procurement_line_floors
  for insert with check (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

drop policy if exists procurement_line_floors_delete on workflow.procurement_line_floors;
create policy procurement_line_floors_delete on workflow.procurement_line_floors
  for delete using (
    workflow.current_team() in ('procurement_local', 'procurement_overseas')
  );

drop policy if exists qc_inspections_insert on workflow.qc_inspections;
create policy qc_inspections_insert on workflow.qc_inspections
  for insert with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspections_insert on workflow.qc_inspections is
  'Team-keyed, NOT PIC-keyed — Brief 024 §4.1/§4.5. Any active member of
   the QC team (identified by workflow.teams.code = ''qc'', never by
   label, via workflow.current_team() — migration 001) may insert an
   inspection against any project. The project''s PIC is deliberately
   excluded: Brief 007 Amendment A §3.1 already established QC''s soft-gate
   role is independent of PIC. No manager bypass, matching migration
   014''s procurement_lines_insert precedent exactly. Replaces this
   policy''s prior PIC-keyed text (migration 009) — quoted verbatim in
   this migration''s own header for the diff.';

drop policy if exists qc_inspections_update on workflow.qc_inspections;
create policy qc_inspections_update on workflow.qc_inspections
  for update
  using (
    workflow.current_team() = 'qc'
  )
  with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspections_update on workflow.qc_inspections is
  'Same team-keyed rule as qc_inspections_insert, both directions — Brief
   024 §4.1/§4.5. Replaces this policy''s prior PIC-keyed text (migration
   009), quoted verbatim in this migration''s own header.';

drop policy if exists qc_inspection_floors_insert on workflow.qc_inspection_floors;
create policy qc_inspection_floors_insert on workflow.qc_inspection_floors
  for insert with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspection_floors_insert on workflow.qc_inspection_floors is
  'Team-keyed, NOT PIC-keyed — Brief 024 §4.1/§4.5, same rule as
   qc_inspections_insert. A material inspection commonly references
   several floors (Brief 007 Amendment §3.2); each qc_inspection_floors
   row it creates is gated the same way, independent of the join path
   its migration-008 SELECT policy uses. Replaces this policy''s prior
   PIC-keyed text (migration 009), quoted verbatim in this migration''s
   own header.';

drop policy if exists qc_inspection_floors_update on workflow.qc_inspection_floors;
create policy qc_inspection_floors_update on workflow.qc_inspection_floors
  for update
  using (
    workflow.current_team() = 'qc'
  )
  with check (
    workflow.current_team() = 'qc'
  );

comment on policy qc_inspection_floors_update on workflow.qc_inspection_floors is
  'Same team-keyed rule as qc_inspection_floors_insert, both directions —
   Brief 024 §4.1/§4.5. Replaces this policy''s prior PIC-keyed text
   (migration 009), quoted verbatim in this migration''s own header.';

-- -----------------------------------------------------------------------------
-- 3. is_manager()-GATED WRITE POLICIES — restore exact pre-019 text.
-- -----------------------------------------------------------------------------

drop policy if exists members_insert on workflow.members;
create policy members_insert on workflow.members
  for insert with check (workflow.is_manager());

drop policy if exists members_update on workflow.members;
create policy members_update on workflow.members
  for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists members_delete on workflow.members;
create policy members_delete on workflow.members
  for delete using (workflow.is_manager());

drop policy if exists stages_insert on workflow.stages;
create policy stages_insert on workflow.stages
  for insert with check (workflow.is_manager());

drop policy if exists stages_update on workflow.stages;
create policy stages_update on workflow.stages
  for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists scope_types_insert on workflow.scope_types;
create policy scope_types_insert on workflow.scope_types
  for insert with check (workflow.is_manager());

drop policy if exists scope_types_update on workflow.scope_types;
create policy scope_types_update on workflow.scope_types
  for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists reason_codes_insert on workflow.reason_codes;
create policy reason_codes_insert on workflow.reason_codes
  for insert with check (workflow.is_manager());

drop policy if exists reason_codes_update on workflow.reason_codes;
create policy reason_codes_update on workflow.reason_codes
  for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists reporting_periods_insert on workflow.reporting_periods;
create policy reporting_periods_insert on workflow.reporting_periods
  for insert with check (workflow.is_manager());

drop policy if exists reporting_periods_update on workflow.reporting_periods;
create policy reporting_periods_update on workflow.reporting_periods
  for update using (workflow.is_manager()) with check (workflow.is_manager());

drop policy if exists client_owners_insert on workflow.client_owners;
create policy client_owners_insert on workflow.client_owners
  for insert with check (workflow.is_manager());

drop policy if exists client_owners_update on workflow.client_owners;
create policy client_owners_update on workflow.client_owners
  for update using (workflow.is_manager()) with check (workflow.is_manager());

-- -----------------------------------------------------------------------------
-- 2. READS — restore workflow.can_view_project() to its exact pre-019 body
-- and comment, quoted verbatim from migration 004.
-- -----------------------------------------------------------------------------

create or replace function workflow.can_view_project(p_client_id uuid, p_is_maintenance boolean)
returns boolean
language sql
stable
security definer
set search_path = workflow, pg_temp
as $$
  select
    not workflow.is_sales_only_member()
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
  ' schema''s own Brief 001D fix for the same planner-hoisting reason.';

-- -----------------------------------------------------------------------------
-- 1. INFRASTRUCTURE — drop is_superadmin() and the is_superadmin column.
-- Nothing left half-removed.
-- -----------------------------------------------------------------------------

drop function if exists workflow.is_superadmin();

alter table workflow.members
  drop column if exists is_superadmin;

commit;
