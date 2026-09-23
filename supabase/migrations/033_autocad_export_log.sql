-- =============================================================================
-- ADTECH Workflow Tracker — Migration 033: AutoCAD export log
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §3 item 5
--
-- CHECKED THE LIVE SCHEMA FIRST: no table anywhere records an export
-- event of any kind. New table.
--
-- WHAT IT'S FOR (Concept Note Rev3 §6.1 item 5): "record each export
-- (when, who, snapshot of what was sent) so the export panel can show
-- what has changed since the last export." One row per CSV export
-- (Concept Note §2 — the app exports a CSV, ADTSSMLOAD reads it on the
-- AutoCAD side; this migration adds no export logic itself, only where
-- a future export action would log to).
--
-- WHO MAY READ/WRITE (Concept Note Rev3 §5 decision 5, carried forward
-- from Rev 2, and Brief 096 §3 item 5's own words): "the project PIC and
-- the Shop Drawing team" — the same two parties who may RUN an export
-- may also see this project's own export history. Not the A&A team
-- (unlike shop_drawing_items' own write policy, migration 028, which
-- deliberately widened to shop_drawing OR a_and_a) — Brief 096's own
-- item 5 names only "the Shop Drawing team," and this migration follows
-- that literally rather than assuming the same widening applies here.
-- Superadmin bypass included for consistency with every other table in
-- this schema (migration 019's own convention). APPEND-ONLY: no
-- UPDATE/DELETE policy — a past export's own record does not change
-- after the fact, same reasoning as workflow.project_progress_history
-- (migration 025) and workflow.catalogue_events, both insert-only logs
-- with no update/delete policy of their own.
-- =============================================================================

begin;

create table if not exists workflow.autocad_export_log (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references workflow.projects (id) on delete restrict,
  exported_at  timestamptz not null default now(),
  exported_by  uuid not null references public.user_profiles (id) on delete restrict,
  snapshot     jsonb not null,
  created_at   timestamptz not null default now()
);

comment on table workflow.autocad_export_log is
  'Brief 096 §3 item 5 / Concept Note Rev3 §6.1 item 5 — one row per
   AutoCAD CSV export. `snapshot` carries the project-level values
   (OWNER, CONSULTANT, SO number, etc.) and the sheet list actually sent,
   as JSON — enough for a future export panel to diff "what changed
   since last time" without re-deriving it from live data that may have
   since moved on. Append-only: no UPDATE/DELETE policy.';

comment on column workflow.autocad_export_log.snapshot is
  'The project-level values and the sheet list sent in this export, as
   JSON. Shape is owned by the (not-yet-built) export panel, not fixed
   by this migration.';

create index if not exists autocad_export_log_project_id_exported_at_idx
  on workflow.autocad_export_log (project_id, exported_at desc);

alter table workflow.autocad_export_log enable row level security;

drop policy if exists autocad_export_log_select on workflow.autocad_export_log;
create policy autocad_export_log_select on workflow.autocad_export_log
  for select using (
    workflow.is_superadmin()
    or workflow.current_team() = 'shop_drawing'
    or exists (
      select 1 from workflow.projects p
      where p.id = autocad_export_log.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists autocad_export_log_insert on workflow.autocad_export_log;
create policy autocad_export_log_insert on workflow.autocad_export_log
  for insert with check (
    workflow.is_superadmin()
    or workflow.current_team() = 'shop_drawing'
    or exists (
      select 1 from workflow.projects p
      where p.id = autocad_export_log.project_id
        and p.pic_id = (select auth.uid())
    )
  );

commit;
