-- =============================================================================
-- ROLLBACK for migration 046 — the BOQ import's coverage pass
-- =============================================================================
--
-- 046 restated workflow.commit_boq_import with one extra pass (2e) that
-- proposes floor coverage per system. This puts back the body that was there
-- before it.
--
-- IT RESTORES MIGRATION 042's BODY, NOT 037's. 037 created the function;
-- 042 redefined it to let the Tender team import the tender BOQ. Restoring
-- 037 here would quietly undo 042 as well — a rollback that reverts more than
-- its own migration is a data-losing bug wearing a safe-looking name. The
-- three migrations that define this function are 037, 042 and 046; the one
-- immediately before 046 is 042, so that is the one that goes back.
--
-- The body below was EXTRACTED PROGRAMMATICALLY from
-- supabase/migrations/042_tender_team_boq_permission.sql rather than
-- retyped, so it is byte-identical to what 042 installs. Nothing in it was
-- edited by hand.
--
-- The only visible effect of this rollback is that a shop-drawing import
-- stops proposing coverage and its result stops carrying coverageAdded.
-- Coverage rows already written by a previous import are left alone: they are
-- real data about what a system covers, and 046 did not create the table they
-- live in (045 did).
--
-- One transaction, committed once, at the end.
-- =============================================================================

begin;

CREATE OR REPLACE FUNCTION workflow.commit_boq_import(p_project_id uuid, p_tier text, p_lines jsonb, p_floors jsonb, p_systems jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_temp'
AS $function$
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
    when 'tender'       then v_superadmin or v_team in ('tender')
  end;

  if not v_may_write_tier then
    raise exception '%', case p_tier
      when 'contract'     then 'Only this project''s PIC may import the contract BOQ.'
      when 'shop_drawing' then 'Only the Shop Drawing and A&A teams may import the shop drawing BOQ.'
      when 'tender'       then 'Only the Tender team may import the tender BOQ.'
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
$function$;

commit;
