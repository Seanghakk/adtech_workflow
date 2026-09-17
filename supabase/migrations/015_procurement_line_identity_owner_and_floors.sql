-- =============================================================================
-- ADTECH Workflow Tracker — Migration 015: procurement line identity, owner,
-- and floor coverage
-- Brief: ADTECH_WF_Brief_022_Procurement_Line_Identity_Owner_And_Floors §2/§3/§4
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST, NOT ASSUMED: main is b209ac6
-- (Migration 013: contract value + variation attribution, Brief 020, PR #13).
-- Migration 014 (procurement_lines write policies, Brief 019) sits on PR #14,
-- STILL UNMERGED — confirmed via `gh pr view 14` before numbering anything,
-- per the brief's own §0 (the last two rounds both hit a numbering collision
-- from a brief written before the previous migration landed). This migration
-- is therefore 015, reserving the number ahead of PR #14 merging rather than
-- colliding with it. This branch is cut from main (does NOT include PR #14's
-- own file) — see this round's Result doc §0 for the full account and the
-- order the two PRs need to land in.
--
-- SCHEMA ONLY (§5) — closes three gaps Result 019 found while building
-- screen 2c and reported rather than worked around a second time: no
-- identity for a procurement line (§1/§2 below), no owner column (§3.1
-- below, the same conclusion Result 018 §3.3 reached about variations,
-- which migration 013 already fixed the same way), and no floor coverage
-- (§4 below). No screen changes, no write UI, no backfill.
--
-- WHAT THIS MIGRATION DOES, three parts, exactly per the brief:
--
--   1. IDENTITY (§2) — workflow.project_items READ FIRST AND REPORTED, per
--      §2.2: its own columns (migration 001) are id, project_id, title,
--      pic_id, scheduled_date, status, opened_at, closed_at, created_at,
--      updated_at. Its own comment says why it exists — "pic_id +
--      scheduled_date together are what make the PIC concurrency breach
--      query possible" (the 6b/4a daily-limit check) — a generic per-PIC
--      task/workload tracker, NOT a bill-of-quantities line: it carries no
--      quantity, no unit, no supplier concept, and grepping every migration
--      file in this repo for "boq" (case-insensitive) turns up exactly one
--      hit, a comment in migration 001 ("as SO + BOQ exist"), never a table.
--      DECISION (§2.3(b)): project_items is NOT the BOQ-line concept — no
--      BOQ table exists anywhere in this schema, and none is invented here
--      (§2.3's own instruction: report it and stop, not build one). A plain
--      procurement_lines.description text column is added instead. NOT NULL
--      vs nullable is decided at apply time from the table's own live row
--      count, exactly the pattern migration 013 used for
--      variations.raised_by (§2.4, §1's pre-flight count) — see part 3
--      below.
--
--   2. OWNER (§3) — procurement_lines.assigned_to, FK to
--      public.user_profiles(id), ON DELETE RESTRICT (matching every one of
--      the person FKs already in this schema — confirmed by grep, all use
--      RESTRICT, no exceptions), ALWAYS nullable regardless of the §1 count
--      (§3.2 is explicit this is deliberate, unlike description above — an
--      unassigned procurement line is a real, visible state, the same as
--      an unassigned project PIC). Deliberately NOT projects.pic_id reused
--      here — Brief 019 §3.1 is explicit the project's PIC does not do
--      procurement work, so pointing this at the PIC would misattribute it.
--
--   3. FLOORS (§4) — a join table, procurement_line_floors, mirroring
--      workflow.qc_inspection_floors (migration 008) in shape, naming
--      convention and FK behaviour, per §4.3: composite primary key
--      (procurement_line_id, floor_id), both columns NOT NULL, both ON
--      DELETE RESTRICT, no other columns — same reasoning as
--      qc_inspection_floors ("one delivery commonly serves several floors,"
--      Brief 007 Amendment A §3.2): one procurement line can cover several
--      floors without being owned by any one of them. A line with NO rows
--      here applies to the whole project — the ordinary, supported case
--      (§4.4), same rule migration 008 established for projects themselves.
--      RLS (AMENDED TWICE, Brief 022 Amendments A and B): §4.3's own instruction to
--      match procurement_lines_select with a flat workflow.is_member() check
--      was written on a false premise. Result 022 §3 read
--      procurement_lines_select out of migration 001, where it genuinely was
--      flat — but migration 004 later REDEFINED it when sales roles and
--      client ownership arrived. Queried live from pg_policies on 17 Sep
--      2026 (Amendment A §1), procurement_lines_select's actual qual is:
--        (workflow.is_member() AND (EXISTS (
--           SELECT 1 FROM workflow.projects p
--           WHERE p.id = procurement_lines.project_id
--             AND workflow.can_view_project(p.client_id,
--                                           p.is_maintenance_contract))))
--      i.e. project-scoped, through exactly the can_view_project() join
--      qc_inspection_floors_select itself uses — the opposite of what §4.3
--      assumed. A flat is_member() policy here would have made this join
--      table MORE permissive than procurement_lines itself: a sales member
--      with no ownership of a project's client could not read that
--      project's procurement_lines but could still read its
--      procurement_line_floors rows. Per Amendment A §3.1, the fix is an
--      EXISTS join through procurement_lines itself, not a re-derived
--      can_view_project() call duplicating that policy's own arguments —
--      querying procurement_lines from inside this policy runs under
--      procurement_lines' own RLS, so if procurement_lines_select changes
--      again, this join table follows automatically rather than drifting a
--      second time.
--      AMENDMENT B §3 adds one more thing: the join alone carries no check
--      of its own, so its protection holds only while RLS is actually
--      ENABLED on procurement_lines — a fact separate from whether that
--      table's policies are correct, and one the sibling ADTECH CMMS got
--      wrong in production once (policies read correctly while an
--      emergency rollback had quietly left RLS disabled). workflow.
--      is_member() is added back ALONGSIDE the join as deliberate
--      redundancy: with RLS enabled this changes nothing (procurement_lines_select
--      already requires is_member()); with RLS accidentally disabled on
--      procurement_lines, is_member() is what still limits this table's
--      exposure to application members instead of opening it to anyone
--      holding the anon key. §3.4's survey of the rest of workflow's
--      policies for the same join-with-no-check-of-its-own pattern is
--      reported, not fixed, in this round's Result doc. Everything else in
--      this migration (§3.2 of both amendments) is unchanged.
--      Write policy: the SAME team-keyed check migration 014 uses on
--      procurement_lines itself — workflow.current_team() in
--      ('procurement_local', 'procurement_overseas') — read directly from
--      PR #14's branch so the two genuinely match, per §4.5. INSERT and
--      DELETE, not INSERT and UPDATE: unlike procurement_lines, this table
--      has no non-key column, so there is nothing to UPDATE — correcting a
--      floor assignment means removing one row and inserting another, the
--      same shape migration 009 gave qc_inspection_floors (which also has
--      insert/delete-shaped, not update-shaped, write policies). DELETE
--      needs an explicit GRANT (migration 002's default-privilege grant
--      covers SELECT/INSERT/UPDATE on new tables automatically, never
--      DELETE — the same standing trap Brief 019/022 §0 both name), so this
--      migration grants DELETE on procurement_line_floors to authenticated
--      explicitly, the same as migration 009 did for its own six tables.
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor. Applies BY HAND.
-- Wrapped in an explicit transaction. The rollback
-- (015_procurement_line_identity_owner_and_floors_rollback.sql) is meant to
-- be tested FIRST against `adtech-workflow-rollback-test` (carries
-- migrations 001-013 plus the stub public.user_profiles) BEFORE this is
-- applied to prod. NOTE, per the brief's own §6: migration 014 may not be
-- applied there yet either — this migration does NOT depend on migration
-- 014's own DDL (it adds no column and drops no policy that 014 touches),
-- only on 014's POLICY TEXT matching for the join table's write rule, which
-- is a text match confirmed by reading PR #14's branch, not a runtime
-- dependency. The two migrations can apply in either order.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.procurement_lines.description — §2
-- -----------------------------------------------------------------------------

alter table workflow.procurement_lines
  add column description text;

comment on column workflow.procurement_lines.description is
  'What is being procured — closes the gap Result 019 §1/§5 found: a
   procurement line carried no identity at all, and screen 2c could only
   label rows "Procurement line 1", "Procurement line 2". workflow.
   project_items was read and confirmed NOT to be the BOQ-line concept
   (Brief 022 §2.2/§2.3(b) — it is a per-PIC task/workload tracker, no
   quantity/unit/supplier concept) and no BOQ table exists anywhere in this
   schema, so this is a plain text column, not an FK. NOT NULL vs nullable
   decided at apply time from this table''s own live row count — see this
   migration''s header and the Result doc for which branch was taken.';

-- -----------------------------------------------------------------------------
-- 2. workflow.procurement_lines.assigned_to — §3
-- -----------------------------------------------------------------------------

alter table workflow.procurement_lines
  add column assigned_to uuid references public.user_profiles (id) on delete restrict;

comment on column workflow.procurement_lines.assigned_to is
  'Who is doing the procurement work on this line — closes the gap Result
   019 §5 found: Design Note Rev 3 §4.9''s "named person holding it, then
   the age" invariant could not be satisfied at the procurement-line level,
   the same conclusion Result 018 §3.3 reached about workflow.variations
   before migration 013 added raised_by/approved_by there. Deliberately NOT
   projects.pic_id — Brief 019 §3.1 is explicit the project''s PIC does not
   source products and must not be shown as though they do. ALWAYS
   nullable, regardless of the description column''s own NOT NULL decision
   above (§3.2) — an unassigned procurement line is a real, visible state,
   the same as an unassigned project PIC (migration 006), not an error to
   prevent. FK to public.user_profiles(id), ON DELETE RESTRICT, matching
   every other person FK in this schema (confirmed by grep — projects.
   pic_id, project_items.pic_id, requests.requester_id/current_owner_id,
   request_handoffs.from_owner_id/to_owner_id, progress_updates.author_id,
   catalogue_items/catalogue_events'' verifier/recorder columns, sales''
   assignment columns, variations.raised_by/approved_by — all RESTRICT, no
   exceptions).';

-- -----------------------------------------------------------------------------
-- 3. workflow.procurement_line_floors — §4
-- -----------------------------------------------------------------------------

create table workflow.procurement_line_floors (
  procurement_line_id  uuid not null references workflow.procurement_lines (id) on delete restrict,
  floor_id              uuid not null references workflow.project_floors (id) on delete restrict,
  primary key (procurement_line_id, floor_id)
);

comment on table workflow.procurement_line_floors is
  'Brief 022 §4 — mirrors workflow.qc_inspection_floors (migration 008) in
   shape and reasoning: "one delivery commonly serves several floors"
   (Brief 007 Amendment A §3.2) applies identically to a purchase order, so
   this is a many-to-many join rather than a floor_id column on
   procurement_lines itself. A procurement line with NO rows here applies
   to the whole project — the ordinary, supported case (§4.4), not an
   incomplete setup, same rule migration 008 established for projects
   themselves.';

alter table workflow.procurement_line_floors enable row level security;

drop policy if exists procurement_line_floors_select on workflow.procurement_line_floors;
create policy procurement_line_floors_select on workflow.procurement_line_floors
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.procurement_lines pl
      where pl.id = procurement_line_floors.procurement_line_id
    )
  );

comment on policy procurement_line_floors_select on workflow.procurement_line_floors is
  'AMENDED TWICE. Brief 022 Amendment A §1/§3.1: Brief 022 §4.3 asked for a
   flat workflow.is_member() check on the stated premise that
   procurement_lines_select (migration 001) was itself flat. That premise
   was false: migration 004 redefined procurement_lines_select to the same
   can_view_project() project-scoping qc_inspection_floors_select uses, and
   the live pg_policies text confirmed it on 17 Sep 2026 (see this
   migration''s header). A flat is_member() policy here would have made
   this join table MORE permissive than procurement_lines itself.
   Amendment A scoped it by EXISTS-joining through
   workflow.procurement_lines rather than re-deriving can_view_project()''s
   own arguments — this runs under procurement_lines'' own RLS, so it
   tracks procurement_lines_select automatically if that policy changes
   again, instead of drifting a second time the way this one just did.
   Brief 022 Amendment B §3 then added the workflow.is_member() check back
   ALONGSIDE the join, deliberately redundant: the join alone carries no
   check of its own and protects this table only for as long as RLS stays
   enabled on procurement_lines. This is not hypothetical — the sibling
   ADTECH CMMS had RLS toggled off in production by an emergency rollback
   while every policy still read as correct. With RLS enabled on
   procurement_lines this changes nothing, since procurement_lines_select
   already requires is_member(). With RLS accidentally disabled there, the
   join is satisfied for every row, and is_member() is what keeps exposure
   limited to application members rather than opening the table to anyone
   holding the anon key. Do not simplify this back down to the join alone.';

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

comment on policy procurement_line_floors_insert on workflow.procurement_line_floors is
  'Same team-keyed rule as procurement_lines_insert (migration 014, PR #14)
   — workflow.current_team() in (''procurement_local'', ''procurement_overseas'').
   INSERT and DELETE here, not INSERT and UPDATE like procurement_lines
   itself: this table has no non-key column, so there is nothing to UPDATE
   — correcting a floor assignment means deleting one row and inserting
   another, the same insert/delete shape migration 009 gave
   qc_inspection_floors.';

-- Migration 002's default-privilege grant covers SELECT/INSERT/UPDATE on
-- every new table automatically; DELETE is never granted that way (the
-- standing trap both Brief 019 §0 and Brief 022 §0 name — "policies filter
-- a grant, they do not create one"). Explicit grant, matching migration
-- 009's own precedent for its six tables.
grant delete on workflow.procurement_line_floors to authenticated;

-- -----------------------------------------------------------------------------
-- 4. description NOT NULL vs nullable — decided here, at apply time, per
--    §2.4/§1. See this file's header for the full reasoning behind each
--    branch. Same pattern migration 013 used for variations.raised_by.
-- -----------------------------------------------------------------------------

do $$
declare
  v_procurement_line_count integer;
begin
  select count(*) into v_procurement_line_count from workflow.procurement_lines;

  if v_procurement_line_count = 0 then
    alter table workflow.procurement_lines alter column description set not null;
    raise notice 'Migration 015: workflow.procurement_lines had 0 rows — description set NOT NULL (Brief 022 §2.4, empty-table branch). Every procurement line from now on says what it is procuring.';
  else
    raise notice 'Migration 015: workflow.procurement_lines had % row(s) — description left NULLABLE (Brief 022 §2.4, non-empty branch). Backfilling what a historical line was procuring would mean inventing an answer; tightening this later needs a real backfill decision, not a guess.', v_procurement_line_count;
  end if;
end $$;

commit;
