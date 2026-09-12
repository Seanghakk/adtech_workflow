-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 007
-- Brief: ADTECH_CrossApp_Brief_Shared_Clients_Schema_And_Progress_Visibility
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 007_grant_cmms_service_role_clients_read.sql. Every query inspects live
-- catalog/role state, never the migration text — same discipline as
-- 002_grants_and_api_exposure_verify.sql.
-- =============================================================================

-- 1. service_role holds USAGE on schema workflow.
-- Expect one row, true.
select has_schema_privilege('service_role', 'workflow', 'USAGE') as service_role_has_usage;


-- 2. service_role holds SELECT on workflow.clients specifically — and
--    NOTHING ELSE in this schema (not client_owners, not projects, not
--    any other table). This is the "narrowest working grant" guarantee
--    this migration exists to make durable, not just true today.
-- Expect exactly one row: workflow | clients | SELECT.
select table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow' and grantee = 'service_role'
order by table_name, privilege_type;


-- 3. anon and authenticated's own grants (migration 002) are untouched —
--    this migration adds a role, it does not change either existing one.
-- Expect the same counts migration 002's own verify block 3 documents
-- (19 tables each for anon-SELECT / authenticated-SELECT/INSERT/UPDATE,
-- plus workflow.clients' own share of that — this just confirms the
-- totals didn't shrink or gain an unexpected DELETE).
select grantee, privilege_type, count(*) as table_count
from information_schema.role_table_grants
where table_schema = 'workflow' and grantee in ('anon', 'authenticated')
group by grantee, privilege_type
order by grantee, privilege_type;


-- 4. End-to-end proof, not just a catalog check: a live read against
--    workflow.clients using the CMMS's own service-role key succeeds.
-- This can only be run from the CMMS side (it holds that key), not from
-- this SQL editor — recorded here as the authoritative confirmation
-- step, cross-referenced to where it actually ran: the CMMS's own
-- ADTECH_CrossApp_Result_Shared_Clients_Schema_Stage2_GoAhead doc.
