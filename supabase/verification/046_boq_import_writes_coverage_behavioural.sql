-- =============================================================================
-- 046 — BOQ import coverage: BEHAVIOURAL proof (Brief 106 §2)
-- ROLLBACK-TEST ONLY. Writes, then rolls the whole transaction back.
-- =============================================================================

\set ON_ERROR_STOP off
begin;

insert into workflow.projects (id, org_id, client_id, name, stream, pic_id, owner_id, scope_type, status)
select '00000000-0000-4b46-9106-000000000001', p.org_id, p.client_id,
       'Brief 106 import-coverage probe', p.stream, p.pic_id, p.owner_id, p.scope_type, p.status
  from workflow.projects p where p.id = '3ee249ff-c0ba-4f64-b25e-bb9c2440faec';

insert into workflow.project_floors (id, project_id, label, sort_order) values
 ('00000000-0000-4b46-9106-0000000000f1','00000000-0000-4b46-9106-000000000001','B1',1),
 ('00000000-0000-4b46-9106-0000000000f2','00000000-0000-4b46-9106-000000000001','L1',2);

-- Act as the PIC, since creating systems is PIC-gated.
set local role postgres;

-- ---- 1. A first import proposes coverage -----------------------------------
select 'C1 import writes coverage for the floors the file names' as check,
  case when (workflow.commit_boq_import(
         '00000000-0000-4b46-9106-000000000001','shop_drawing','[]'::jsonb,'[]'::jsonb,
         '[{"name":"CCTV","cadCode":"CCTV","floors":[{"floorLabel":"B1","towerLabel":null},{"floorLabel":"L1","towerLabel":null}]}]'::jsonb
       ))->>'coverageAdded' = '2'
       then 'PASS — 2 covered pairs' else 'FAIL' end as result;

select 'C2 and the cells were seeded by 045 behind it' as check,
  case when count(*) = 10 then 'PASS — 2 floors x 5 sub-stages'
       else 'FAIL — got ' || count(*)::text end as result
  from workflow.progress_cells c
  join workflow.project_systems ps on ps.id = c.project_system_id
 where ps.project_id = '00000000-0000-4b46-9106-000000000001';

-- ---- 2. A partial re-import NEVER narrows the system ------------------------
-- Record work on B1 first, so the stakes are real.
update workflow.progress_cells set status = 'done'
 where floor_id = '00000000-0000-4b46-9106-0000000000f1' and sub_stage = 'first_fix';

select 'C3 a re-import naming only L1 does not remove B1' as check,
  case when (workflow.commit_boq_import(
         '00000000-0000-4b46-9106-000000000001','shop_drawing','[]'::jsonb,'[]'::jsonb,
         '[{"name":"CCTV","cadCode":"CCTV","floors":[{"floorLabel":"L1","towerLabel":null}]}]'::jsonb
       )) is not null
        and exists (
          select 1 from workflow.project_system_floors psf
            join workflow.project_systems ps on ps.id = psf.project_system_id
           where ps.project_id = '00000000-0000-4b46-9106-000000000001'
             and psf.floor_id = '00000000-0000-4b46-9106-0000000000f1'
             and psf.removed_at is null)
       then 'PASS — B1 kept' else 'FAIL — B1 was removed' end as result;

select 'C4 and the work recorded on B1 survived' as check,
  case when (select status from workflow.progress_cells
              where floor_id='00000000-0000-4b46-9106-0000000000f1' and sub_stage='first_fix') = 'done'
       then 'PASS' else 'FAIL' end as result;

-- ---- 3. A hand-removed floor is REVIVED, not duplicated --------------------
update workflow.project_system_floors set removed_at = now()
 where floor_id = '00000000-0000-4b46-9106-0000000000f1';

select 'C5 an import naming a removed floor revives it' as check,
  case when (workflow.commit_boq_import(
         '00000000-0000-4b46-9106-000000000001','shop_drawing','[]'::jsonb,'[]'::jsonb,
         '[{"name":"CCTV","cadCode":"CCTV","floors":[{"floorLabel":"B1","towerLabel":null}]}]'::jsonb
       ))->>'coverageAdded' = '1'
        and (select count(*) from workflow.project_system_floors
              where floor_id='00000000-0000-4b46-9106-0000000000f1') = 1
       then 'PASS — revived, still one row' else 'FAIL' end as result;

-- ---- 4. Other tiers propose no coverage ------------------------------------
-- The key is reported as 0 rather than omitted: a contract import genuinely
-- added no coverage, and saying "0" is more useful to a caller than a missing
-- key it has to interpret. What matters is that it wrote NONE even though the
-- payload named a floor.
select 'C6 the contract tier proposes no coverage even when the payload names floors' as check,
  case when (workflow.commit_boq_import(
         '00000000-0000-4b46-9106-000000000001','contract','[]'::jsonb,'[]'::jsonb,
         '[{"name":"CCTV","floors":[{"floorLabel":"L1","towerLabel":null}]}]'::jsonb
       ))->>'coverageAdded' = '0'
       then 'PASS — 0 on a non-shop-drawing tier' else 'FAIL' end as result;

-- ---- 5. A floor the file names that does not exist is skipped --------------
select 'C7 a floor label with no matching floor is skipped, not created' as check,
  case when (workflow.commit_boq_import(
         '00000000-0000-4b46-9106-000000000001','shop_drawing','[]'::jsonb,'[]'::jsonb,
         '[{"name":"CCTV","floors":[{"floorLabel":"L99","towerLabel":null}]}]'::jsonb
       ))->>'coverageAdded' = '0'
        and not exists (select 1 from workflow.project_floors
                         where project_id='00000000-0000-4b46-9106-000000000001' and label='L99')
       then 'PASS — no coverage, and no floor invented' else 'FAIL' end as result;

rollback;

select 'C8 the probe left nothing behind' as check,
  case when not exists (select 1 from workflow.projects where id='00000000-0000-4b46-9106-000000000001')
       then 'PASS' else 'FAIL' end as result;
