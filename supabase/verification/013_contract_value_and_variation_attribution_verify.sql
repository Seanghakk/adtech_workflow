-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 013
-- Brief: ADTECH_WF_Brief_020_Contract_Value_And_Variation_Attribution §2/§3
--
-- Run block 0 BEFORE applying (per §1 of the brief — it decides which
-- branch the migration's own DO block will take for raised_by). Run every
-- other block AFTER applying, and after having run the rollback against
-- the rollback-test project first (adtech-workflow-rollback-test, carrying
-- migrations 001-012 plus the stub public.user_profiles — see this
-- migration's own header for why the stub is sufficient for these FKs).
--
-- STANDING TRAP (carried forward from Briefs 009/010/011/012 §0): these
-- queries go through pg_policies/information_schema, never raw catalog
-- tricks that only work as table owner — but this migration adds NO new
-- policy at all (§4 of the brief), so there is nothing here that needs a
-- real signed-in account to prove; every block below is a plain schema
-- check.
-- =============================================================================

-- 0. PRE-FLIGHT — run this BEFORE applying, not after (brief §1). Confirms
--    which branch the migration's raised_by DO block will take, so the
--    outcome in block 2 below is expected, not a surprise.
-- No expected row count — read the numbers by eye. 0 rows on the first
-- query means raised_by will be set NOT NULL; any other count means it
-- will be left nullable (see the migration's own header/DO block).
select count(*) as variation_count from workflow.variations;
select count(*) as projects_with_so_count from workflow.projects where so_number is not null;


-- 1. workflow.projects.contract_value exists, nullable numeric(14, 2).
-- Expect one row: contract_value | numeric | YES | precision 14, scale 2.
select column_name, data_type, is_nullable, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'workflow' and table_name = 'projects' and column_name = 'contract_value';

-- Cross-check against workflow.variations.committed_amount — expect the
-- SAME precision/scale on both rows, confirming the "no cast needed" claim.
select table_name, column_name, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'workflow'
  and (
    (table_name = 'projects' and column_name = 'contract_value')
    or (table_name = 'variations' and column_name = 'committed_amount')
  );


-- 2. workflow.variations gains raised_by, approved_by, request_id with the
--    right nullability. Expect 3 rows. raised_by's is_nullable should read
--    'NO' if block 0's variation_count was 0, or 'YES' otherwise — this is
--    the DO block's decision made visible in the catalog, not just in the
--    migration's own RAISE NOTICE output at apply time.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow' and table_name = 'variations'
  and column_name in ('raised_by', 'approved_by', 'request_id')
order by column_name;


-- 3. All three new FKs point where the migration's header says they do.
-- Expect 3 rows: raised_by -> public.user_profiles(id), approved_by ->
-- public.user_profiles(id), request_id -> workflow.requests(id).
select
  kcu.column_name,
  ccu.table_schema as foreign_table_schema,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema
where tc.table_schema = 'workflow' and tc.table_name = 'variations'
  and tc.constraint_type = 'FOREIGN KEY'
  and kcu.column_name in ('raised_by', 'approved_by', 'request_id')
order by kcu.column_name;

-- Expect: raised_by and approved_by both show delete_rule = 'RESTRICT'.
-- request_id shows delete_rule = 'NO ACTION' (no explicit clause was
-- written — matches request_handoffs.request_id's own precedent exactly;
-- confirm that one reads the same way for the comparison):
select
  kcu.column_name, rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.constraint_schema
where tc.table_schema = 'workflow' and tc.table_name = 'request_handoffs'
  and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'request_id';


-- 4. NO new grant and NO new policy were added by this migration (its own
--    header claims both existing table-level grants already cover new
--    columns, and no write path exists yet to police). Confirm the policy
--    LIST on both tables is unchanged in COUNT from before this migration
--    — same policies as migration 004/012 left them.
-- Expect: projects has exactly 1 policy (projects_select); variations has
-- exactly 1 policy (variations_select). Neither should show anything new.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'workflow' and tablename in ('projects', 'variations')
order by tablename, policyname;


-- 5. No object was created outside `workflow`, and no CMMS/`public` object
--    was touched — this migration's only cross-schema reference is the
--    READ-ONLY FK to public.user_profiles(id), same pattern as every other
--    person-reference column in this schema.
-- Expect ZERO rows.
select n.nspname as schema_name, c.relname
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relname in ('projects', 'variations') and n.nspname = 'public';
