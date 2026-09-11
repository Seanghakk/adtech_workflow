-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 004
-- Brief: ADTECH_WF_Fable_Brief_001_Data_Model_And_Theme_6 §4.5
--
-- Run each block by hand in the Supabase SQL editor AFTER applying
-- 004_so_registers.sql. Every query inspects live catalog/table state,
-- never the migration text — same discipline as every other verification
-- file in this project.
-- =============================================================================

-- 1. workflow.so_registers exists, RLS is enabled, and both seed rows are
--    present.
-- Expect: relrowsecurity = true.
select relrowsecurity
from pg_class
where oid = 'workflow.so_registers'::regclass;

-- Expect exactly 2 rows: non_vat (sort_order 10), vat (sort_order 20).
select code, label_en, sort_order, is_active
from workflow.so_registers
order by sort_order;


-- 2. so_registers_select policy exists, and it is the ONLY policy on the
--    table (no insert/update policy — rows are entered by hand as owner,
--    same convention as workflow.teams).
-- Expect exactly one row: so_registers_select | SELECT.
select policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename = 'so_registers';


-- 3. projects.so_register_id exists and is a nullable FK to so_registers.
-- Expect one row: so_register_id | uuid | YES (nullable).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'projects' and column_name = 'so_register_id';

-- Expect one row naming the FK to workflow.so_registers(id).
select
  tc.constraint_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
from information_schema.table_constraints tc
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
where tc.table_schema = 'workflow' and tc.table_name = 'projects'
  and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'so_register_id';


-- 4. Both new CHECK constraints exist, with the expected definitions.
-- Expect 2 rows: projects_so_register_pairing_check, projects_so_number_format_check.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.projects'::regclass
  and conname in ('projects_so_register_pairing_check', 'projects_so_number_format_check');


-- 5. THE PAIR-UNIQUE INDEX, AND THE NULL-COLLISION GUARANTEE — the two
--    things the brief says to confirm explicitly, not merely assert.
--
-- 5a. projects_org_so_number_key (migration 001) is gone; the new index
--     exists on (org_id, so_number, so_register_id).
-- Expect one row: projects_org_so_number_register_key, indexdef mentioning
-- all three columns and a WHERE clause.
select indexname, indexdef
from pg_indexes
where schemaname = 'workflow' and tablename = 'projects'
  and indexname like 'projects_org_so_number%';

-- 5b. NULL so_number stays collision-free: this INSERT/ROLLBACK proves two
-- rows with so_number IS NULL do not violate the new unique index. Run
-- inside a transaction that is rolled back, not committed — this writes
-- nothing real.
begin;
insert into workflow.projects (org_id, client_id, name, stream)
select '00000000-0000-0000-0000-000000000001', c.id, 'VERIFY — throwaway A (rollback me)', 'other'
from workflow.clients c limit 1;
insert into workflow.projects (org_id, client_id, name, stream)
select '00000000-0000-0000-0000-000000000001', c.id, 'VERIFY — throwaway B (rollback me)', 'other'
from workflow.clients c limit 1;
-- Expect this to succeed (2 rows, no unique-violation error) — that success
-- IS the proof. Then:
rollback;


-- 6. GRANTS — so_registers inherited migration 002's default privileges
--    (no explicit grant statement exists in migration 004 itself).
-- Expect: anon SELECT, authenticated SELECT/INSERT/UPDATE, no DELETE for
-- anyone.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'workflow' and table_name = 'so_registers'
order by grantee, privilege_type;


-- 7. The two live seed_dev.sql rows carrying a so_number (AD9001-26S,
--    AD9002-25S) were backfilled into the non_vat register (neither
--    number carries a V before the year).
-- Expect 2 rows, both register_code = 'non_vat'.
select p.so_number, r.code as register_code
from workflow.projects p
join workflow.so_registers r on r.id = p.so_register_id
where p.so_number is not null
order by p.so_number;

-- And the pairing check's converse: zero rows where one of the pair is set
-- without the other — should already be structurally impossible once
-- block 4 confirms the CHECK exists, but confirmed directly here too.
-- Expect ZERO rows.
select id, so_number, so_register_id
from workflow.projects
where (so_number is null) <> (so_register_id is null);


-- 8. No object from this migration was created outside `workflow`.
-- Expect ZERO rows.
select n.nspname as schema_name, c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'so_registers' and n.nspname <> 'workflow';
