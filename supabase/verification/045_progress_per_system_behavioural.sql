-- =============================================================================
-- 045 — Progress per system: BEHAVIOURAL proof (Brief 106 §2)
-- =============================================================================
--
-- ROLLBACK-TEST ONLY. This file WRITES. It runs inside one transaction that is
-- ROLLED BACK at the end, so it leaves nothing behind.
--
-- The verify file asserts the catalogue. This one asserts BEHAVIOUR: every
-- rule D096 depends on is exercised by trying to break it and confirming the
-- database refuses. A constraint that exists is not a constraint that bites.
-- =============================================================================

\set ON_ERROR_STOP off

begin;

insert into workflow.projects (id, org_id, client_id, name, stream, pic_id, owner_id, scope_type, status)
select '00000000-0000-4b45-9106-000000000001', p.org_id, p.client_id,
       'Brief 106 behavioural probe', p.stream, p.pic_id, p.owner_id, p.scope_type, p.status
  from workflow.projects p where p.id = '3ee249ff-c0ba-4f64-b25e-bb9c2440faec';

insert into workflow.project_systems (id, project_id, name, cad_code, source) values
 ('00000000-0000-4b45-9106-0000000000a1','00000000-0000-4b45-9106-000000000001','CCTV','CCTV','manual'),
 ('00000000-0000-4b45-9106-0000000000a2','00000000-0000-4b45-9106-000000000001','Car park management','CARP','manual');

-- Two floors to start with. The trigger that extends full coverage is tested
-- later with a THIRD floor, added after coverage exists.
insert into workflow.project_floors (id, project_id, label, sort_order) values
 ('00000000-0000-4b45-9106-0000000000f1','00000000-0000-4b45-9106-000000000001','B1',1),
 ('00000000-0000-4b45-9106-0000000000f2','00000000-0000-4b45-9106-000000000001','L1',2);

-- ---- 1. A cell cannot exist outside coverage --------------------------------
savepoint s1;
insert into workflow.progress_cells (project_system_id, floor_id, stage, sub_stage, sequence)
values ('00000000-0000-4b45-9106-0000000000a1','00000000-0000-4b45-9106-0000000000f1','installation','first_fix',1);
select 'B1 a cell cannot exist outside coverage' as check, 'FAIL — it was allowed' as result;
rollback to savepoint s1;
select 'B1 a cell cannot exist outside coverage' as check, 'PASS (refused above)' as result;

-- ---- 2. Coverage creates the five cells -------------------------------------
insert into workflow.project_system_floors (project_system_id, floor_id, source) values
 ('00000000-0000-4b45-9106-0000000000a1','00000000-0000-4b45-9106-0000000000f1','manual'),
 ('00000000-0000-4b45-9106-0000000000a1','00000000-0000-4b45-9106-0000000000f2','manual'),
 ('00000000-0000-4b45-9106-0000000000a2','00000000-0000-4b45-9106-0000000000f1','manual');

select 'B2 coverage seeds exactly five cells per (system, floor)' as check,
  case when count(*) = 15 then 'PASS — 3 covered pairs x 5'
       else 'FAIL — got ' || count(*)::text end as result
  from workflow.progress_cells c
  join workflow.project_systems ps on ps.id = c.project_system_id
 where ps.project_id = '00000000-0000-4b45-9106-000000000001';

-- The uncovered pair (Car park management x L1) has NO cells. That absence is
-- §11.2's "not applicable" — it is not a stored status.
select 'B3 an uncovered (system, floor) has no cells — "not applicable" is absence' as check,
  case when count(*) = 0 then 'PASS' else 'FAIL — got ' || count(*)::text end as result
  from workflow.progress_cells
 where project_system_id = '00000000-0000-4b45-9106-0000000000a2'
   and floor_id = '00000000-0000-4b45-9106-0000000000f2';

-- ---- 3. Two systems on one floor hold DIFFERENT statuses --------------------
-- This is the whole point of the brief: one floor, two realities.
update workflow.progress_cells set status = 'done'
 where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
   and floor_id = '00000000-0000-4b45-9106-0000000000f1'
   and sub_stage = 'first_fix';

select 'B4 two systems on one floor hold different statuses' as check,
  case when (select status from workflow.progress_cells
              where project_system_id='00000000-0000-4b45-9106-0000000000a1'
                and floor_id='00000000-0000-4b45-9106-0000000000f1' and sub_stage='first_fix') = 'done'
        and (select status from workflow.progress_cells
              where project_system_id='00000000-0000-4b45-9106-0000000000a2'
                and floor_id='00000000-0000-4b45-9106-0000000000f1' and sub_stage='first_fix') = 'not_started'
       then 'PASS — CCTV done, Car park not started, same floor'
       else 'FAIL' end as result;

-- ---- 4. Only three statuses are storable ------------------------------------
savepoint s4;
update workflow.progress_cells set status = 'not_applicable'
 where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
   and floor_id = '00000000-0000-4b45-9106-0000000000f1' and sub_stage = 'second_fix';
select 'B5 "not applicable" cannot be stored as a status' as check, 'FAIL — it was allowed' as result;
rollback to savepoint s4;
select 'B5 "not applicable" cannot be stored as a status' as check, 'PASS (refused above)' as result;

savepoint s4b;
update workflow.progress_cells set status = 'qc_passed'
 where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
   and floor_id = '00000000-0000-4b45-9106-0000000000f1' and sub_stage = 'second_fix';
select 'B6 a derived state (qc_passed) cannot be stored either' as check, 'FAIL — it was allowed' as result;
rollback to savepoint s4b;
select 'B6 a derived state (qc_passed) cannot be stored either' as check, 'PASS (refused above)' as result;

-- ---- 5. Removing coverage keeps the work; restoring it brings it back -------
-- §6.5: "Removing it keeps those records but takes them out of progress;
-- adding B1 back restores them."
create temporary table b106_cell_ids on commit drop as
  select id from workflow.progress_cells
   where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
     and floor_id = '00000000-0000-4b45-9106-0000000000f1';

update workflow.project_system_floors set removed_at = now()
 where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
   and floor_id = '00000000-0000-4b45-9106-0000000000f1';

select 'B7 removing coverage does NOT delete the recorded work' as check,
  case when count(*) = 5 then 'PASS — the five cells survive'
       else 'FAIL — ' || count(*)::text || ' left' end as result
  from workflow.progress_cells
 where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
   and floor_id = '00000000-0000-4b45-9106-0000000000f1';

update workflow.project_system_floors set removed_at = null
 where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
   and floor_id = '00000000-0000-4b45-9106-0000000000f1';

select 'B8 restoring coverage restores the SAME rows, not fresh ones' as check,
  case when (select count(*) from workflow.progress_cells c
              join b106_cell_ids b on b.id = c.id) = 5
        and (select status from workflow.progress_cells
              where project_system_id='00000000-0000-4b45-9106-0000000000a1'
                and floor_id='00000000-0000-4b45-9106-0000000000f1' and sub_stage='first_fix') = 'done'
       then 'PASS — same ids, and "done" still done'
       else 'FAIL' end as result;

-- ---- 6. A new floor joins only the systems that covered every floor ---------
-- CCTV covers both existing floors; Car park management covers one.
insert into workflow.project_floors (id, project_id, label, sort_order)
values ('00000000-0000-4b45-9106-0000000000f3','00000000-0000-4b45-9106-000000000001','L2',3);

select 'B9 a new floor joins the full-coverage system only' as check,
  case when exists (select 1 from workflow.project_system_floors
                     where project_system_id='00000000-0000-4b45-9106-0000000000a1'
                       and floor_id='00000000-0000-4b45-9106-0000000000f3')
        and not exists (select 1 from workflow.project_system_floors
                     where project_system_id='00000000-0000-4b45-9106-0000000000a2'
                       and floor_id='00000000-0000-4b45-9106-0000000000f3')
       then 'PASS — joined CCTV, not Car park management'
       else 'FAIL' end as result;

select 'B10 and its cells were seeded with it' as check,
  case when count(*) = 5 then 'PASS' else 'FAIL — got ' || count(*)::text end as result
  from workflow.progress_cells
 where project_system_id = '00000000-0000-4b45-9106-0000000000a1'
   and floor_id = '00000000-0000-4b45-9106-0000000000f3';

-- ---- 7. The completion figure counts covered pairs, not floors --------------
-- CCTV: B1 (1 of 5 done = 20), L1 (0), L2 (0). Car park: B1 (0).
-- Four buckets, so (20 + 0 + 0 + 0) / 4 = 5.
select 'B11 the rollup buckets COVERED PAIRS, not floors' as check,
  case when workflow.compute_project_rollup_percent('00000000-0000-4b45-9106-000000000001') = 5
       then 'PASS — 5%, being (20+0+0+0)/4 over four covered pairs'
       else 'FAIL — got ' ||
            workflow.compute_project_rollup_percent('00000000-0000-4b45-9106-000000000001')::text end as result;

-- Uncovered pairs must not drag the figure down: Car park x L1 and x L2 are
-- outside coverage and contribute nothing. Were floors still the bucket, the
-- same data over 3 floors would read differently.
select 'B12 an uncovered pair contributes nothing to the figure' as check,
  case when (select count(*) from workflow.project_system_floors psf
              join workflow.project_systems ps on ps.id = psf.project_system_id
             where ps.project_id = '00000000-0000-4b45-9106-000000000001'
               and psf.removed_at is null) = 4
       then 'PASS — 4 covered pairs of a possible 6'
       else 'FAIL' end as result;

-- ---- 8. A QC inspection hangs off a cell, and material stays project-level --
savepoint s8;
insert into workflow.qc_inspections (project_id, inspection_type, progress_cell_id, status)
values ('00000000-0000-4b45-9106-000000000001','installation',null,'pass');
select 'B13 an installation inspection must name a cell' as check, 'FAIL — null was allowed' as result;
rollback to savepoint s8;
select 'B13 an installation inspection must name a cell' as check, 'PASS (refused above)' as result;

insert into workflow.qc_inspections (project_id, inspection_type, progress_cell_id, status)
select '00000000-0000-4b45-9106-000000000001','installation', id, 'pass'
  from workflow.progress_cells
 where project_system_id='00000000-0000-4b45-9106-0000000000a1'
   and floor_id='00000000-0000-4b45-9106-0000000000f1' and sub_stage='first_fix';
select 'B14 an installation inspection against a cell is accepted' as check, 'PASS' as result;

insert into workflow.qc_inspections (project_id, inspection_type, progress_cell_id, status)
values ('00000000-0000-4b45-9106-000000000001','material',null,'pass');
select 'B15 material inspection is unchanged — project-level, no cell' as check, 'PASS' as result;

savepoint s8b;
insert into workflow.qc_inspections (project_id, inspection_type, progress_cell_id, status)
select '00000000-0000-4b45-9106-000000000001','material', id, 'pass'
  from workflow.progress_cells limit 1;
select 'B16 a material inspection may NOT name a cell' as check, 'FAIL — it was allowed' as result;
rollback to savepoint s8b;
select 'B16 a material inspection may NOT name a cell' as check, 'PASS (refused above)' as result;

-- ---- 9. The old table is gone ----------------------------------------------
select 'B17 floor_sub_stages no longer exists' as check,
  case when to_regclass('workflow.floor_sub_stages') is null then 'PASS' else 'FAIL' end as result;

rollback;

select 'B18 the probe left nothing behind' as check,
  case when not exists (select 1 from workflow.projects where id='00000000-0000-4b45-9106-000000000001')
       then 'PASS' else 'FAIL' end as result;
