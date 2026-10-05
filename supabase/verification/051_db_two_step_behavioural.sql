-- =============================================================================
-- 051 — BEHAVIOURAL verification. ROLLBACK-TEST / PGLITE ONLY.
-- =============================================================================
--
-- DO NOT RUN THIS ON PRODUCTION. It writes fixture rows (inside a transaction
-- that ends in ROLLBACK). The catalogue file (051_db_two_step_verify.sql) is
-- the production-safe check; this one proves the rule WORKS, by switching to
-- the authenticated role so row rules really apply:
--   * a member WITH a verified authenticator, one-step (aal1): no rows, no
--     writes, every guarded function refuses;
--   * the same member at two-step (aal2): everything as before;
--   * a member WITHOUT an authenticator: unchanged;
--   * D5: anon can't call the five functions; a member can't call the four
--     internal ones directly — and the trigger that uses one of them
--     (seed_progress_cells) still works for that member.
--
-- Run: node supabase/tests/_support/run-verify-at.mjs 051 supabase/verification/051_db_two_step_behavioural.sql
-- =============================================================================

begin;

create temp table _r (label text, ok boolean);
grant all on _r to authenticated, anon;

do $$
declare
  f_mgr   uuid := 'f0510000-0000-0000-0000-000000000001';  -- manager WITH a verified factor
  n_mgr   uuid := 'f0510000-0000-0000-0000-000000000002';  -- manager, no factor
  v_team  uuid;
  v_client uuid;
  v_project uuid;
  v_floor uuid;
  v_system uuid;
  n int;
begin
  select id into v_team from workflow.teams where code = 'project_management';
  insert into auth.users (id) values (f_mgr), (n_mgr);
  insert into public.user_profiles (id, full_name) values (f_mgr, '051 FM'), (n_mgr, '051 NM');
  insert into auth.mfa_factors (id, user_id, factor_type, status)
  values ('f0510000-0000-0000-0000-0000000000f1', f_mgr, 'totp', 'verified');
  insert into workflow.members (user_id, team_id, role, is_active) values (f_mgr, v_team, 'manager', true), (n_mgr, v_team, 'manager', true);
  insert into workflow.clients (name) values ('051 client') returning id into v_client;
  insert into workflow.projects (name, client_id, stream, pic_id) values ('051 project', v_client, 'elv', n_mgr) returning id into v_project;

  -- ===== manager WITH a factor, one-step ===============================================
  perform set_config('request.jwt.claims', json_build_object('sub', f_mgr, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workflow.projects where id = v_project;
  insert into _r values ('factor + aal1: project hidden', n = 0);
  select count(*) into n from workflow.members;
  insert into _r values ('factor + aal1: members hidden', n = 0);
  begin
    insert into workflow.reason_codes (code, label_en, label_km) values ('051-aal1', '051 aal1', '051 aal1');
    insert into _r values ('factor + aal1: insert refused', false);
  exception when insufficient_privilege then insert into _r values ('factor + aal1: insert refused', true);
  end;
  begin
    perform workflow.assign_project_pic(v_project, f_mgr);
    insert into _r values ('factor + aal1: assign_project_pic refused', false);
  exception when insufficient_privilege then insert into _r values ('factor + aal1: assign_project_pic refused', sqlerrm = 'two-step sign-in required');
  end;
  begin
    perform workflow.get_user_profiles(array[n_mgr]);
    insert into _r values ('factor + aal1: get_user_profiles refused', false);
  exception when insufficient_privilege then insert into _r values ('factor + aal1: get_user_profiles refused', sqlerrm = 'two-step sign-in required');
  end;
  begin
    perform workflow.next_material_approval_ref(v_project);
    insert into _r values ('factor + aal1: next_material_approval_ref refused', false);
  exception when insufficient_privilege then insert into _r values ('factor + aal1: next_material_approval_ref refused', sqlerrm = 'two-step sign-in required');
  end;
  begin
    perform workflow.set_project_dates(v_project, current_date, current_date + 30);
    insert into _r values ('factor + aal1: set_project_dates refused', false);
  exception when insufficient_privilege then insert into _r values ('factor + aal1: set_project_dates refused', sqlerrm = 'two-step sign-in required');
  end;
  execute 'reset role';

  -- ===== same manager, two-step ==========================================================
  perform set_config('request.jwt.claims', json_build_object('sub', f_mgr, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workflow.projects where id = v_project;
  insert into _r values ('factor + aal2: project visible', n = 1);
  begin
    insert into workflow.reason_codes (code, label_en, label_km) values ('051-aal2', '051 aal2', '051 aal2');
    insert into _r values ('factor + aal2: insert works', true);
  exception when others then insert into _r values ('factor + aal2: insert works', false);
  end;
  begin
    perform workflow.get_user_profiles(array[n_mgr]);
    insert into _r values ('factor + aal2: get_user_profiles works', true);
  exception when others then insert into _r values ('factor + aal2: get_user_profiles works', false);
  end;
  begin
    perform workflow.assign_project_pic(v_project, n_mgr);
    insert into _r values ('factor + aal2: assign_project_pic works', true);
  exception when others then insert into _r values ('factor + aal2: assign_project_pic works', false);
  end;
  execute 'reset role';

  -- ===== manager WITHOUT a factor, one-step: unchanged ==================================
  perform set_config('request.jwt.claims', json_build_object('sub', n_mgr, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workflow.projects where id = v_project;
  insert into _r values ('no factor + aal1: project visible (unchanged)', n = 1);
  begin
    insert into workflow.reason_codes (code, label_en, label_km) values ('051-nofactor', '051 no factor', '051 no factor');
    insert into _r values ('no factor + aal1: insert works (unchanged)', true);
  exception when others then insert into _r values ('no factor + aal1: insert works (unchanged): ' || sqlerrm, false);
  end;
  begin
    perform workflow.next_material_approval_ref(v_project);
    insert into _r values ('no factor + aal1: next_material_approval_ref works for a member', true);
  exception when others then insert into _r values ('no factor + aal1: next_material_approval_ref works for a member', false);
  end;
  -- D5: the internal functions are no longer callable directly …
  begin
    perform workflow.recalculate_project_rollup(v_project);
    insert into _r values ('member cannot call recalculate_project_rollup directly', false);
  exception when insufficient_privilege then insert into _r values ('member cannot call recalculate_project_rollup directly', true);
  end;
  -- … but the trigger path that uses seed_progress_cells still works for the member (PIC).
  begin
    insert into workflow.project_floors (project_id, label, sort_order) values (v_project, '051-L1', 10) returning id into v_floor;
    insert into workflow.project_systems (project_id, name) values (v_project, '051 system') returning id into v_system;
    insert into workflow.project_system_floors (project_system_id, floor_id) values (v_system, v_floor);
    select count(*) into n from workflow.progress_cells where floor_id = v_floor;
    insert into _r values ('trigger still seeds progress cells after D5 (5 cells)', n = 5);
  exception when others then insert into _r values ('trigger still seeds progress cells after D5: ' || sqlerrm, false);
  end;
  execute 'reset role';

  -- ===== anon (signed out): D5 ==========================================================
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  execute 'set local role anon';
  begin
    perform workflow.next_material_approval_ref(v_project);
    insert into _r values ('anon cannot call next_material_approval_ref', false);
  exception when insufficient_privilege then insert into _r values ('anon cannot call next_material_approval_ref', true);
  end;
  begin
    perform workflow.seed_progress_cells(v_system, v_floor);
    insert into _r values ('anon cannot call seed_progress_cells', false);
  exception when insufficient_privilege then insert into _r values ('anon cannot call seed_progress_cells', true);
  end;
  begin
    perform workflow.project_effective_start_date(v_project);
    insert into _r values ('anon cannot call project_effective_start_date', false);
  exception when insufficient_privilege then insert into _r values ('anon cannot call project_effective_start_date', true);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end
$$;

select label, case when ok then 'PASS' else 'FAIL' end as result from _r order by ok, label;

rollback;
