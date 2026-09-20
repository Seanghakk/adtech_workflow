-- =============================================================================
-- ADTECH Workflow Tracker — Verification queries for Migration 023
-- Brief: ADTECH_WF_Brief_057_Photo_Evidence_on_Progress_Updates
--
-- STANDING TRAP (carried forward from every prior round's own verify
-- file): run through the SQL editor / a superuser session and you bypass
-- RLS entirely — nothing here proves anything about app-level access,
-- only about the column shape. That's all this migration changes, so
-- that's all this file checks.
-- =============================================================================

-- 1. photo_url exists on workflow.progress_updates, nullable, text.
-- Expect exactly 1 row: photo_url | text | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'workflow'
  and table_name = 'progress_updates'
  and column_name = 'photo_url';

-- 2. No NOT NULL / check constraint was added on photo_url (brief §3 —
-- must stay UI-enforced, not DB-enforced). Expect 0 rows.
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'workflow.progress_updates'::regclass
  and pg_get_constraintdef(oid) ilike '%photo_url%';

-- 3. Existing rows are unaffected — every pre-existing row reads
-- photo_url IS NULL, nothing else on the table changed. Sanity count only
-- (compare against your own sense of row count before/after).
select count(*) as total_rows, count(photo_url) as rows_with_photo
from workflow.progress_updates;
