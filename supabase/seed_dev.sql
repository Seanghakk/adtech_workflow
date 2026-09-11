-- =============================================================================
-- ADTECH Workflow Tracker — DEVELOPMENT SEED DATA. NOT A MIGRATION.
-- Brief: ADTECH_WF_Brief_002_Auth_Shell_And_Screen_6a §5.5
--
-- Deliberately kept OUTSIDE supabase/migrations/ — the CMMS made exactly
-- this mistake (its migration 001 seeds demo work orders into every fresh
-- database, still on its known-gaps list) and this project does not
-- repeat it. Nothing in here is idempotent-by-default the way the
-- migrations are; running it twice creates duplicate projects. Run it
-- once, by hand, in a review/dev database only — never against the real
-- ADTECH CMMS production database, which is what supabase/migrations/
-- 001 and 002 are already applied to.
--
-- RLS: workflow.clients/sites/projects/project_items carry SELECT-only
-- policies (Brief 001 §"pending a permission-model decision") — there is
-- no INSERT policy for any client role on any of them yet. Like the
-- bootstrap block at the end of migration 001, this file only runs
-- successfully in the Supabase SQL editor as table owner, which bypasses
-- RLS entirely. It will fail with a permission error run any other way.
--
-- PURPOSE: workflow.projects and workflow.project_items are genuinely
-- empty in prod (Brief 002 §5.4) — there is no real data yet to exercise
-- screen 6a against. This gives a handful of obviously-fake rows so 6a
-- (and its empty-state handling, by removing this file's rows again) can
-- both be exercised by hand.
--
-- DEPENDS ON MIGRATION 005 (Brief Fable 001 §4.5 — written as "004," then
-- renumbered to 005 after a git pull surfaced an unrelated, separately-
-- merged migration already claiming that number; see 005_so_registers.sql's
-- own header): the two so_number rows below now also set so_register_id,
-- required together with so_number by projects_so_register_pairing_check.
-- Running this file against a database that has not yet had migration 005
-- applied fails at the so_registers lookup (table does not exist yet)
-- rather than silently skipping the column. On the ALREADY-LIVE prod
-- database (this file applied there 09 Sep 2026, before migration 005
-- existed), migration 005 itself backfills so_register_id for the two rows
-- this file already created — see that migration's §3. Re-running this file
-- start-to-finish only ever happens against a fresh database, where
-- migration 005 runs first regardless.
--
-- ALL NAMES ARE FAKE. Not real colleagues, not real clients, not real SO
-- numbers — every so_number below uses the real ADxxxx-xx{T|S|C|P|D}
-- format (src/lib/validation/so-number.ts) but with an obviously-fake
-- sequence range (AD9xxx) that will never collide with a real SO.
--
-- owner_id / pic_id are left NULL throughout, deliberately, rather than
-- pointing at a guessed public.user_profiles id: workflow.progress_
-- updates_insert's WITH CHECK allows a manager to post against ANY
-- project regardless of owner_id/pic_id (workflow.is_manager()), and the
-- account bootstrapped by Brief 001C §3 is seeded with role = 'admin' —
-- so the person running this seed can already exercise 6a fully without
-- editing this file. The UI must render an unassigned owner/PIC as an
-- empty state ("Unassigned"), never blank or crashing — same rule as
-- everything else in Brief 002 §5.4.
-- =============================================================================

do $$
declare
  v_org_id uuid := '00000000-0000-0000-0000-000000000001';
  v_client_a uuid;
  v_client_b uuid;
  v_site_a uuid;
  v_site_b uuid;
  v_project_a uuid;
  v_project_b uuid;
  v_project_c uuid;
  v_project_d uuid;
  -- Migration 005 (Brief Fable 001 §4.5): so_number and so_register_id are
  -- required together (projects_so_register_pairing_check). Both seed rows
  -- below that carry a so_number are non-VAT (no "V" before the year), so
  -- both point at the same register row.
  v_so_register_non_vat uuid;
begin
  select id into v_so_register_non_vat
  from workflow.so_registers where code = 'non_vat';
  insert into workflow.clients (org_id, name) values
    (v_org_id, 'Sample Tower Holdings (fake — dev seed)')
    returning id into v_client_a;

  insert into workflow.clients (org_id, name) values
    (v_org_id, 'Riverside Mall Co. (fake — dev seed)')
    returning id into v_client_b;

  insert into workflow.sites (org_id, client_id, name) values
    (v_org_id, v_client_a, 'Sample Tower — Main Building')
    returning id into v_site_a;

  insert into workflow.sites (org_id, client_id, name) values
    (v_org_id, v_client_b, 'Riverside Mall — East Wing')
    returning id into v_site_b;

  -- Project A: healthy, recent movement (age ladder: ink band).
  insert into workflow.projects (
    org_id, client_id, site_id, name, stream, so_number, so_register_id, so_assigned_at,
    percent_complete, last_meaningful_movement_at, opened_at
  ) values (
    v_org_id, v_client_a, v_site_a,
    'Sample Tower — CCTV & access control (fake — dev seed)',
    'elv', 'AD9001-26S', v_so_register_non_vat, now() - interval '40 days',
    62, now() - interval '2 days', now() - interval '45 days'
  ) returning id into v_project_a;

  -- Project B: slipping (amber band), no SO number yet — exercises the
  -- 2b-adjacent "won job, no SO" case without building screen 2b itself.
  insert into workflow.projects (
    org_id, client_id, site_id, name, stream,
    percent_complete, last_meaningful_movement_at, opened_at
  ) values (
    v_org_id, v_client_b, v_site_b,
    'Riverside Mall — chiller plant integration (fake — dev seed)',
    'bms',
    40, now() - interval '8 days', now() - interval '30 days'
  ) returning id into v_project_b;

  -- Project C: gone quiet (red band), 95%+ — exercises the 90-99-band
  -- "quietly dying" case Theme 6 exists to surface.
  insert into workflow.projects (
    org_id, client_id, site_id, name, stream, so_number, so_register_id, so_assigned_at,
    percent_complete, last_meaningful_movement_at, opened_at
  ) values (
    v_org_id, v_client_a, v_site_a,
    'Sample Tower — FAS & PA final (fake — dev seed)',
    'fas', 'AD9002-25S', v_so_register_non_vat, now() - interval '120 days',
    95, now() - interval '31 days', now() - interval '130 days'
  ) returning id into v_project_c;

  -- Project D: brand new, zero movement yet — exercises last_meaningful_
  -- movement_at IS NULL (falls back to opened_at for the stall clock).
  insert into workflow.projects (
    org_id, client_id, site_id, name, stream,
    percent_complete, last_meaningful_movement_at, opened_at
  ) values (
    v_org_id, v_client_b, v_site_b,
    'Riverside Mall — retail unit fit-out power (fake — dev seed)',
    'other',
    0, null, now() - interval '1 day'
  ) returning id into v_project_d;

  -- A handful of open sub-items, no percent column on any of them
  -- (Brief 001 §4.2 — sub-items never carry a percent).
  insert into workflow.project_items (project_id, title, scheduled_date) values
    (v_project_a, 'Level 3 & 4 rough-in (fake — dev seed)', current_date + 5),
    (v_project_a, 'Head-end rack termination (fake — dev seed)', current_date + 12),
    (v_project_b, 'Chiller plant BMS points list sign-off (fake — dev seed)', current_date + 3),
    (v_project_c, 'PA final witnessing, level 12 (fake — dev seed)', current_date - 4);
end $$;
