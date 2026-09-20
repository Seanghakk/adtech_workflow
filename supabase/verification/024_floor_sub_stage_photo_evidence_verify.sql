-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 024
-- Brief: ADTECH_WF_Brief_059_Photo_Evidence_On_Floor_SubStage_Completion
--
-- STANDING TRAP (carried forward from migration 023's own verify file): run
-- through a superuser session and you bypass RLS entirely — nothing here
-- proves anything about app-level access, only about the column shape.
-- =============================================================================

-- 1. photo_url exists on workflow.floor_sub_stages, nullable, text.
-- Expect exactly 1 row: photo_url | text | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow'
  and table_name = 'floor_sub_stages'
  and column_name = 'photo_url';

-- 2. No NOT NULL / check constraint was added on photo_url (brief §3 —
-- must stay UI/API-enforced, not DB-enforced). Expect 0 rows.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.floor_sub_stages'::regclass
  and pg_get_constraintdef(oid) ilike '%photo_url%';

-- 3. Migration 022's stage-conditional write policies are untouched by
-- this migration — still present, still named floor_sub_stages_insert /
-- floor_sub_stages_update. Expect 2 rows.
select policyname, cmd
from pg_policies
where schemaname = 'workflow'
  and tablename = 'floor_sub_stages'
  and policyname in ('floor_sub_stages_insert', 'floor_sub_stages_update');

-- 4. Existing rows are unaffected — every pre-existing row reads
-- photo_url IS NULL. Sanity count only.
select count(*) as total_rows, count(photo_url) as rows_with_photo
from workflow.floor_sub_stages;
