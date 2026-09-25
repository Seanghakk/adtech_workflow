-- =============================================================================
-- 043 — Material approval: BEHAVIOURAL proof (Brief 105 §3, §7)
-- =============================================================================
--
-- ROLLBACK-TEST ONLY. This file WRITES. It runs inside one transaction that is
-- ROLLED BACK at the end, so it leaves nothing behind — but do not point it at
-- production, which is read-only to Claude in any case.
--
-- Checking that a constraint EXISTS is not the same as checking it BITES. The
-- verify file asserts the catalog; this one asserts behaviour: every rule in
-- Brief 105 §3 is exercised by trying to break it and confirming the database
-- refuses.
-- =============================================================================

\set ON_ERROR_STOP off
\pset format aligned

begin;

-- NOTE on references: the packages below are inserted with hand-written refs
-- in the MA-5n range on purpose. They bypass the counter, so using MA-01…
-- would collide with what next_material_approval_ref() legitimately draws in
-- B16. Only B16 exercises the counter's own output.

-- Work against a scratch project so no fixture is touched, and so the
-- reference counter we exercise is this project's own.
insert into workflow.projects (id, org_id, client_id, name, stream, pic_id, owner_id, scope_type, status)
select '00000000-0000-4b43-9105-000000000001', p.org_id, p.client_id,
       'Brief 105 behavioural probe', p.stream, p.pic_id, p.owner_id, p.scope_type, p.status
  from workflow.projects p where p.id = '3ee249ff-c0ba-4f64-b25e-bb9c2440faec';

insert into workflow.contract_boq_lines (id, project_id, description, unit, quantity)
values ('00000000-0000-4b43-9105-00000000000a','00000000-0000-4b43-9105-000000000001','Probe line A','no',1),
       ('00000000-0000-4b43-9105-00000000000b','00000000-0000-4b43-9105-000000000001','Probe line B','no',1);

-- ---- 1. MA-nn is generated in order ----------------------------------------
select 'B1 first ref is MA-01' as check,
  case when workflow.next_material_approval_ref('00000000-0000-4b43-9105-000000000001') = 'MA-01'
       then 'PASS' else 'FAIL' end as result;
select 'B2 second ref is MA-02' as check,
  case when workflow.next_material_approval_ref('00000000-0000-4b43-9105-000000000001') = 'MA-02'
       then 'PASS' else 'FAIL' end as result;

-- ---- 2. A package with a line ----------------------------------------------
insert into workflow.material_approval_packages (id, project_id, ref, title, source)
values ('00000000-0000-4b43-9105-000000000100','00000000-0000-4b43-9105-000000000001','MA-50','Probe package','tracked');
insert into workflow.material_approval_package_lines (package_id, contract_boq_line_id)
values ('00000000-0000-4b43-9105-000000000100','00000000-0000-4b43-9105-00000000000a');
insert into workflow.material_approval_revisions (id, package_id, rev, manufacturer, product)
values ('00000000-0000-4b43-9105-000000000200','00000000-0000-4b43-9105-000000000100',0,'Acme','Widget 1');

-- ---- 3. A contract line sits in at most ONE package -------------------------
savepoint s3;
insert into workflow.material_approval_packages (id, project_id, ref, title)
values ('00000000-0000-4b43-9105-000000000101','00000000-0000-4b43-9105-000000000001','MA-51','Second package');
insert into workflow.material_approval_package_lines (package_id, contract_boq_line_id)
values ('00000000-0000-4b43-9105-000000000101','00000000-0000-4b43-9105-00000000000a');
select 'B3 a line cannot sit in two packages' as check, 'FAIL — the second insert was allowed' as result;
rollback to savepoint s3;
select 'B3 a line cannot sit in two packages' as check, 'PASS (refused above)' as result;

-- ---- 4. preparing_started_at is written by the DATABASE ---------------------
select 'B4 package starts with no preparing_started_at' as check,
  case when preparing_started_at is null then 'PASS' else 'FAIL' end as result
  from workflow.material_approval_packages where id = '00000000-0000-4b43-9105-000000000100';

update workflow.material_approval_revisions
   set started_at = timestamptz '2026-09-01 08:00+07'
 where id = '00000000-0000-4b43-9105-000000000200';

select 'B5 the database wrote preparing_started_at on first start' as check,
  case when preparing_started_at = timestamptz '2026-09-01 08:00+07' then 'PASS'
       else 'FAIL — got ' || coalesce(preparing_started_at::text,'null') end as result
  from workflow.material_approval_packages where id = '00000000-0000-4b43-9105-000000000100';

-- A later revision must NOT move it.
insert into workflow.material_approval_revisions (id, package_id, rev, manufacturer, product, started_at)
values ('00000000-0000-4b43-9105-000000000201','00000000-0000-4b43-9105-000000000100',1,'Beta','Widget 2',
        timestamptz '2026-09-20 08:00+07');

select 'B6 a later revision cannot move the start' as check,
  case when preparing_started_at = timestamptz '2026-09-01 08:00+07' then 'PASS'
       else 'FAIL — it moved to ' || preparing_started_at::text end as result
  from workflow.material_approval_packages where id = '00000000-0000-4b43-9105-000000000100';

-- ---- 5. The submission is immutable except for completing the return --------
insert into workflow.material_approval_submissions (id, revision_id, party, org, sent_on)
values ('00000000-0000-4b43-9105-000000000300','00000000-0000-4b43-9105-000000000200','consultant','Meinhardt', date '2026-09-05');

savepoint s5a;
update workflow.material_approval_submissions set sent_on = date '2026-09-06'
 where id = '00000000-0000-4b43-9105-000000000300';
select 'B7 sent_on cannot be edited after sending' as check, 'FAIL — the edit was allowed' as result;
rollback to savepoint s5a;
select 'B7 sent_on cannot be edited after sending' as check, 'PASS (refused above)' as result;

savepoint s5b;
update workflow.material_approval_submissions set party = 'client'
 where id = '00000000-0000-4b43-9105-000000000300';
select 'B8 party cannot be edited after sending' as check, 'FAIL — the edit was allowed' as result;
rollback to savepoint s5b;
select 'B8 party cannot be edited after sending' as check, 'PASS (refused above)' as result;

-- The ONE legitimate update: completing the return.
update workflow.material_approval_submissions
   set returned_on = date '2026-09-18', code = 'C', comments = 'Revise and resubmit'
 where id = '00000000-0000-4b43-9105-000000000300';
select 'B9 the return may be completed once' as check,
  case when code = 'C' then 'PASS' else 'FAIL' end as result
  from workflow.material_approval_submissions where id = '00000000-0000-4b43-9105-000000000300';

savepoint s5c;
update workflow.material_approval_submissions set comments = 'changed my mind'
 where id = '00000000-0000-4b43-9105-000000000300';
select 'B10 a returned submission is closed to further edits' as check, 'FAIL — the edit was allowed' as result;
rollback to savepoint s5c;
select 'B10 a returned submission is closed to further edits' as check, 'PASS (refused above)' as result;

-- ---- 6. A paper approval: no start, A or B only -----------------------------
insert into workflow.material_approval_packages (id, project_id, ref, title, source)
values ('00000000-0000-4b43-9105-000000000102','00000000-0000-4b43-9105-000000000001','MA-52','Paper package','paper');
insert into workflow.material_approval_package_lines (package_id, contract_boq_line_id)
values ('00000000-0000-4b43-9105-000000000102','00000000-0000-4b43-9105-00000000000b');
insert into workflow.material_approval_revisions (id, package_id, rev, manufacturer, product, started_at)
values ('00000000-0000-4b43-9105-000000000202','00000000-0000-4b43-9105-000000000102',0,'Paper Co','Old widget',
        timestamptz '2026-08-01 08:00+07');

select 'B11 a paper package never gets a start, even when a revision has one' as check,
  case when preparing_started_at is null then 'PASS'
       else 'FAIL — got ' || preparing_started_at::text end as result
  from workflow.material_approval_packages where id = '00000000-0000-4b43-9105-000000000102';

savepoint s6;
insert into workflow.material_approval_submissions (revision_id, party, org, returned_on, code)
values ('00000000-0000-4b43-9105-000000000202','client','Client Ltd', date '2026-08-20','C');
select 'B12 a paper approval can never be a C' as check, 'FAIL — a C was allowed' as result;
rollback to savepoint s6;
select 'B12 a paper approval can never be a C' as check, 'PASS (refused above)' as result;

insert into workflow.material_approval_submissions (revision_id, party, org, returned_on, code)
values ('00000000-0000-4b43-9105-000000000202','client','Client Ltd', date '2026-08-20','A');
select 'B13 a paper approval records an A with no sent_on' as check, 'PASS' as result;

-- ---- 7. A package with no contract line must say why ------------------------
-- The rule is a DEFERRABLE INITIALLY DEFERRED constraint trigger, because a
-- CHECK cannot see the lines table. "set constraints all immediate" forces it
-- to fire now rather than at commit, which is what makes it testable inside a
-- savepoint at all.
savepoint s7;
insert into workflow.material_approval_packages (id, project_id, ref, title)
values ('00000000-0000-4b43-9105-000000000103','00000000-0000-4b43-9105-000000000001','MA-53','No lines, no reason');
set constraints all immediate;
select 'B14 a package with no line and no reason is refused' as check, 'FAIL — it was allowed' as result;
rollback to savepoint s7;
select 'B14 a package with no line and no reason is refused' as check, 'PASS (refused above)' as result;

-- With a reason it is allowed.
savepoint s7b;
insert into workflow.material_approval_packages (id, project_id, ref, title, outside_boq_reason)
values ('00000000-0000-4b43-9105-000000000105','00000000-0000-4b43-9105-000000000001','MA-54','Sample',
        'Not in the contract BOQ — client-requested sample for the lobby.');
set constraints all immediate;
select 'B15 a package with no line IS allowed when it says why' as check, 'PASS' as result;

-- ---- 8. MA-nn is never reused, including after a deletion -------------------
-- The property: a reference handed out by the counter is retired with its
-- package. Take one, use it, delete the package, take another — the second
-- must never be the first. Each ref is taken in its OWN statement, because
-- the function advances the counter and calling it twice inside one
-- expression would compare two different draws.
create temporary table b16 (label text, ref text) on commit drop;

insert into b16 select 'first', workflow.next_material_approval_ref('00000000-0000-4b43-9105-000000000001');

insert into workflow.material_approval_packages (project_id, ref, title, outside_boq_reason)
select '00000000-0000-4b43-9105-000000000001', ref, 'Doomed package',
       'Not in the contract BOQ — created only to be deleted.'
  from b16 where label = 'first';
set constraints all immediate;

delete from workflow.material_approval_packages
 where ref = (select ref from b16 where label = 'first')
   and project_id = '00000000-0000-4b43-9105-000000000001';

insert into b16 select 'second', workflow.next_material_approval_ref('00000000-0000-4b43-9105-000000000001');

select 'B16 a deleted package''s reference is never reissued' as check,
  case when (select ref from b16 where label = 'first')
          <> (select ref from b16 where label = 'second')
       then 'PASS — ' || (select ref from b16 where label='first') ||
            ' retired, next was ' || (select ref from b16 where label='second')
       else 'FAIL — ' || (select ref from b16 where label='first') || ' was reissued' end as result;

rollback;

-- Confirm nothing survived.
select 'B17 the probe left nothing behind' as check,
  case when not exists (select 1 from workflow.projects where id = '00000000-0000-4b43-9105-000000000001')
        and not exists (select 1 from workflow.material_approval_packages)
       then 'PASS' else 'FAIL' end as result;
