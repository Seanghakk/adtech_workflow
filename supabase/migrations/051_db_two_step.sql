-- =============================================================================
-- 051 — The database requires the second sign-in step (Platform Brief 005)
-- =============================================================================
--
-- ADTECH_PLATFORM_Brief_005, Stage 2 (approved 4 Oct 2026: D1 D4 D5).
--
-- Before: anyone with a member's email + password could sign in to Supabase
-- directly with the public key, get an aal1 session, and read/write whatever
-- that member's row rules allow — skipping two-step, which only the apps
-- checked. After: an account WITH a verified authenticator gets no rows, no
-- writes and no guarded function calls until its session is aal2. Accounts
-- without an authenticator are unchanged (D2/D3: "required but not set up"
-- and must_change_password stay with the apps).
--
--   1. workflow.mfa_satisfied(): the session is aal2, or the person has no
--      verified factor. (The CMMS's migration 053 creates the identical
--      public.mfa_satisfied(); this repo never writes to public.)
--   2. One RESTRICTIVE policy, two_step_when_enrolled, on EVERY workflow
--      table — AND-ed with the existing policies, so it can only narrow.
--   3. The same check inside the 8 SECURITY DEFINER functions the app calls
--      (row rules don't apply inside them). Bodies otherwise exactly as live
--      on 4 Oct 2026 (pg_get_functiondef), one inserted block each.
--   4. D5 — five definer functions were callable by ANYONE (EXECUTE defaulted
--      to PUBLIC, no identity check): the four used only by other definer
--      functions/triggers lose public EXECUTE (their callers run as the
--      owner, so nothing changes for them); next_material_approval_ref (the
--      app calls it) now requires a member and two-step, and anon loses it.
--
-- The service role bypasses row rules (photo upload/serving). The PostgREST
-- schema list is not touched. Rollback: supabase/rollback/051_…_rollback.sql.
-- =============================================================================

begin;

create or replace function workflow.mfa_satisfied()
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
           select 1 from auth.mfa_factors f
            where f.user_id = auth.uid() and f.status = 'verified'
         )
$function$;
comment on function workflow.mfa_satisfied() is
  'Platform Brief 005: true when the session is two-step (aal2) or the person has no verified authenticator. Used by two_step_when_enrolled on every workflow table and by the definer functions the app calls.';
revoke all on function workflow.mfa_satisfied() from public, anon;
grant execute on function workflow.mfa_satisfied() to authenticated, service_role;

do $do$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'workflow' and c.relkind in ('r', 'p')
     order by c.relname
  loop
    execute format(
      'create policy two_step_when_enrolled on workflow.%I as restrictive for all to authenticated '
      'using ((select workflow.mfa_satisfied())) with check ((select workflow.mfa_satisfied()))', t.relname);
  end loop;
end
$do$;

CREATE OR REPLACE FUNCTION workflow.assign_project_pic(p_project_id uuid, p_new_pic_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_temp'
AS $function$
begin
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
  if not workflow.is_manager() then
    raise exception 'Only a manager or admin may assign a project''s PIC.';
  end if;

  if p_new_pic_id is null then
    raise exception 'A PIC must be a specific person — use a different action to unassign.';
  end if;

  if not exists (
    select 1 from workflow.members m
    where m.user_id = p_new_pic_id and m.is_active
  ) then
    raise exception 'The selected person is not an active member and cannot be made PIC.';
  end if;

  if not exists (select 1 from workflow.projects where id = p_project_id) then
    raise exception 'No such project.';
  end if;

  update workflow.projects
  set pic_id = p_new_pic_id,
      updated_at = now()
  where id = p_project_id;
end;
$function$;

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
  -- migration 046 additions
  v_cov_system jsonb;
  v_cov_floor jsonb;
  v_cov_system_id uuid;
  v_cov_floor_id uuid;
  v_coverage_added int := 0;
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
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
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

  -- ---------------------------------------------------------------------
  -- 2e. Floor coverage per system — Brief 106 / 17a item 24, migration 046
  -- ---------------------------------------------------------------------
  -- 046 marker: the import proposes coverage, additively and never removing
  --
  -- The shop drawing template names floors per system implicitly: a line
  -- carries a System Type and its floor columns carry quantities. The app
  -- derives the pairs before calling this
  -- (src/lib/progressPerSystem/importCoverage.ts) and passes them inside the
  -- EXISTING p_systems payload as a "floors" array, so this function's
  -- signature does not change and no other caller moves.
  --
  -- ADDITIVE ONLY, AND THAT IS THE POINT. §6.5: "Import is additive only …
  -- never removes a floor from a system. A floor the file no longer names is
  -- listed as 'not in this file, kept'." A re-import is routinely a PARTIAL
  -- file — one system's sheet, or a revision covering three floors of thirty
  -- — and letting it narrow scope here would delete recorded work through
  -- migration 045's cascade.
  --
  -- Shop drawing tier only: contract and tender carry no floors-per-system,
  -- and reading a "floors" key that cannot be there is inventing scope from
  -- silence.
  if p_tier = 'shop_drawing' then
    for v_cov_system in select * from jsonb_array_elements(coalesce(p_systems, '[]'::jsonb))
    loop
      select id into v_cov_system_id
        from workflow.project_systems
       where project_id = p_project_id
         and name = v_cov_system->>'name';

      if v_cov_system_id is not null then
        for v_cov_floor in
          select * from jsonb_array_elements(coalesce(v_cov_system->'floors', '[]'::jsonb))
        loop
          -- Resolved on tower AND label, exactly as the locations block
          -- above does: migration 021 allows the same label under different
          -- towers, so a bare label match would cover an arbitrary one.
          select f.id into v_cov_floor_id
            from workflow.project_floors f
            left join workflow.project_towers tw on tw.id = f.tower_id
           where f.project_id = p_project_id
             and f.label = v_cov_floor->>'floorLabel'
             and coalesce(tw.label, '') = coalesce(v_cov_floor->>'towerLabel', '')
           limit 1;

          -- A floor the file names that does not exist is skipped, not
          -- created: floor proposal is §7's own step, already run above, and
          -- creating one here would turn a typo into a floor.
          if v_cov_floor_id is not null then
            insert into workflow.project_system_floors (project_system_id, floor_id, source)
            values (v_cov_system_id, v_cov_floor_id, 'import')
            on conflict (project_system_id, floor_id) do update
              set removed_at = null
            where workflow.project_system_floors.removed_at is not null;

            if found then
              v_coverage_added := v_coverage_added + 1;
            end if;
          end if;
        end loop;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'linesInserted', v_inserted,
    'linesUpdated', v_updated,
    'floorsCreated', v_floors_created,
    'systemsAdded', v_systems_added,
    'coverageAdded', v_coverage_added
  );
end;
$function$;

CREATE OR REPLACE FUNCTION workflow.get_user_profiles(p_ids uuid[])
 RETURNS TABLE(id uuid, full_name text, username text, telegram_username text, telegram_chat_id text, telegram_linked_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_temp'
AS $function$
begin
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
  if not workflow.is_member() then
    raise exception 'Only a signed-in member may look up member profiles.';
  end if;

  return query
  select p.id, p.full_name, p.username, p.telegram_username, p.telegram_chat_id, p.telegram_linked_at
  from public.user_profiles p
  where p.id = any(p_ids);
end;
$function$;

CREATE OR REPLACE FUNCTION workflow.list_unlinked_accounts()
 RETURNS TABLE(user_id uuid, email text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_temp'
AS $function$
begin
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
  if not workflow.is_manager() then
    raise exception 'Only a manager or admin may view unlinked accounts.';
  end if;

  return query
  select u.id, u.email::text, u.created_at
  from auth.users u
  where not exists (
    select 1 from workflow.members m where m.user_id = u.id
  )
  order by u.created_at asc;
end;
$function$;

CREATE OR REPLACE FUNCTION workflow.record_shop_drawing_check(p_item_id uuid)
 RETURNS workflow.shop_drawing_checks
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_temp'
AS $function$
declare
  v_is_shop_drawing_manager boolean;
  v_next_revision integer;
  v_open_submission_exists boolean;
  v_row workflow.shop_drawing_checks;
begin
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
  -- Guarantee 2 (Brief 084 §3) — ONLY the Shop Drawing team's manager.
  -- Deliberately NOT workflow.is_manager() (that helper also admits
  -- 'admin', and any team) — Brief 084 §2a is explicit: Shop Drawing
  -- AND 'manager' specifically, no admin bypass, no other-team-manager
  -- bypass. Checked directly against workflow.members/workflow.teams,
  -- not composed from an existing helper, because no existing helper
  -- expresses "this specific team AND this specific role" together.
  select exists (
    select 1
    from workflow.members m
    join workflow.teams t on t.id = m.team_id
    where m.user_id = (select auth.uid())
      and m.is_active
      and m.role = 'manager'
      and t.code = 'shop_drawing'
  ) into v_is_shop_drawing_manager;

  if not v_is_shop_drawing_manager then
    raise exception 'Only the Shop Drawing team''s manager may record an internal check.';
  end if;

  -- Guarantee 3 — the check is scoped to a SPECIFIC revision. Rather
  -- than trust a caller-supplied revision number (the same class of
  -- trust problem this whole revision exists to close), this function
  -- DERIVES it the same way a submission's own revision is derived
  -- (Brief 083 §4b's own comment: "current highest revision for this
  -- item, from a SELECT, + 1") — 0 if the item has no submissions yet.
  select coalesce(max(revision) + 1, 0)
  into v_next_revision
  from workflow.shop_drawing_submissions
  where item_id = p_item_id;

  -- Defensive: an item cannot be re-checked while a submission for it is
  -- still open (awaiting return) — checking "ahead" of an in-flight
  -- review has no meaning, since the next real revision does not exist
  -- yet until that open submission is closed (returned with code C).
  select exists (
    select 1
    from workflow.shop_drawing_submissions s
    where s.item_id = p_item_id and s.returned_at is null
  ) into v_open_submission_exists;

  if v_open_submission_exists then
    raise exception 'This item has a submission awaiting return — it cannot be checked again until that submission is closed.';
  end if;

  -- The unique constraint on (item_id, revision) is the backstop against
  -- a duplicate check for the same revision; this explicit check gives a
  -- readable error instead of a raw constraint-violation message.
  if exists (
    select 1 from workflow.shop_drawing_checks
    where item_id = p_item_id and revision = v_next_revision
  ) then
    raise exception 'Revision % of this item has already been checked.', v_next_revision;
  end if;

  -- Guarantee 1 — checked_by/checked_at come from THIS function's own
  -- auth.uid()/now(), never from any argument the caller supplied (this
  -- function takes only p_item_id — there is no checked_by/checked_at
  -- PARAMETER at all, so there is nothing for a caller to lie about).
  insert into workflow.shop_drawing_checks (item_id, revision, checked_by, checked_at)
  values (p_item_id, v_next_revision, (select auth.uid()), now())
  returning * into v_row;

  return v_row;
end;
$function$;

CREATE OR REPLACE FUNCTION workflow.set_project_cad_identity(p_project_id uuid, p_cad_owner_name text, p_cad_consultant_name text, p_drawing_numbering_mode text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_temp'
AS $function$
declare
  v_pic_id uuid;
begin
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
  select pic_id into v_pic_id
  from workflow.projects
  where id = p_project_id;

  if not found then
    raise exception 'No such project.';
  end if;

  if not (workflow.is_superadmin() or v_pic_id = (select auth.uid())) then
    raise exception 'Only this project''s PIC may change its identity fields here.';
  end if;

  -- Same values the column's own CHECK constraint already allows
  -- (migration 032) — checked again here so a bad call raises a plain
  -- exception rather than a raw constraint-violation error, same
  -- reasoning set_project_dates() applies to its own start/target
  -- ordering check.
  if p_drawing_numbering_mode is not null and p_drawing_numbering_mode not in ('adtech', 'client') then
    raise exception 'Numbering mode must be ''adtech'' or ''client''.';
  end if;

  update workflow.projects
  set cad_owner_name = p_cad_owner_name,
      cad_consultant_name = p_cad_consultant_name,
      drawing_numbering_mode = p_drawing_numbering_mode,
      updated_at = now()
  where id = p_project_id;
end;
$function$;

CREATE OR REPLACE FUNCTION workflow.set_project_dates(p_project_id uuid, p_start_date date, p_target_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_temp'
AS $function$
declare
  v_pic_id uuid;
begin
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
  select pic_id into v_pic_id
  from workflow.projects
  where id = p_project_id;

  if not found then
    raise exception 'No such project.';
  end if;

  if not (workflow.is_manager() or v_pic_id = (select auth.uid())) then
    raise exception 'Only this project''s PIC or a manager/admin may set its start/target dates.';
  end if;

  if p_start_date is not null and p_target_date is not null and p_start_date >= p_target_date then
    raise exception 'The start date (%) must be before the target date (%).', p_start_date, p_target_date;
  end if;

  update workflow.projects
  set start_date = p_start_date,
      target_date = p_target_date,
      updated_at = now()
  where id = p_project_id;
end;
$function$;

CREATE OR REPLACE FUNCTION workflow.next_material_approval_ref(p_project_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'workflow', 'pg_catalog', 'public'
AS $function$
declare
  v_seq integer;
begin
  -- Platform Brief 005: a SECURITY DEFINER function bypasses row rules, so it
  -- checks two-step itself (same rule as the table policies).
  if not workflow.mfa_satisfied() then
    raise exception 'two-step sign-in required' using errcode = 'insufficient_privilege';
  end if;
  -- Platform Brief 005 (D5): this was callable by anyone, even signed out.
  if not workflow.is_member() then
    raise exception 'Only a signed-in member may take a material approval reference.' using errcode = 'insufficient_privilege';
  end if;
  -- 043 marker: next_material_approval_ref / MA-nn never reused
  insert into workflow.material_approval_ref_counters (project_id, next_seq)
  values (p_project_id, 2)
  on conflict (project_id) do update set next_seq = workflow.material_approval_ref_counters.next_seq + 1
  returning case when workflow.material_approval_ref_counters.next_seq = 2 then 1
                 else workflow.material_approval_ref_counters.next_seq - 1 end
  into v_seq;

  return 'MA-' || lpad(v_seq::text, 2, '0');
end;
$function$;

-- D5: no public EXECUTE on the four internal-only functions (callers are
-- definer functions/triggers owned by postgres, which keep their rights).
revoke execute on function workflow.compute_project_rollup_percent(uuid) from public, anon, authenticated;
revoke execute on function workflow.project_effective_start_date(uuid) from public, anon, authenticated;
revoke execute on function workflow.recalculate_project_rollup(uuid) from public, anon, authenticated;
revoke execute on function workflow.seed_progress_cells(uuid, uuid) from public, anon, authenticated;
-- The app calls next_material_approval_ref as a signed-in member.
revoke execute on function workflow.next_material_approval_ref(uuid) from public, anon;
grant execute on function workflow.next_material_approval_ref(uuid) to authenticated;

commit;
