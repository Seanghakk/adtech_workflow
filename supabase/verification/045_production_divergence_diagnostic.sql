-- =============================================================================
-- 045 — why it failed on production. READ-ONLY DIAGNOSTIC.
-- =============================================================================
--
-- SAFE ON PRODUCTION. Every statement is a SELECT. It writes nothing, locks
-- nothing, and changes nothing. Run it on PRODUCTION (045 rolled back, so the
-- pre-045 schema — floor_sub_stages and qc_inspections.floor_sub_stage_id —
-- is still there and this file depends on that).
--
-- No \pset. The result table is the last statement.
--
-- WHAT WE ALREADY KNOW WITHOUT RUNNING THIS
--   045 adds progress_cell_id as a NEW column (null on every existing row),
--   then adds a constraint requiring it to be NOT NULL for inspection_type
--   'installation' and 'commissioning'. So every pre-existing row of those
--   two types violates it. inspection_type is constrained to exactly
--   material | installation | commissioning, so that IS the violating set.
--
--   It also cannot be fixed by mapping inside 045: nothing in 045 creates
--   coverage, so project_system_floors and progress_cells are both EMPTY
--   while it runs. There is no cell for an inspection to point at.
--
-- WHAT THIS FILE IS ACTUALLY FOR
--   Deciding what those rows are and what should happen to them. Three
--   questions, in order of how much they change the answer:
--     A. How many, and are they real records or old test data? (rows 1–6)
--     B. Could they even be mapped in principle — is the target system
--        unambiguous? (rows 7–11)
--     C. What else changes on production that rollback-test never showed?
--        (rows 12–15)
-- =============================================================================

with

-- The exact set 045's constraint would reject.
violating as (
  select qi.id, qi.project_id, qi.inspection_type, qi.status,
         qi.floor_sub_stage_id,
         coalesce(qi.inspected_at, qi.created_at) as happened_at
    from workflow.qc_inspections qi
   where qi.inspection_type in ('installation', 'commissioning')
),

-- For each violating row: which project, and how many systems that project
-- has. One system = a mapping is at least conceivable. More than one = the
-- old row does not record which system was inspected, and nothing can
-- recover it, because that is the information D096 adds.
mapping as (
  select v.id,
         v.project_id,
         (select count(*) from workflow.project_systems ps
           where ps.project_id = v.project_id) as systems_in_project
    from violating v
),

facts as (
  -- ---- A. how many, and what are they ------------------------------------
  select 1 as n, 'A1 · qc_inspections rows in total' as question,
         (select count(*)::text from workflow.qc_inspections) as answer
  union all select 2, 'A2 · VIOLATING rows (installation + commissioning)',
         (select count(*)::text from violating)
  union all select 3, 'A3 · of those, installation',
         (select count(*)::text from violating where inspection_type = 'installation')
  union all select 4, 'A4 · of those, commissioning',
         (select count(*)::text from violating where inspection_type = 'commissioning')
  union all select 5, 'A5 · material rows (these are FINE, unaffected)',
         (select count(*)::text from workflow.qc_inspections where inspection_type = 'material')
  -- Real QC history or leftover test data? Dates are the cheapest tell, and
  -- this asks nothing about who or what was written in the notes.
  union all select 6, 'A6 · violating rows: earliest → latest, and distinct days',
         (select coalesce(
                   to_char(min(happened_at), 'YYYY-MM-DD') || ' → ' ||
                   to_char(max(happened_at), 'YYYY-MM-DD') || '  (' ||
                   count(distinct happened_at::date)::text || ' distinct days)',
                   'none')
            from violating)

  -- ---- B. could they be mapped at all ------------------------------------
  union all select 7, 'B1 · distinct projects holding violating rows',
         (select count(distinct project_id)::text from violating)
  union all select 8, 'B2 · violating rows whose project has ZERO systems',
         (select count(*)::text from mapping where systems_in_project = 0)
  union all select 9, 'B3 · violating rows whose project has EXACTLY ONE system',
         (select count(*)::text from mapping where systems_in_project = 1)
  union all select 10, 'B4 · violating rows whose project has MORE THAN ONE system',
         (select count(*)::text from mapping where systems_in_project > 1)
  -- If the old link is already broken, even the one-system case cannot be
  -- reconstructed from the sub-stage side.
  union all select 11, 'B5 · violating rows whose floor_sub_stage_id no longer resolves',
         (select count(*)::text from violating v
           where v.floor_sub_stage_id is null
              or not exists (select 1 from workflow.floor_sub_stages fs
                              where fs.id = v.floor_sub_stage_id))

  -- ---- C. what else does 045 do to production that rbt never showed ------
  -- 045 creates coverage for NOBODY. These two say how much of the app goes
  -- blank on production the moment it lands, until coverage is imported or
  -- entered by hand.
  union all select 12, 'C1 · projects with at least one floor',
         (select count(distinct project_id)::text from workflow.project_floors)
  union all select 13, 'C2 · projects with at least one system',
         (select count(distinct project_id)::text from workflow.project_systems)
  union all select 14, 'C3 · floor_sub_stages rows that 045 DROPS outright',
         (select count(*)::text from workflow.floor_sub_stages)
  union all select 15, 'C4 · of those, ones carrying work (not not_started)',
         (select count(*)::text from workflow.floor_sub_stages
           where status <> 'not_started')
)

select n as "#", question, answer from facts order by n;
