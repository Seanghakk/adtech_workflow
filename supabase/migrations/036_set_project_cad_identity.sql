-- =============================================================================
-- ADTECH Workflow Tracker — Migration 036: the write path for the three
-- Brief 096 project-level fields
-- Brief: ADTECH_WF_Brief_097_Build_Project_Setup_Page §3
--
-- Brief 096 found (and Brief 097 confirms, needed to actually build
-- against it): workflow.projects has NO general UPDATE policy for
-- ordinary members — every project-level write goes through a narrow
-- SECURITY DEFINER function instead (workflow.assign_project_pic(),
-- migration 009; workflow.set_project_dates(), migration 026). The three
-- fields migration 096 added — cad_owner_name, cad_consultant_name,
-- drawing_numbering_mode — have no write path yet for the same reason.
--
-- Mirrors set_project_dates()'s own shape exactly, per this brief's own
-- explicit instruction, with ONE deliberate difference: set_project_dates
-- allows "this project's PIC OR a manager/admin"; this brief's own §3
-- says "PIC or superadmin only" — matching v7.2 §6.4's own "editing
-- identity, structure, systems and BOQ stays PIC-gated" (no general
-- manager carve-out named there, unlike the dates case) — so this
-- function's gate is narrower than set_project_dates' on purpose, not an
-- oversight.
-- =============================================================================

begin;

create or replace function workflow.set_project_cad_identity(
  p_project_id uuid,
  p_cad_owner_name text,
  p_cad_consultant_name text,
  p_drawing_numbering_mode text
)
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

  if not (workflow.is_superadmin() or v_pic_id = (select auth.uid())) then
    raise exception 'Only this project''s PIC may change its identity fields here.';
  end if;

  -- Same values the column's own CHECK constraint already allows
  -- (migration 032) — checked again here so a bad call raises a plain
  -- exception rather than a raw constraint-violation error, same
  -- reasoning set_project_dates() applies to its own start/target
  -- ordering check.
  if p_drawing_numbering_mode is not null and p_drawing_numbering_mode not in ('adtech', 'client') then
    raise exception 'Numbering mode must be ''adtech'' or ''client''.';
  end if;

  update workflow.projects
  set cad_owner_name = p_cad_owner_name,
      cad_consultant_name = p_cad_consultant_name,
      drawing_numbering_mode = p_drawing_numbering_mode,
      updated_at = now()
  where id = p_project_id;
end;
$$;

comment on function workflow.set_project_cad_identity(uuid, text, text, text) is
  'Brief 097 §3. The ONLY write path to workflow.projects.cad_owner_name,
   .cad_consultant_name and .drawing_numbering_mode (migrations 029/032
   added the columns with no write path — workflow.projects has no
   general UPDATE policy at all, by design). SECURITY DEFINER,
   PIC-of-this-project OR superadmin only, checked internally — same
   narrow-function shape as workflow.assign_project_pic() (migration 009)
   and workflow.set_project_dates() (migration 026), deliberately
   narrower than the latter (no manager carve-out — v7.2 §6.4 keeps
   identity/structure/systems/BOQ edits PIC-only). All three values may
   be passed null (including to clear a previously-set one) independently
   of the others — one function call sets/clears whichever of the three
   the caller passed, mirroring set_project_dates()''s own "set together,
   not three separate functions" reasoning.';

commit;
