-- =============================================================================
-- ADTECH Workflow Tracker — Rollback for Migration 001
-- Brief: ADTECH_WF_Brief_001_Project_Scaffold_And_Schema
--
-- Reverses 001_init_workflow_schema.sql exactly. Drops are listed in
-- explicit dependency order (children before parents) for auditability,
-- even though `drop schema workflow cascade` alone would do the same
-- thing in one statement — the explicit form here is what actually gets
-- run and verified, per the brief's instruction not to let this go
-- untested the way it did on the CMMS.
--
-- Does not touch `public` — nothing in this schema ever did.
-- =============================================================================

drop trigger if exists progress_updates_bump_movement on workflow.progress_updates;
drop function if exists workflow.bump_last_meaningful_movement();

drop table if exists workflow.dependency_links;
drop table if exists workflow.procurement_lines;
drop table if exists workflow.catalogue_events;
drop table if exists workflow.catalogue_items;
drop table if exists workflow.progress_updates;
drop table if exists workflow.reporting_periods;
drop table if exists workflow.reason_codes;
drop table if exists workflow.request_handoffs;
drop table if exists workflow.requests;
drop table if exists workflow.project_items;
drop table if exists workflow.variations;
drop table if exists workflow.projects;
drop table if exists workflow.sites;
drop table if exists workflow.clients;
drop table if exists workflow.members;
drop table if exists workflow.orgs;

drop function if exists workflow.current_team();
drop function if exists workflow.is_manager();
drop function if exists workflow.is_member();

-- Fails loudly if anything above was missed (schema won't be empty) —
-- that is the point, don't change this to `cascade`.
drop schema if exists workflow;
