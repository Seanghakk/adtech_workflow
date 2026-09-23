-- =============================================================================
-- ADTECH Workflow Tracker — Migration 037: stored project systems, and the
-- one atomic write path for a BOQ import commit
-- Brief: ADTECH_WF_Brief_098_BOQ_Import_Preview_And_Project_Systems §2, §4
--
-- TWO objects, deliberately in ONE migration, because Brief 098 §4's own
-- "Commit writes all-or-nothing per committed group... If that needs a
-- database function, say so and write it in the same migration" is exactly
-- the case here.
--
-- AMENDED BY BRIEF 099, 23 Sep 2026 — in place, not stacked, because this
-- migration had not been applied to production when the correction landed.
--
--   Brief 098 §4 said "import is PIC-gated, like the rest of setup" for all
--   three tiers. That instruction was wrong. Each BOQ tier belongs to a
--   different part of the company, and each table already says so:
--     contract_boq_lines    : PIC-of-project OR superadmin
--     shop_drawing_boq_lines: superadmin OR current_team() in
--                             ('shop_drawing','a_and_a')
--     tender_boq_lines      : superadmin ONLY
--   An import is just another way to write those lines, so it must not
--   become a side door that widens who may write them. This function now
--   applies, PER TIER, exactly the rule that tier's own table policy
--   applies — no broader, no narrower.
--
--   Creating FLOORS and SYSTEMS is a separate question, and stays where
--   v7.2 §6.4 puts it: the project's PIC (or a superadmin), which is
--   precisely what project_floors' and project_systems' own INSERT
--   policies already say. So a Shop Drawing member may import shop drawing
--   lines but may not create floors while doing it.
--
-- The SECURITY DEFINER wrapper is still what gives Brief 098 §4's
-- all-or-nothing guarantee: one plpgsql body is one transaction, so a
-- failure anywhere rolls the whole commit back. No table policy is
-- loosened by this migration — nothing about who may write these tables
-- DIRECTLY changes.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.project_systems — Brief 098 §2
--
-- Brief 097 left the setup page's Systems section read-only, correctly:
-- systems were only ever DERIVED from whatever system_type strings happened
-- to appear in BOQ lines, so there was nowhere to hang the CAD system code
-- that Concept Note Rev 3 and the AutoCAD export both need. This is that
-- somewhere.
--
-- v7.2 §6.2 item 3: "Free text, not a closed list — the schema has no enum."
-- So `name` is free text; only `cad_code` is constrained, to the Part 1
-- lookup seeded in migration 031 (never hardcoded in application code).
-- -----------------------------------------------------------------------------
create table if not exists workflow.project_systems (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references workflow.projects(id) on delete cascade,
  name text not null,
  -- Nullable on purpose: v7.2 §6.2 item 3 says a system with no code is a
  -- real, displayable state ("Where a system has no code, drawing numbers
  -- cannot be generated for its drawings: say that in words, amber"), not
  -- something to refuse at write time.
  cad_code text references workflow.cad_systems(code),
  -- How the row arrived, per Brief 098 §2. 'imported' — created by a BOQ
  -- import commit; 'manual' — added by hand on the setup page.
  source text not null default 'manual' check (source in ('imported', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "One row per system per project; the system name unique within a project."
-- A plain unique index (not a partial one) — unlike the item_number indexes
-- in migration 034, `name` is NOT NULL here, so there is no null case to
-- exclude.
create unique index if not exists project_systems_name_per_project_key
  on workflow.project_systems (project_id, name);

create index if not exists project_systems_project_id_idx
  on workflow.project_systems (project_id);

alter table workflow.project_systems enable row level security;

-- Read: anyone who can see the project. Write: the project's PIC or a
-- superadmin. Mirrors workflow.project_floors' own four policies exactly —
-- project_systems is a NEW table, so its policies can reference
-- projects.pic_id directly and need no SECURITY DEFINER detour (the detour
-- migration 036 needed was specific to workflow.projects, which has no
-- general UPDATE policy of its own).
drop policy if exists project_systems_select on workflow.project_systems;
create policy project_systems_select on workflow.project_systems
  for select using (
    workflow.is_member() and exists (
      select 1 from workflow.projects p
      where p.id = project_systems.project_id
        and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

drop policy if exists project_systems_insert on workflow.project_systems;
create policy project_systems_insert on workflow.project_systems
  for insert with check (
    workflow.is_superadmin() or exists (
      select 1 from workflow.projects p
      where p.id = project_systems.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_systems_update on workflow.project_systems;
create policy project_systems_update on workflow.project_systems
  for update using (
    workflow.is_superadmin() or exists (
      select 1 from workflow.projects p
      where p.id = project_systems.project_id
        and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin() or exists (
      select 1 from workflow.projects p
      where p.id = project_systems.project_id
        and p.pic_id = (select auth.uid())
    )
  );

drop policy if exists project_systems_delete on workflow.project_systems;
create policy project_systems_delete on workflow.project_systems
  for delete using (
    workflow.is_superadmin() or exists (
      select 1 from workflow.projects p
      where p.id = project_systems.project_id
        and p.pic_id = (select auth.uid())
    )
  );

-- Explicit, not inherited. Checked directly on rollback-test: the schema's
-- ambient default privileges granted this new table SELECT/INSERT/UPDATE to
-- `authenticated` but NOT DELETE, where workflow.project_floors carries all
-- four. Rather than depend on whatever default privileges happen to be set
-- on production (which need not match rollback-test's), the grants this
-- table's own RLS policies assume are stated here, so the migration is
-- self-contained. RLS above is what actually decides who may write; these
-- grants only stop PostgREST refusing the statement before RLS is reached.
grant select on workflow.project_systems to anon;
grant select, insert, update, delete on workflow.project_systems to authenticated;

comment on table workflow.project_systems is
  'Brief 098 §2. The systems present in one project, with the CAD system code
   (workflow.cad_systems, migration 031) the AutoCAD export needs. Name is
   free text per v7.2 §6.2 item 3 ("not a closed list — the schema has no
   enum"); only the code is constrained to the lookup. cad_code is nullable
   because "no code yet" is a real state the setup page shows in amber, not
   a write to refuse. No backfill — existing projects start with no rows and
   are filled by a BOQ import or by hand.';

-- -----------------------------------------------------------------------------
-- 2. workflow.commit_boq_import — Brief 098 §4
--
-- The ONE write path a BOQ import commit takes, for every tier. Follows
-- migration 036's shape (SECURITY DEFINER, caller checked internally, plain
-- `raise exception` on refusal — never a silent no-op).
--
-- Upserts on (project_id, item_number), the stable key decided 22 Sep 2026
-- and indexed in migration 034 — so a re-import UPDATES matching lines
-- instead of duplicating them, which is the assertion v7.2 §7.4 makes in the
-- body copy and open item 13 asks to confirm in the backend.
--
-- Lines present in the app but NOT in the file are deliberately left alone:
-- v7.2 §7.4's "Lines missing from the file are listed and never deleted
-- silently". This function never deletes a BOQ line.
-- -----------------------------------------------------------------------------
create or replace function workflow.commit_boq_import(
  p_project_id uuid,
  p_tier text,
  p_lines jsonb,
  p_floors jsonb,
  p_systems jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
declare
  v_pic_id uuid;
  v_uid uuid := (select auth.uid());
  v_superadmin boolean := workflow.is_superadmin();
  v_team text := workflow.current_team();
  v_is_pic boolean;
  v_may_write_tier boolean;
  v_may_create_setup boolean;
  v_floors_created int := 0;
  v_systems_added int := 0;
  v_inserted int := 0;
  v_updated int := 0;
  v_floor jsonb;
  v_system jsonb;
  v_line jsonb;
  v_loc jsonb;
  v_line_id uuid;
  v_existed boolean;
  v_floor_id uuid;
  v_tower_id uuid;
begin
  if p_tier not in ('tender', 'contract', 'shop_drawing') then
    raise exception 'Unknown BOQ tier "%".', p_tier;
  end if;

  select pic_id into v_pic_id from workflow.projects where id = p_project_id;
  if not found then
    raise exception 'No such project.';
  end if;

  v_is_pic := v_pic_id is not null and v_pic_id = v_uid;

  -- Brief 099 §1 — per tier, exactly that tier's own table policy. These
  -- three expressions are deliberately literal transcriptions of the
  -- policies on contract_boq_lines, shop_drawing_boq_lines and
  -- tender_boq_lines; if a policy is ever changed, change it here too.
  v_may_write_tier := case p_tier
    when 'contract'     then v_superadmin or v_is_pic
    when 'shop_drawing' then v_superadmin or v_team in ('shop_drawing', 'a_and_a')
    when 'tender'       then v_superadmin
  end;

  if not v_may_write_tier then
    raise exception '%', case p_tier
      when 'contract'     then 'Only this project''s PIC may import the contract BOQ.'
      when 'shop_drawing' then 'Only the Shop Drawing and A&A teams may import the shop drawing BOQ.'
      when 'tender'       then 'Only a superadmin may import the tender BOQ.'
    end;
  end if;

  -- Brief 099 §2 — creating floors and systems is project setup, which
  -- v7.2 §6.4 keeps with the PIC. Same rule project_floors' and
  -- project_systems' own INSERT policies apply. A Shop Drawing member may
  -- import shop drawing lines without being able to create floors, so this
  -- is checked separately from the tier gate above, and only when the
  -- caller actually asked to create something.
  v_may_create_setup := v_superadmin or v_is_pic;

  if not v_may_create_setup then
    if jsonb_array_length(coalesce(p_floors, '[]'::jsonb)) > 0 then
      raise exception 'Only this project''s PIC may add floors to it.';
    end if;
    if jsonb_array_length(coalesce(p_systems, '[]'::jsonb)) > 0 then
      raise exception 'Only this project''s PIC may add systems to it.';
    end if;
  end if;

  -- 2a. Proposed floors first — lines' floor locations resolve against them.
  -- v7.2 §7.6: the file's column order is not necessarily the building
  -- order, so sort_order arrives from the (editable) preview, not inferred
  -- here.
  for v_floor in select * from jsonb_array_elements(coalesce(p_floors, '[]'::jsonb))
  loop
    v_tower_id := null;
    if coalesce(v_floor->>'towerLabel', '') <> '' then
      select id into v_tower_id
      from workflow.project_towers
      where project_id = p_project_id and label = v_floor->>'towerLabel';

      if v_tower_id is null then
        insert into workflow.project_towers (project_id, label, sort_order)
        values (p_project_id, v_floor->>'towerLabel',
                coalesce((select max(sort_order) + 10 from workflow.project_towers where project_id = p_project_id), 10))
        returning id into v_tower_id;
      end if;
    end if;

    insert into workflow.project_floors (project_id, label, sort_order, tower_id, drawing_code)
    values (
      p_project_id,
      v_floor->>'label',
      coalesce((v_floor->>'sortOrder')::int, 10),
      v_tower_id,
      nullif(v_floor->>'drawingCode', '')
    )
    on conflict do nothing;

    if found then
      v_floors_created := v_floors_created + 1;
    end if;
  end loop;

  -- 2b. Proposed systems. cad_code may be null — "no code yet" is a real
  -- state, not a refusal (see the table comment above).
  for v_system in select * from jsonb_array_elements(coalesce(p_systems, '[]'::jsonb))
  loop
    insert into workflow.project_systems (project_id, name, cad_code, source)
    values (p_project_id, v_system->>'name', nullif(v_system->>'cadCode', ''), 'imported')
    on conflict (project_id, name) do nothing;

    if found then
      v_systems_added := v_systems_added + 1;
    end if;
  end loop;

  -- 2c. The lines themselves, upserted on (project_id, item_number).
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
  loop
    if coalesce(v_line->>'itemNumber', '') = '' then
      -- Brief 098 §3.5: "A file row with no item number is a row error, not
      -- a silent insert." The preview refuses these before commit; this is
      -- the backstop that makes it impossible to slip one through.
      raise exception 'A BOQ line arrived with no item number. Nothing was written.';
    end if;

    if p_tier = 'contract' then
      select id into v_line_id from workflow.contract_boq_lines
      where project_id = p_project_id and item_number = v_line->>'itemNumber';
      v_existed := v_line_id is not null;

      if v_existed then
        update workflow.contract_boq_lines set
          section_label = nullif(v_line->>'sectionLabel', ''),
          description = v_line->>'description',
          brand = nullif(v_line->>'brand', ''),
          unit = v_line->>'unit',
          quantity = (v_line->>'quantity')::numeric,
          updated_at = now()
        where id = v_line_id;
        v_updated := v_updated + 1;
      else
        insert into workflow.contract_boq_lines
          (project_id, item_number, section_label, description, brand, unit, quantity)
        values (
          p_project_id, v_line->>'itemNumber', nullif(v_line->>'sectionLabel', ''),
          v_line->>'description', nullif(v_line->>'brand', ''), v_line->>'unit',
          (v_line->>'quantity')::numeric
        )
        returning id into v_line_id;
        v_inserted := v_inserted + 1;
      end if;

    elsif p_tier = 'tender' then
      select id into v_line_id from workflow.tender_boq_lines
      where project_id = p_project_id and item_number = v_line->>'itemNumber';
      v_existed := v_line_id is not null;

      if v_existed then
        update workflow.tender_boq_lines set
          system_type = v_line->>'systemType',
          description = v_line->>'description',
          brand = nullif(v_line->>'brand', ''),
          model = nullif(v_line->>'model', ''),
          part_number = nullif(v_line->>'partNumber', ''),
          unit = v_line->>'unit',
          total_quantity = (v_line->>'quantity')::numeric,
          remarks = nullif(v_line->>'remarks', ''),
          updated_at = now()
        where id = v_line_id;
        v_updated := v_updated + 1;
      else
        insert into workflow.tender_boq_lines
          (project_id, item_number, system_type, description, brand, model, part_number, unit, total_quantity, remarks)
        values (
          p_project_id, v_line->>'itemNumber', v_line->>'systemType', v_line->>'description',
          nullif(v_line->>'brand', ''), nullif(v_line->>'model', ''), nullif(v_line->>'partNumber', ''),
          v_line->>'unit', (v_line->>'quantity')::numeric, nullif(v_line->>'remarks', '')
        )
        returning id into v_line_id;
        v_inserted := v_inserted + 1;
      end if;

    else -- shop_drawing
      select id into v_line_id from workflow.shop_drawing_boq_lines
      where project_id = p_project_id and item_number = v_line->>'itemNumber';
      v_existed := v_line_id is not null;

      if v_existed then
        update workflow.shop_drawing_boq_lines set
          system_type = v_line->>'systemType',
          description = v_line->>'description',
          brand = nullif(v_line->>'brand', ''),
          model = nullif(v_line->>'model', ''),
          part_number = nullif(v_line->>'partNumber', ''),
          unit = v_line->>'unit',
          total_quantity = (v_line->>'quantity')::numeric,
          remarks = nullif(v_line->>'remarks', ''),
          updated_at = now(),
          updated_by = v_uid
        where id = v_line_id;
        v_updated := v_updated + 1;
      else
        insert into workflow.shop_drawing_boq_lines
          (project_id, item_number, system_type, description, brand, model, part_number, unit, total_quantity, remarks, updated_by)
        values (
          p_project_id, v_line->>'itemNumber', v_line->>'systemType', v_line->>'description',
          nullif(v_line->>'brand', ''), nullif(v_line->>'model', ''), nullif(v_line->>'partNumber', ''),
          v_line->>'unit', (v_line->>'quantity')::numeric, nullif(v_line->>'remarks', ''), v_uid
        )
        returning id into v_line_id;
        v_inserted := v_inserted + 1;
      end if;

      -- Floor quantities. Replaced wholesale for this line, so a re-import
      -- that clears a floor's cell actually clears it rather than leaving a
      -- stale quantity behind — the line's own locations are fully
      -- described by the file row being committed.
      delete from workflow.shop_drawing_boq_line_locations
      where shop_drawing_boq_line_id = v_line_id;

      for v_loc in select * from jsonb_array_elements(coalesce(v_line->'locations', '[]'::jsonb))
      loop
        -- Resolved on floor label AND tower label together, never label
        -- alone: migration 021 deliberately allows the same floor label
        -- ("L1") to repeat across different towers, so a bare label match
        -- would attach the quantity to an arbitrary one of them.
        select f.id into v_floor_id
        from workflow.project_floors f
        left join workflow.project_towers tw on tw.id = f.tower_id
        where f.project_id = p_project_id
          and f.label = v_loc->>'floorLabel'
          and coalesce(tw.label, '') = coalesce(v_loc->>'towerLabel', '')
        limit 1;

        insert into workflow.shop_drawing_boq_line_locations
          (shop_drawing_boq_line_id, location_label, floor_id, quantity)
        values (v_line_id, v_loc->>'locationLabel', v_floor_id, (v_loc->>'quantity')::numeric)
        on conflict (shop_drawing_boq_line_id, location_label)
        do update set quantity = excluded.quantity, floor_id = excluded.floor_id;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'linesInserted', v_inserted,
    'linesUpdated', v_updated,
    'floorsCreated', v_floors_created,
    'systemsAdded', v_systems_added
  );
end;
$$;

comment on function workflow.commit_boq_import(uuid, text, jsonb, jsonb, jsonb) is
  'Brief 098 §4, amended by Brief 099 §1-§2. The one atomic write path for a
   BOQ import commit, all three tiers.

   PERMISSION FOLLOWS EACH TIER''S OWNER, not the PIC: the import applies
   per tier exactly the rule that tier''s own table policy applies —
   contract = PIC or superadmin; shop drawing = superadmin or
   current_team() in (shop_drawing, a_and_a); tender = superadmin only. An
   import is just another way to write those lines and must not widen who
   may write them. Creating floors or systems is separate and stays with
   the PIC (or a superadmin), matching project_floors'' and
   project_systems'' own INSERT policies — so a Shop Drawing member can
   import shop drawing lines but cannot create floors while doing it.

   Upserts on (project_id, item_number) — the stable key of migration 034 —
   so a re-import updates in place rather than duplicating (v7.2 §7.4, open
   item 13). NEVER deletes a BOQ line: lines in the app but not in the file
   are reported by the preview and left untouched (v7.2 §7.4). One plpgsql
   body = one transaction, which is what gives Brief 098 §4''s
   all-or-nothing guarantee. No table policy is loosened by this migration.';

commit;
