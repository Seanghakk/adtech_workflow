-- Brief 102 §2 — the INSERT policy proved BOTH WAYS.
--
-- Run against ROLLBACK-TEST only. One transaction, ROLLBACK at the end:
-- the A&A and unrelated-team identities this needs are not fixtures, so
-- they are conjured inside the transaction and vanish with it, and every
-- drawing it inserts disappears too. No fixture is mutated.
--
-- The point of this file is the second half. Proving the NEW policy lets
-- an A&A member in shows only that the insert works; it does not show
-- that the policy is why. So the OLD policy is restored inside the same
-- transaction and the identical insert is attempted again — if that is
-- still allowed, the widening was not what changed anything, and this
-- file says so.

\set ON_ERROR_STOP off
\set PIC     '0b04382e-583e-4550-9ff1-f88d2ce90cc0'
\set SDMGR   '19f60722-9222-4be1-b832-7ab065a4aa02'
\set AAMEM   '83950abe-f6c4-40e7-acbe-305d0f3aa5c7'
\set OUTSIDE 'f34efe72-8a8a-4080-9cf0-12301abaf3b9'
\set PROJ    'e806bea0-0308-4c3e-8d38-9ae2c5c447e0'

begin;

-- An A&A member and a member of an unrelated team (QS), for this
-- transaction only.
insert into workflow.members (user_id, team_id, role, is_active, is_superadmin)
values (:'AAMEM', (select id from workflow.teams where code = 'a_and_a'), 'member', true, false);

insert into workflow.members (user_id, team_id, role, is_active, is_superadmin)
values (:'OUTSIDE', (select id from workflow.teams where code = 'qs'), 'member', true, false);

create or replace function pg_temp.act_as(p_uid uuid) returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  return format('uid=%s team=%s superadmin=%s',
    (select auth.uid()), workflow.current_team(), workflow.is_superadmin());
end $$;

-- A project-level schematic: the exact category that had no creation
-- path at all before this migration.
-- Each attempt runs in its own subtransaction and is ALWAYS undone: on
-- success it raises a sentinel so the insert rolls back with it.
--
-- The first version of this deleted the row it had just inserted, and
-- that was wrong in a way worth recording — the DELETE policy is still
-- PIC-or-superadmin, so for a Shop Drawing or A&A member the delete was
-- refused by RLS, silently, affecting zero rows and raising nothing
-- (the Brief 094 phenomenon). The row survived, and every later attempt
-- failed on the unique index instead of on the policy, which made the
-- whole proof read backwards.
create or replace function pg_temp.try_add() returns text language plpgsql as $$
begin
  begin
    insert into workflow.shop_drawing_items (project_id, scope, drawing_type, status)
    values ('e806bea0-0308-4c3e-8d38-9ae2c5c447e0', 'project', 'schematic', 'not_started');
    raise exception using errcode = '22000', message = '__INSERT_OK__';
  exception when others then
    if sqlerrm = '__INSERT_OK__' then return 'ALLOWED'; end if;
    return 'REFUSED  (' || sqlerrm || ')';
  end;
end $$;

\echo ''
\echo '=============================================================='
\echo 'WITH THE NEW POLICY (migration 039, as applied)'
\echo '=============================================================='
select pg_temp.act_as(:'SDMGR')   as identity, pg_temp.try_add() as shop_drawing_member;
select pg_temp.act_as(:'AAMEM')   as identity, pg_temp.try_add() as a_and_a_member;
select pg_temp.act_as(:'PIC')     as identity, pg_temp.try_add() as project_pic;
select pg_temp.act_as(:'OUTSIDE') as identity, pg_temp.try_add() as unrelated_team;

-- Expected: shop drawing ALLOWED, A&A ALLOWED, PIC ALLOWED,
--           unrelated team REFUSED.

reset role;

-- ---------------------------------------------------------------------
-- Now put the OLD policy back, inside this same transaction, and repeat.
-- ---------------------------------------------------------------------
drop policy if exists shop_drawing_items_insert on workflow.shop_drawing_items;

create policy shop_drawing_items_insert on workflow.shop_drawing_items
  for insert
  with check (
    workflow.is_superadmin()
    or exists (
      select 1
      from workflow.projects p
      where p.id = shop_drawing_items.project_id
        and p.pic_id = (select auth.uid())
    )
  );

\echo ''
\echo '=============================================================='
\echo 'WITH THE OLD POLICY RESTORED (PIC or superadmin only)'
\echo '=============================================================='
select pg_temp.act_as(:'SDMGR')   as identity, pg_temp.try_add() as shop_drawing_member;
select pg_temp.act_as(:'AAMEM')   as identity, pg_temp.try_add() as a_and_a_member;
select pg_temp.act_as(:'PIC')     as identity, pg_temp.try_add() as project_pic;
select pg_temp.act_as(:'OUTSIDE') as identity, pg_temp.try_add() as unrelated_team;

-- Expected: shop drawing REFUSED, A&A REFUSED, PIC ALLOWED,
--           unrelated team REFUSED.
--
-- The two teams flipping from REFUSED to ALLOWED, while the PIC stays
-- ALLOWED and the unrelated team stays REFUSED throughout, is the whole
-- proof: the widening did exactly one thing, and did not loosen anything
-- else.

reset role;
rollback;

\echo ''
\echo 'Rolled back. The conjured members and every inserted drawing are gone.'
