-- =============================================================================
-- 048 — BEHAVIOURAL proof. ROLLBACK-TEST ONLY; rolls back at the end.
-- Proves the two rules migration 045 lost actually BITE again.
-- =============================================================================

\set ON_ERROR_STOP off
begin;

insert into workflow.projects (id, org_id, client_id, name, stream, pic_id, owner_id, scope_type, status)
select '00000000-0000-4b48-9106-000000000001', p.org_id, p.client_id,
       'Brief 106b 048 probe', p.stream, p.pic_id, p.owner_id, p.scope_type, p.status
  from workflow.projects p where p.id='3ee249ff-c0ba-4f64-b25e-bb9c2440faec';
insert into workflow.project_systems (id, project_id, name, cad_code, source)
values ('00000000-0000-4b48-9106-0000000000a1','00000000-0000-4b48-9106-000000000001','CCTV','CCTV','manual');
insert into workflow.project_floors (id, project_id, label, sort_order)
values ('00000000-0000-4b48-9106-0000000000f1','00000000-0000-4b48-9106-000000000001','B1',1);
insert into workflow.project_system_floors (project_system_id, floor_id, source)
values ('00000000-0000-4b48-9106-0000000000a1','00000000-0000-4b48-9106-0000000000f1','manual');

-- ---- The shape check --------------------------------------------------------
savepoint s1;
insert into workflow.progress_cells (project_system_id, floor_id, stage, sub_stage, sequence)
values ('00000000-0000-4b48-9106-0000000000a1','00000000-0000-4b48-9106-0000000000f1','installation','commissioning',9);
select 'D1 an installation stage cannot carry a tnc sub-stage' as check, 'FAIL — allowed' as result;
rollback to savepoint s1;
select 'D1 an installation stage cannot carry a tnc sub-stage' as check, 'PASS (refused above)' as result;

savepoint s2;
insert into workflow.progress_cells (project_system_id, floor_id, stage, sub_stage, sequence)
values ('00000000-0000-4b48-9106-0000000000a1','00000000-0000-4b48-9106-0000000000f1','installation','fourth_fix',9);
select 'D2 an invented sub-stage is refused' as check, 'FAIL — allowed' as result;
rollback to savepoint s2;
select 'D2 an invented sub-stage is refused' as check, 'PASS (refused above)' as result;

select 'D3 the five real pairs are all still accepted' as check,
  case when (select count(*) from workflow.progress_cells
              where project_system_id='00000000-0000-4b48-9106-0000000000a1') = 5
       then 'PASS — seeded by 045 and accepted by the restored check' else 'FAIL' end as result;

-- ---- The write policy, as a real member ------------------------------------
-- The policies key on workflow.current_team(), which reads the signed-in
-- member. Asserted on the CATALOGUE here rather than by faking a JWT: what
-- 045 got wrong was the policy TEXT, and that is what this checks.
select 'D4 the write policies are stage-keyed again' as check,
  case when (select count(*) from pg_policy
              where polrelid='workflow.progress_cells'::regclass
                and polname in ('progress_cells_insert','progress_cells_update')
                and coalesce(pg_get_expr(polwithcheck,polrelid),'') like '%project_management%'
                and coalesce(pg_get_expr(polwithcheck,polrelid),'') like '%tnc%') = 2
       then 'PASS' else 'FAIL' end as result;

select 'D5 NOTHING was loosened — no superadmin or PIC bypass on a write' as check,
  case when not exists (
        select 1 from pg_policy
         where polrelid='workflow.progress_cells'::regclass
           and polname in ('progress_cells_insert','progress_cells_update')
           and (coalesce(pg_get_expr(polqual,polrelid),'')||coalesce(pg_get_expr(polwithcheck,polrelid),'')) ilike any (array['%superadmin%','%pic_id%']))
       then 'PASS — matches floor_sub_stages exactly' else 'FAIL — still broader than before' end as result;

select 'D6 there is still NO delete policy, as before' as check,
  case when not exists (select 1 from pg_policy
                         where polrelid='workflow.progress_cells'::regclass and polcmd = 'd')
       then 'PASS — cells go by removing coverage, which is PIC-gated' else 'FAIL' end as result;

rollback;

select 'D7 the probe left nothing behind' as check,
  case when not exists (select 1 from workflow.projects where id='00000000-0000-4b48-9106-000000000001')
       then 'PASS' else 'FAIL' end as result;
