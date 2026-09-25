-- =============================================================================
-- 043 — Material approval (Brief 105 / v7.4 §23, schema items 17a 9–14)
-- =============================================================================
--
-- QC's material inspection asks whether what arrived matches THE MATERIAL
-- APPROVAL. That approval has only ever existed on paper, so the app asked an
-- inspector to check against a document it did not hold, and a failed material
-- inspection could not name what the material was supposed to be. This is the
-- schema that lets it.
--
-- Five tables and two sets of links out, as 17a items 9–14 list them. It
-- deliberately mirrors migrations 027/028 (shop drawings) rather than inventing
-- a second shape: §23.2 says the lifecycle IS §9's, with three differences —
-- no internal check, a product per revision, and approvals recorded from paper.
-- Where a rule is the same, the SQL is the same, so the two cannot drift.
--
-- Rules followed, as established over migrations 028–042:
--   · every new column on an EXISTING table is nullable with no default, and
--     nothing is backfilled — existing rows keep working untouched;
--   · RLS on every new table, matching §23.6's permissions exactly: QC and the
--     PIC write, everyone with project access reads, Procurement additionally
--     attaches documents. Never broader;
--   · the submission row is immutable except for completing the return, and
--     that is enforced HERE, not only in the application (migration 027's own
--     trigger is the model);
--   · preparing_started_at is written by the database the first time a package
--     leaves not started, by ANY route — never backfilled, never guessed;
--   · the package reference is generated per project and NEVER reused,
--     including after a deletion;
--   · a contract BOQ line sits in at most one package — a unique constraint,
--     not an application check.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. The package
-- -----------------------------------------------------------------------------

create table if not exists workflow.material_approval_packages (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references workflow.projects (id) on delete cascade,

  -- MA-01, MA-02 … generated per project. See the counter table below: the
  -- sequence is never rewound, so a deleted package's reference is retired
  -- with it rather than being handed to the next one. A reference that has
  -- appeared on a submittal sent to a consultant must never name something
  -- else afterwards.
  ref                 text not null,

  title               text not null,
  system_id           uuid references workflow.project_systems (id) on delete set null,

  -- §23.4 / §5.1 of the brief — a package with no contract line is allowed (a
  -- substitute, a variation, a sample) and requires a written reason. The
  -- constraint that ties the two together is at the bottom of this file, since
  -- it has to see the lines table.
  outside_boq_reason  text,

  -- §23.2 / §9.4 — written by the trigger below the first time the package
  -- leaves not started, by ANY route. Permanently NULL for a paper approval,
  -- which is what "not recorded — approved before tracking" reads from.
  preparing_started_at timestamptz,

  -- 'tracked' — the app watched it happen. 'paper' — it happened before the
  -- app existed and was recorded from the stamp. A paper package has no
  -- clocks, is A or B only, and is never offered C (§23.2, §5.3).
  source              text not null default 'tracked',

  current_rev         integer not null default 0,

  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) on delete set null,

  constraint material_approval_packages_ref_unique unique (project_id, ref),
  constraint material_approval_packages_source_check
    check (source in ('tracked', 'paper')),
  constraint material_approval_packages_current_rev_check check (current_rev >= 0),
  -- A paper approval never has a start: §5.3 says both clocks read "not
  -- recorded — approved before tracking", permanently. Enforced rather than
  -- trusted, because a start that appears later becomes evidence in a delay
  -- dispute.
  constraint material_approval_packages_paper_has_no_start_check
    check (source <> 'paper' or preparing_started_at is null)
);

comment on table workflow.material_approval_packages is
  'Migration 043 / Brief 105, v7.4 §23. One package groups the contract BOQ
   lines of ONE product and goes to the client, consultant or main contractor
   for approval as a whole file — one package, one return, one code (§23.1a).
   There is deliberately no status column: §23.2 says state is derived from
   the recordings only, because packages have no legacy manual status to keep
   working, unlike shop drawings.';

comment on column workflow.material_approval_packages.preparing_started_at is
  'v7.4 §23.2 / §9.4. Written by material_approval_revision_started() the first
   time the package leaves not started, by ANY route. NEVER backfilled and
   never guessed — where it is NULL the screen renders the words "start not
   recorded" in place of a number and omits the proportion bar. Substituting a
   proxy (the first submission date, created_at, the earliest audit row, 0)
   would invent a with-us figure that is then quoted in a delay dispute, which
   is the one thing this must not do.';

-- The reference counter. A separate table rather than max(ref)+1 precisely
-- because max() over the live rows REUSES a deleted package's number.
create table if not exists workflow.material_approval_ref_counters (
  project_id uuid primary key references workflow.projects (id) on delete cascade,
  next_seq   integer not null default 1,
  constraint material_approval_ref_counters_next_seq_check check (next_seq >= 1)
);

comment on table workflow.material_approval_ref_counters is
  'Migration 043. Monotonic per-project counter behind MA-nn. Never decremented
   and never reset, including when a package is deleted — 17a item 9 requires
   the reference to be NEVER REUSED, and a reference that has been on a
   submittal sent outside ADTECH must not later name a different package.';

create or replace function workflow.next_material_approval_ref(p_project_id uuid)
returns text
language plpgsql
security definer
set search_path = workflow, pg_catalog, public
as $function$
declare
  v_seq integer;
begin
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

comment on function workflow.next_material_approval_ref(uuid) is
  'Migration 043 / 17a item 9. Hands out the next MA-nn for a project and
   advances the counter in the same statement. SECURITY DEFINER so the counter
   row itself needs no policy of its own.';

-- -----------------------------------------------------------------------------
-- 2. Package lines — 17a item 10
-- -----------------------------------------------------------------------------

create table if not exists workflow.material_approval_package_lines (
  id                   uuid primary key default gen_random_uuid(),
  package_id           uuid not null
                         references workflow.material_approval_packages (id) on delete cascade,
  contract_boq_line_id uuid not null
                         references workflow.contract_boq_lines (id) on delete cascade,

  -- §23.4 / §5.2 — re-importing the contract BOQ NEVER removes a line from a
  -- package. A line the new file no longer names is marked here instead of
  -- being deleted, and keeps showing on the package as "no longer in the
  -- contract BOQ".
  removed_from_boq_at  timestamptz,

  created_at           timestamptz not null default now(),

  -- 17a item 10 — a line sits in at most one package. A constraint, not an
  -- application check, so no concurrent add can slip a second one past it.
  constraint material_approval_package_lines_line_unique unique (contract_boq_line_id)
);

comment on column workflow.material_approval_package_lines.removed_from_boq_at is
  'v7.4 §23.4. Set by a contract BOQ re-import that no longer names this line.
   The row is NEVER deleted by an import — the package keeps the line and shows
   "no longer in the contract BOQ" against it, because a submittal that was
   already sent covered that line whatever the new file says.';

-- -----------------------------------------------------------------------------
-- 3. Revisions — 17a item 11. Each revision names its own product.
-- -----------------------------------------------------------------------------

create table if not exists workflow.material_approval_revisions (
  id           uuid primary key default gen_random_uuid(),
  package_id   uuid not null
                 references workflow.material_approval_packages (id) on delete cascade,
  rev          integer not null,

  -- §23.2 — "a rejected material is often replaced, not revised", so the
  -- product lives on the REVISION, not on the package. The drawer and history
  -- show "product changed" when a revision differs from the one before.
  manufacturer text,
  product      text,
  model        text,

  -- NULL until "Start preparing" — this is what "not started" means, and what
  -- the package's own preparing_started_at trigger keys off.
  started_at   timestamptz,

  created_at   timestamptz not null default now(),

  constraint material_approval_revisions_rev_unique unique (package_id, rev),
  constraint material_approval_revisions_rev_check check (rev >= 0)
);

-- -----------------------------------------------------------------------------
-- 4. Submissions — 17a item 12. Immutable except for completing the return.
-- -----------------------------------------------------------------------------

create table if not exists workflow.material_approval_submissions (
  id           uuid primary key default gen_random_uuid(),
  revision_id  uuid not null
                 references workflow.material_approval_revisions (id) on delete cascade,

  -- The §9 enum, reused rather than re-declared (17a: "no new lookup table:
  -- party reuses the §9 enum"). Same four values as
  -- shop_drawing_submissions.reviewer_party.
  party        text not null,
  org          text,

  -- NULL for a paper approval — §5.3: "no start date or send date is asked
  -- for, and none is guessed."
  sent_on      date,

  returned_on  date,
  code         text,
  comments     text,

  recorded_by  uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint material_approval_submissions_party_check
    check (party in ('client', 'consultant', 'main_contractor', 'other')),
  constraint material_approval_submissions_code_check
    check (code is null or code in ('A', 'B', 'C')),
  -- Open means no code; returned means both. Filled in together, exactly once,
  -- by the same action — migration 027's own shape.
  constraint material_approval_submissions_return_shape_check
    check ((returned_on is null and code is null) or (returned_on is not null and code is not null)),
  constraint material_approval_submissions_returned_after_sent_check
    check (sent_on is null or returned_on is null or returned_on >= sent_on),
  -- A paper approval is a closed record on arrival: no send date, and it must
  -- already carry its return. §5.3 — never a C.
  constraint material_approval_submissions_paper_shape_check
    check (sent_on is not null or (returned_on is not null and code in ('A', 'B')))
);

comment on table workflow.material_approval_submissions is
  'Migration 043 / 17a item 12. Written once when sent, completed once when
   returned, then closed — enforced by the trigger below exactly as migration
   027 does for shop drawing submissions, not merely documented. A paper
   approval (§23.2) arrives as a single already-returned row with sent_on NULL
   and code A or B; it is closed from birth and has no clocks.';

create or replace function workflow.material_approval_submissions_before_update()
returns trigger
language plpgsql
as $function$
begin
  -- 043 marker: material approval submission immutable except the return
  new.updated_at := now();

  if new.revision_id is distinct from old.revision_id
    or new.party is distinct from old.party
    or new.org is distinct from old.org
    or new.sent_on is distinct from old.sent_on
    or new.recorded_by is distinct from old.recorded_by
  then
    raise exception 'Only returned_on, code and comments may be set on an existing material approval submission — every other field is fixed when it is sent.';
  end if;

  if old.returned_on is not null then
    raise exception 'This material approval submission has already been returned and is closed — record a new revision instead of changing it.';
  end if;

  return new;
end;
$function$;

create trigger material_approval_submissions_before_update
  before update on workflow.material_approval_submissions
  for each row
  execute function workflow.material_approval_submissions_before_update();

-- -----------------------------------------------------------------------------
-- 5. Documents — 17a item 13
-- -----------------------------------------------------------------------------

create table if not exists workflow.material_approval_documents (
  id          uuid primary key default gen_random_uuid(),
  revision_id uuid not null
                references workflow.material_approval_revisions (id) on delete cascade,
  kind        text not null,
  file        text not null,
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now(),

  constraint material_approval_documents_kind_check
    check (kind in ('datasheet', 'submittal', 'returned_stamp', 'paper_scan'))
);

-- -----------------------------------------------------------------------------
-- 6. preparing_started_at — written by the DATABASE, by any route
-- -----------------------------------------------------------------------------

create or replace function workflow.material_approval_revision_started()
returns trigger
language plpgsql
as $function$
begin
  -- 043 marker: preparing_started_at written once, never backfilled
  -- The first time ANY revision of this package acquires a started_at, the
  -- package's own clock starts. coalesce means a later revision can never
  -- move it: §9.4's rule is that the start is written once and is then
  -- permanent, whatever route set it.
  if new.started_at is not null
     and (tg_op = 'INSERT' or old.started_at is null)
  then
    update workflow.material_approval_packages p
       set preparing_started_at = coalesce(p.preparing_started_at, new.started_at)
     where p.id = new.package_id
       and p.source <> 'paper';
  end if;

  return new;
end;
$function$;

comment on function workflow.material_approval_revision_started() is
  'Migration 043 / Brief 105 §3. v7.4 §23.2 requires preparing_started_at to be
   written by the DATABASE the first time a package leaves not started, by any
   route — the same rule as drafting_started_at and for the same reason. Paper
   packages are excluded: §5.3 gives them no clocks at all, permanently.';

create trigger material_approval_revision_started
  after insert or update of started_at on workflow.material_approval_revisions
  for each row
  execute function workflow.material_approval_revision_started();

-- -----------------------------------------------------------------------------
-- 7. The links out — 17a item 14. Nullable, no default, nothing backfilled.
-- -----------------------------------------------------------------------------

alter table workflow.qc_inspections
  add column if not exists approval_package_id uuid
    references workflow.material_approval_packages (id) on delete set null;

comment on column workflow.qc_inspections.approval_package_id is
  'Migration 043 / v7.4 §23.8. Which material approval this inspection checked
   the delivered material against. Nullable and never backfilled: every
   inspection recorded before this migration genuinely checked against a paper
   approval, and saying so honestly is the point. A missing approval NEVER
   blocks an inspection (§5.5).';

alter table workflow.procurement_lines
  add column if not exists raised_before_approval boolean,
  add column if not exists override_accepted_by uuid references auth.users (id) on delete set null,
  add column if not exists override_accepted_at timestamptz,
  add column if not exists override_package_id uuid
    references workflow.material_approval_packages (id) on delete set null,
  add column if not exists override_revision_id uuid
    references workflow.material_approval_revisions (id) on delete set null;

comment on column workflow.procurement_lines.raised_before_approval is
  'Migration 043 / v7.4 §23.8 / §5.4. Written ONLY when the "Not approved yet"
   warning was overridden, and never edited afterwards — the record stays
   visible on the line for good and appears in the package history against the
   revision that was open at the time. A missing approval never blocks the PO;
   it is recorded, not prevented.';

-- -----------------------------------------------------------------------------
-- 8. The outside-BOQ reason rule — §23.4 / brief §5.1
-- -----------------------------------------------------------------------------
--
-- "A package with no contract line is allowed and requires one sentence." A
-- CHECK cannot see another table, so this is a constraint trigger: it fires at
-- the end of the statement, by which time the lines (if any) have been
-- inserted alongside the package.

create or replace function workflow.material_approval_package_reason_required()
returns trigger
language plpgsql
as $function$
declare
  v_lines integer;
begin
  -- 043 marker: a package with no contract line must say why
  select count(*) into v_lines
    from workflow.material_approval_package_lines l
   where l.package_id = new.id;

  if v_lines = 0 and coalesce(btrim(new.outside_boq_reason), '') = '' then
    raise exception 'A material approval package with no contract BOQ line must say why — a substitute, a variation or a sample, in one sentence.';
  end if;

  return new;
end;
$function$;

create constraint trigger material_approval_package_reason_required
  after insert or update on workflow.material_approval_packages
  deferrable initially deferred
  for each row
  execute function workflow.material_approval_package_reason_required();

-- -----------------------------------------------------------------------------
-- 9. RLS — §23.6 exactly. QC and the PIC write; project access reads;
--    Procurement additionally attaches documents.
-- -----------------------------------------------------------------------------

alter table workflow.material_approval_packages      enable row level security;
alter table workflow.material_approval_package_lines enable row level security;
alter table workflow.material_approval_revisions     enable row level security;
alter table workflow.material_approval_submissions   enable row level security;
alter table workflow.material_approval_documents     enable row level security;
alter table workflow.material_approval_ref_counters  enable row level security;

-- Readable by anyone who can see the project, using the SAME expression
-- contract_boq_lines already uses — so "project access" cannot come to mean
-- two different things in two places.
create policy material_approval_packages_select on workflow.material_approval_packages
  for select using (
    workflow.is_member()
    and exists (
      select 1 from workflow.projects p
       where p.id = material_approval_packages.project_id
         and workflow.can_view_project(p.client_id, p.is_maintenance_contract)
    )
  );

-- §23.6 — QC and the PIC, and nobody else. Procurement is deliberately absent
-- here and present only on documents.
create policy material_approval_packages_write on workflow.material_approval_packages
  for all using (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.projects p
       where p.id = material_approval_packages.project_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.projects p
       where p.id = material_approval_packages.project_id
         and p.pic_id = (select auth.uid())
    )
  );

create policy material_approval_package_lines_select on workflow.material_approval_package_lines
  for select using (
    exists (select 1 from workflow.material_approval_packages p
             where p.id = material_approval_package_lines.package_id)
  );

create policy material_approval_package_lines_write on workflow.material_approval_package_lines
  for all using (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.material_approval_packages mp
        join workflow.projects p on p.id = mp.project_id
       where mp.id = material_approval_package_lines.package_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.material_approval_packages mp
        join workflow.projects p on p.id = mp.project_id
       where mp.id = material_approval_package_lines.package_id
         and p.pic_id = (select auth.uid())
    )
  );

create policy material_approval_revisions_select on workflow.material_approval_revisions
  for select using (
    exists (select 1 from workflow.material_approval_packages p
             where p.id = material_approval_revisions.package_id)
  );

create policy material_approval_revisions_write on workflow.material_approval_revisions
  for all using (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.material_approval_packages mp
        join workflow.projects p on p.id = mp.project_id
       where mp.id = material_approval_revisions.package_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.material_approval_packages mp
        join workflow.projects p on p.id = mp.project_id
       where mp.id = material_approval_revisions.package_id
         and p.pic_id = (select auth.uid())
    )
  );

create policy material_approval_submissions_select on workflow.material_approval_submissions
  for select using (
    exists (select 1 from workflow.material_approval_revisions r
             where r.id = material_approval_submissions.revision_id)
  );

create policy material_approval_submissions_write on workflow.material_approval_submissions
  for all using (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.material_approval_revisions r
        join workflow.material_approval_packages mp on mp.id = r.package_id
        join workflow.projects p on p.id = mp.project_id
       where r.id = material_approval_submissions.revision_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() = 'qc'
    or exists (
      select 1 from workflow.material_approval_revisions r
        join workflow.material_approval_packages mp on mp.id = r.package_id
        join workflow.projects p on p.id = mp.project_id
       where r.id = material_approval_submissions.revision_id
         and p.pic_id = (select auth.uid())
    )
  );

create policy material_approval_documents_select on workflow.material_approval_documents
  for select using (
    exists (select 1 from workflow.material_approval_revisions r
             where r.id = material_approval_documents.revision_id)
  );

-- §23.6's one widening, and the ONLY one: "Attach documents — Also
-- Procurement." Both procurement teams, since this schema has two.
create policy material_approval_documents_write on workflow.material_approval_documents
  for all using (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['qc', 'procurement_local', 'procurement_overseas'])
    or exists (
      select 1 from workflow.material_approval_revisions r
        join workflow.material_approval_packages mp on mp.id = r.package_id
        join workflow.projects p on p.id = mp.project_id
       where r.id = material_approval_documents.revision_id
         and p.pic_id = (select auth.uid())
    )
  ) with check (
    workflow.is_superadmin()
    or workflow.current_team() = any (array['qc', 'procurement_local', 'procurement_overseas'])
    or exists (
      select 1 from workflow.material_approval_revisions r
        join workflow.material_approval_packages mp on mp.id = r.package_id
        join workflow.projects p on p.id = mp.project_id
       where r.id = material_approval_documents.revision_id
         and p.pic_id = (select auth.uid())
    )
  );

-- The counter is reached only through next_material_approval_ref(), which is
-- SECURITY DEFINER. No policy admits anyone directly: RLS is on with no
-- permissive policy, which denies every ordinary caller.
comment on table workflow.material_approval_ref_counters is
  'Migration 043. RLS enabled with NO policy on purpose — every legitimate read
   and write goes through workflow.next_material_approval_ref(), which is
   SECURITY DEFINER. Nothing else may touch the counter, because rewinding it
   would reissue a reference that has already gone outside ADTECH.';

create index if not exists material_approval_packages_project_idx
  on workflow.material_approval_packages (project_id);
create index if not exists material_approval_package_lines_package_idx
  on workflow.material_approval_package_lines (package_id);
create index if not exists material_approval_revisions_package_idx
  on workflow.material_approval_revisions (package_id);
create index if not exists material_approval_submissions_revision_idx
  on workflow.material_approval_submissions (revision_id);
create index if not exists material_approval_documents_revision_idx
  on workflow.material_approval_documents (revision_id);

commit;
