-- =============================================================================
-- ADTECH Workflow Tracker — Migration 012: scope_types lookup table, FK-
-- governs stages.scope_type and requests.scope_type, plus write policies
-- for the two lookup tables the new admin screen (Brief 017) makes editable.
-- Brief: ADTECH_WF_Brief_017_Lookup_Table_Admin §2
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST: main is 06b7faf (Brief 015 /
-- migration 011, PR #10). This session has no psql/DATABASE_URL/SQL-editor
-- access — the same standing limitation every migration in this repo has
-- documented since Brief 001 — so nothing below is verified by running;
-- see the verification file and this round's Result doc for exactly what
-- could and could not be checked from here. The brief's own §1 supplies
-- the live row counts and confirmed column shapes this migration is
-- written against, in place of an independent catalog query.
--
-- THREE PARTS:
--
--  1. workflow.scope_types — a new lookup table, same shape as
--     workflow.reason_codes (code, label_en, label_km, sort_order,
--     is_active, created_at — no org_id, no separate uuid id), so the
--     admin screen treats it like any other lookup rather than as a
--     special case (Brief §2.3). Seeded with the five scope types already
--     decided (the trailing letter of the SO number): T/Trading,
--     S/Service, C/CSTC, P/Project, D/Design. label_km seeded with the
--     SAME placeholder convention reason_codes already uses
--     ("[provisional — km TBD: <code>]"), not invented Khmer, and
--     is_active = true on all five, mirroring reason_codes' own seed
--     (migration 001 seeded all 8 reason_codes rows active despite
--     placeholder label_km — the admin screen's "both labels required to
--     activate" rule (Brief §3.6) is an app-layer gate on FUTURE writes
--     through that screen, not a retroactive deactivation of already-live
--     rows; see src/app/(app)/lookups' own comment on this).
--
--  2. JUDGMENT CALL (Brief §2.4 — left to this session, stated here
--     rather than silently decided): stages.scope_type and
--     requests.scope_type become FOREIGN KEYS TO scope_types.code (TEXT),
--     not converted to a uuid FK to a separate id column. Two reasons:
--       a. workflow.scope_types itself is modelled with `code` as its
--          primary key (see Part 1) — exactly mirroring workflow.
--          reason_codes, the closest existing analog (also a
--          stakeholder-owned vocabulary referenced from elsewhere by a
--          plain text column: progress_updates.reason_code -> reason_
--          codes.code). A uuid FK would need a second, redundant unique
--          key on scope_types.code anyway, since both existing columns
--          are themselves plain text values (the SO-number letter) that
--          code, not id, naturally identifies.
--       b. It is the smaller, more readable change against two columns
--          that already hold the letter directly — no representation
--          change to stages/requests beyond adding the constraint.
--     REJECTED: a uuid FK matching workflow.teams/workflow.stages' own
--     convention. Consistent with the SCHEMA's majority convention, but
--     wrong for THIS pair specifically, which already matches reason_
--     codes' pattern far more closely than teams'/stages' uuid-keyed one.
--     Do not do both, per the brief's own instruction.
--
--  3. WRITE POLICIES, is_manager()-gated (Brief §2.6 — editing the
--     vocabulary the whole company works from is an administration act,
--     unlike posting a request, which is_member()-gated). CHECKED FIRST,
--     PER THE BRIEF'S OWN STANDING TRAP (§0): reading migration 001
--     directly (lines ~781-786), workflow.reason_codes ALREADY HAS
--     reason_codes_insert and reason_codes_update, both is_manager()
--     -gated, since its very first migration. Brief §2.6 reads as if all
--     three lookup tables need new write policies this round; only TWO
--     actually do — workflow.stages (select-only since migration 001) and
--     the new workflow.scope_types (no policies exist yet, it doesn't
--     exist yet). Nothing is added for reason_codes here; adding a
--     redundant CREATE POLICY would either no-op-fail against an existing
--     policy name or (worse) silently duplicate it — corrected in the
--     Result rather than reproducing the brief's premise uncritically.
--
--     NO DELETE POLICY, ANYWHERE, THIS ROUND — Brief §3.5's own
--     "deactivate, never delete" is the default; a row that has never
--     been referenced MAY be deleted per that section, but establishing
--     "never referenced" cheaply differs per table (stages: checked
--     against projects.current_stage_id AND requests.current_stage_id;
--     scope_types: checked against stages.scope_type AND requests.
--     scope_type; reason_codes: checked against progress_updates.
--     reason_code) and no DELETE grant exists on `authenticated` for ANY
--     table in this schema yet (§0's own standing trap — migration 002's
--     blanket grant is INSERT/UPDATE only; migration 009 is the one
--     precedent for adding a DELETE grant, scoped to exactly six named
--     tables for a real, asked-for delete affordance). Adding one here for
--     three more tables, on spec, for a "may delete if provably unused"
--     affordance nothing in the UI actually offers this round, is more
--     surface than the brief's "if you can establish that cheaply, offer
--     it" clause justifies. Deactivate-only this round; said plainly in
--     the Result per §3.5's own instruction.
--
-- GRANTS: none needed. Migration 002's `alter default privileges in
-- schema workflow grant select on tables to anon, authenticated` / `grant
-- insert, update on tables to authenticated` already covers workflow.
-- scope_types (created after that statement ran) automatically, and
-- workflow.stages already held its INSERT/UPDATE grant from migration
-- 002's original blanket grant (stages predates 002). Nothing to add here
-- — same reasoning migration 005 documented for workflow.so_registers.
--
-- PRE-FLIGHT, TO RUN BY HAND BEFORE APPLYING (cannot be run from this
-- session — see header): the new FK on requests.scope_type will fail to
-- apply if any live row holds a value outside {T,S,C,P,D}. Expected to be
-- a no-op in practice — no app code has ever written requests.scope_type
-- (Brief 015's postRequest() insert, src/app/(app)/requests/new/actions.ts,
-- does not include it; scope_type was "left off screen 1a's form" per
-- this brief's own §2.1), so the one live requests row should hold NULL,
-- which a nullable FK always permits. Confirm before applying:
--   select id, scope_type from workflow.requests
--   where scope_type is not null and scope_type not in ('T','S','C','P','D');
-- Expect 0 rows. workflow.stages needs no such check — it has zero rows.
--
-- DO NOT APPLY — paste-ready for the Supabase SQL editor, same as every
-- migration in this project. The rollback is tested first on
-- `adtech-workflow-rollback-test` (001-011 plus a stub public.user_profiles:
-- id, username, full_name, created_at, telegram_username, telegram_chat_id,
-- telegram_linked_at — per this brief's own §2.5). Wrapped in an explicit
-- transaction, matching every other file here.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.scope_types
-- -----------------------------------------------------------------------------

create table workflow.scope_types (
  code        text primary key,
  label_en    text not null,
  label_km    text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table workflow.scope_types is
  'The org''s scope-type vocabulary — the trailing letter of the SO number '
  '(Brief 017 §2.3), previously an ungoverned plain-text column on both '
  'workflow.stages and workflow.requests. Same shape as workflow.'
  'reason_codes (code as primary key, no org_id, no separate uuid id) '
  'rather than workflow.teams/workflow.stages'' uuid-keyed shape — see '
  'migration 012''s own header for why. RLS: SELECT for any active '
  'member, INSERT/UPDATE for a manager or admin only (workflow.'
  'is_manager()) — administration act, not a per-request write. No '
  'DELETE policy; retire a row via is_active.';

comment on column workflow.scope_types.code is
  'Stable, ASCII, single-letter, never translated or renamed after '
  'creation (Brief 017 §3.4) — stages.scope_type and requests.scope_type '
  'both FK to this column.';

comment on column workflow.scope_types.label_km is
  'NOT NULL, matching workflow.reason_codes'' own shape — see that '
  'table''s seed for the same placeholder convention used below.';

insert into workflow.scope_types (code, label_en, label_km, sort_order, is_active) values
  ('T', 'Trading', '[provisional — km TBD: T]', 10, true),
  ('S', 'Service', '[provisional — km TBD: S]', 20, true),
  ('C', 'CSTC',    '[provisional — km TBD: C]', 30, true),
  ('P', 'Project', '[provisional — km TBD: P]', 40, true),
  ('D', 'Design',  '[provisional — km TBD: D]', 50, true);

alter table workflow.scope_types enable row level security;

create policy scope_types_select on workflow.scope_types
  for select using (workflow.is_member());
create policy scope_types_insert on workflow.scope_types
  for insert with check (workflow.is_manager());
create policy scope_types_update on workflow.scope_types
  for update using (workflow.is_manager()) with check (workflow.is_manager());

-- -----------------------------------------------------------------------------
-- 2. WIRE BOTH EXISTING REFERENCES (Brief §2.4) — text FK to scope_types.code,
--    per the judgment call in this file's own header.
-- -----------------------------------------------------------------------------

alter table workflow.stages
  add constraint stages_scope_type_fkey
  foreign key (scope_type) references workflow.scope_types (code) on delete restrict;

comment on column workflow.stages.scope_type is
  'FK to workflow.scope_types(code) as of migration 012 (previously an '
  'ungoverned plain text column, migration 001). NOT NULL — every stage '
  'belongs to exactly one scope type. ON DELETE RESTRICT: retire a scope '
  'type via scope_types.is_active instead of deleting it.';

alter table workflow.requests
  add constraint requests_scope_type_fkey
  foreign key (scope_type) references workflow.scope_types (code) on delete restrict;

comment on column workflow.requests.scope_type is
  'FK to workflow.scope_types(code) as of migration 012 (previously an '
  'ungoverned plain text column, migration 001). Nullable — a request in '
  'triage or predating this governance may carry no scope type yet. ON '
  'DELETE RESTRICT: retire a scope type via scope_types.is_active instead '
  'of deleting it. Still not written by any app code as of this round '
  '(screen 1a''s own form, Brief 015, does not set it) — that gap is '
  'unchanged by this migration; see the Result doc.';

-- -----------------------------------------------------------------------------
-- 3. WRITE POLICIES FOR workflow.stages (§2.6) — select-only since
--    migration 001, no insert/update policy exists yet. reason_codes is
--    deliberately untouched here — see this file's own header, part 3.
-- -----------------------------------------------------------------------------

create policy stages_insert on workflow.stages
  for insert with check (workflow.is_manager());
create policy stages_update on workflow.stages
  for update using (workflow.is_manager()) with check (workflow.is_manager());

commit;
