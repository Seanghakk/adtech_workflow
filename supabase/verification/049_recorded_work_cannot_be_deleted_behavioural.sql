-- =============================================================================
-- 049 — BEHAVIOURAL verification. ROLLBACK-TEST ONLY.
-- =============================================================================
--
-- DO NOT RUN THIS ON PRODUCTION. It writes rows. It ends in ROLLBACK, so it
-- leaves nothing behind, but a production database is not the place to find
-- that out.
--
-- The catalogue file (049_..._verify.sql) proves the guards EXIST. This
-- proves they WORK, and specifically that they survive the one thing a
-- floor-level guard does not: the app's own delete order.
--
-- Every fixture here is created inside the transaction and rolled back. The
-- five protected fixtures are never touched.
-- =============================================================================

begin;

do $$
declare
  v_client   uuid;
  v_project  uuid;
  v_floor    uuid;
  v_pristine uuid;
  v_system   uuid;
  v_cell     uuid;
  v_item     uuid;
  v_pass     int := 0;
  v_fail     int := 0;
  v_n        int;
  v_msg      text;

  procedure_note text;
begin
  -- ---- fixtures ------------------------------------------------------------
  select id into v_client from workflow.clients limit 1;

  insert into workflow.projects (name, client_id, stream)
  values ('049 probe — rolled back', v_client, 'elv')
  returning id into v_project;

  insert into workflow.project_floors (project_id, label, sort_order)
  values (v_project, 'PROBE-L1', 10) returning id into v_floor;

  insert into workflow.project_floors (project_id, label, sort_order)
  values (v_project, 'PROBE-L2', 20) returning id into v_pristine;

  insert into workflow.project_systems (project_id, name)
  values (v_project, 'Probe CCTV') returning id into v_system;

  -- Coverage on both floors. The 045 trigger seeds five cells per pair.
  insert into workflow.project_system_floors (project_system_id, floor_id)
  values (v_system, v_floor), (v_system, v_pristine);

  select count(*) into v_n from workflow.progress_cells
   where floor_id in (v_floor, v_pristine);
  if v_n = 10 then
    v_pass := v_pass + 1; raise notice 'PASS  1  coverage seeded 10 cells across two floors';
  else
    v_fail := v_fail + 1; raise notice 'FAIL  1  expected 10 seeded cells, got %', v_n;
  end if;

  -- Record work on ONE cell of the first floor. This is the only difference
  -- between the two floors.
  select id into v_cell from workflow.progress_cells
   where floor_id = v_floor and sub_stage = 'first_fix';
  update workflow.progress_cells set status = 'in_progress' where id = v_cell;

  -- ---- 2. a pristine floor still deletes, by the app's own order -----------
  -- The guards must not break the case the screen exists for: removing a
  -- floor added by mistake, right after setup.
  begin
    delete from workflow.project_system_floors where floor_id = v_pristine;
    delete from workflow.progress_cells        where floor_id = v_pristine;
    delete from workflow.project_floors        where id = v_pristine;
    v_pass := v_pass + 1; raise notice 'PASS  2  a pristine floor still deletes (app order)';
  exception when others then
    v_fail := v_fail + 1; raise notice 'FAIL  2  pristine floor refused: %', sqlerrm;
  end;

  -- ---- 3. direct floor delete is refused -----------------------------------
  begin
    delete from workflow.project_floors where id = v_floor;
    v_fail := v_fail + 1; raise notice 'FAIL  3  floor with work deleted — guard did nothing';
  exception when sqlstate '23001' then
    v_pass := v_pass + 1; raise notice 'PASS  3  direct floor delete refused';
  end;

  -- ---- 4. THE ONE THAT MATTERS --------------------------------------------
  -- The app's order: coverage first. A BEFORE DELETE guard on project_floors
  -- alone passes this, because by the time it runs the cells are gone. The
  -- cascade from coverage must hit the cell-level guard instead.
  begin
    delete from workflow.project_system_floors where floor_id = v_floor;
    v_fail := v_fail + 1;
    raise notice 'FAIL  4  coverage delete cascaded away recorded work';
  exception when sqlstate '23001' then
    v_pass := v_pass + 1;
    raise notice 'PASS  4  coverage delete refused — cascade cannot strip the work';
  end;

  -- ---- 5. direct cell delete is refused ------------------------------------
  begin
    delete from workflow.progress_cells where id = v_cell;
    v_fail := v_fail + 1; raise notice 'FAIL  5  cell with work deleted directly';
  exception when sqlstate '23001' then
    v_pass := v_pass + 1; raise notice 'PASS  5  direct cell delete refused';
  end;

  -- ---- 6. a cell with NO work still deletes --------------------------------
  -- The rule is "work is protected", not "nothing is deletable".
  begin
    delete from workflow.progress_cells
     where floor_id = v_floor and sub_stage = 'commissioning';
    v_pass := v_pass + 1; raise notice 'PASS  6  an untouched cell still deletes';
  exception when others then
    v_fail := v_fail + 1; raise notice 'FAIL  6  untouched cell refused: %', sqlerrm;
  end;

  -- ---- 7. a QC inspection alone protects a cell ----------------------------
  -- status is back to not_started, so ONLY the inspection stands between the
  -- cell and deletion. This is the clause the app had silently lost.
  update workflow.progress_cells set status = 'not_started' where id = v_cell;
  insert into workflow.qc_inspections (project_id, progress_cell_id, inspection_type, status)
  values (v_project, v_cell, 'installation', 'pass');
  begin
    delete from workflow.progress_cells where id = v_cell;
    v_fail := v_fail + 1; raise notice 'FAIL  7  inspected cell deleted although not_started';
  exception when sqlstate '23001' then
    v_pass := v_pass + 1; raise notice 'PASS  7  an inspection alone protects a cell';
  end;

  -- ---- 8. drawing item with work is refused --------------------------------
  insert into workflow.shop_drawing_items
    (project_id, floor_id, scope, drawing_type, status)
  values (v_project, v_floor, 'floor', 'layout', 'in_progress')
  returning id into v_item;
  begin
    delete from workflow.shop_drawing_items where id = v_item;
    v_fail := v_fail + 1; raise notice 'FAIL  8  drawing item with work deleted';
  exception when sqlstate '23001' then
    v_pass := v_pass + 1; raise notice 'PASS  8  drawing item with work refused';
  end;

  -- ---- 9. the escape hatch works, and only when set ------------------------
  begin
    set local workflow.allow_destructive_delete = 'on';
    delete from workflow.progress_cells where id = v_cell;
    v_pass := v_pass + 1; raise notice 'PASS  9  escape hatch permits a deliberate delete';
  exception when others then
    v_fail := v_fail + 1; raise notice 'FAIL  9  escape hatch did not work: %', sqlerrm;
  end;

  -- ---- 10. the orphan is gone ----------------------------------------------
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'workflow' and p.proname = 'recalculate_rollup_from_sub_stage';
  if v_n = 0 then
    v_pass := v_pass + 1; raise notice 'PASS 10  orphaned recalculate_rollup_from_sub_stage is gone';
  else
    v_fail := v_fail + 1; raise notice 'FAIL 10  orphan still present';
  end if;

  raise notice '----------------------------------------';
  raise notice 'passed % / %', v_pass, v_pass + v_fail;
  if v_fail > 0 then
    raise exception '% behavioural check(s) FAILED', v_fail;
  end if;
end $$;

rollback;
