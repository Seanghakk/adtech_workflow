-- =============================================================================
-- ADTECH Workflow Tracker — Migration 004: SO registers, pair-unique so_number
-- Brief: ADTECH_WF_Fable_Brief_001_Data_Model_And_Theme_6 §4.5
--
-- PROBLEM (settled 11 Sep 2026, not re-derived here): ADTECH's SO numbering
-- runs VAT and non-VAT as SEPARATE REGISTERS that legitimately share
-- sequence numbers. so_number alone — even scoped by org_id, which is what
-- migration 001's projects_org_so_number_key already did — is NOT unique:
-- the same number can legitimately name two different projects, one in
-- each register. Nothing in the live schema currently prevents that
-- collision, and nothing validates so_number's format at the database
-- level either — migration 001 shipped a comment saying the format CHECK
-- was "NOT enforced by a CHECK here — validated in the app layer instead
-- ... by decision" (src/lib/validation/so-number.ts). This migration
-- restores the format CHECK and adds the register dimension.
--
-- THE SETTLED SHAPE, exactly as specified:
--   1. workflow.so_registers — a lookup table (not a plain column or an
--      enum), per the project's own governing principle (§2.2 of the
--      brief this migration answers): a list that could come back from a
--      discovery session lives in a table. Seeded with the two known rows.
--   2. workflow.projects.so_register_id — FK to it.
--   3. UNIQUE on the PAIR (so_number, so_register_id) — so_number alone
--      is no longer the unique value.
--   4. so_number FORMAT CHECK restored at the database level.
--
-- NULL so_number STAYS COLLISION-FREE — REQUIRED, NOT ACCIDENTAL: Postgres
-- unique indexes treat every NULL as distinct from every other NULL, so
-- multiple projects may sit in the won-but-no-SO-yet state (so_number and
-- so_register_id both null) simultaneously without tripping the new
-- constraint. Verified in 004_so_registers_verify.sql block 5, not merely
-- asserted here — do not "fix" this by making the columns NOT NULL.
--
-- WHAT A CHECK CANNOT DO: a CHECK constraint cannot reach across to another
-- table, so projects_so_number_format_check below validates so_number's
-- OWN SHAPE ONLY — it has no way to know which register a row claims and
-- so cannot validate the number-against-register pairing. Uniqueness (the
-- new index) covers the pairing instead. If the two registers ever needed
-- DIFFERENT number formats, the shape check would have to move to
-- application code — per the brief, they do not today.
--
-- ADDITION BEYOND THE BRIEF'S LITERAL TEXT, FLAGGED: a second CHECK,
-- projects_so_register_pairing_check, requiring so_number and
-- so_register_id to be null or non-null TOGETHER. Not asked for
-- explicitly, but the pair-unique index above is only correct if a row
-- can never carry a number with no register (or a register with no
-- number) — an orphaned half-pair would silently defeat the uniqueness
-- guarantee this migration exists to add. Low risk: every currently-live
-- row already satisfies it (see the backfill step below, which runs
-- BEFORE this CHECK is added).
--
-- GRANTS: none needed here. Migration 002's `alter default privileges in
-- schema workflow grant select on tables to anon, authenticated` / `grant
-- insert, update on tables to authenticated` already covers any table
-- created after it, including workflow.so_registers — see migration 002's
-- own comment on this. Nothing to add or verify beyond confirming that
-- default-privilege grant fired (004_so_registers_verify.sql block 6).
--
-- NOT APPLIED. Paste-ready for the Supabase SQL editor, same as every
-- migration in this project. Applies BY HAND, BEFORE the matching code
-- (already written — see src/lib/validation/so-number.ts, unchanged, and
-- the reconciliation note in Result 001 for this run on §4.4's narrowed
-- permission rule, which is INTENTIONALLY NOT in this file — see that
-- result for why). Wrapped in an explicit transaction.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. SO REGISTERS LOOKUP TABLE
-- -----------------------------------------------------------------------------

create table workflow.so_registers (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null default '00000000-0000-0000-0000-000000000001'
              references workflow.orgs (id),
  code        text not null,
  label_en    text not null,
  label_km    text,
  sort_order  integer not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (org_id, code)
);

comment on table workflow.so_registers is
  'ADTECH runs VAT and non-VAT as separate SO numbering registers that '
  'legitimately share sequence numbers — so_number alone is not the '
  'unique value, (so_number, so_register_id) is (Brief Fable 001 §4.5). '
  'A lookup table, not a boolean/enum column, per the governing '
  'principle: a list a discovery session could hand back lives in a '
  'table. RLS: SELECT policy only, same convention as workflow.teams — '
  'rows are entered by hand in the SQL editor as owner, which bypasses '
  'RLS. Retire a register with is_active, never delete it (the FK below '
  'is ON DELETE RESTRICT).';

comment on column workflow.so_registers.code is
  'Stable, ASCII, never translated — ''vat'' / ''non_vat'' below.';

insert into workflow.so_registers (code, label_en, label_km, sort_order) values
  ('non_vat', 'Non-VAT', null, 10),
  ('vat',     'VAT',     null, 20);

alter table workflow.so_registers enable row level security;

create policy so_registers_select on workflow.so_registers
  for select using (workflow.is_member());

-- -----------------------------------------------------------------------------
-- 2. workflow.projects.so_register_id — FK, nullable (mirrors so_number:
--    a won-but-no-SO-yet project has neither a number nor a register yet).
-- -----------------------------------------------------------------------------

alter table workflow.projects
  add column so_register_id uuid references workflow.so_registers (id) on delete restrict;

comment on column workflow.projects.so_register_id is
  'FK to workflow.so_registers. Nullable together with so_number (see '
  'projects_so_register_pairing_check) — a won job with no SO number yet '
  'has no register either. ON DELETE RESTRICT: retire a register via '
  'so_registers.is_active instead of deleting it.';

-- -----------------------------------------------------------------------------
-- 3. BACKFILL — the two live seed_dev.sql rows that already carry a
--    so_number (AD9001-26S, AD9002-25S; both non-VAT — no "V" before the
--    year) must land in the right register BEFORE the pairing CHECK below
--    is added, or that CHECK fails to apply against the live table. Scoped
--    by the format itself (ADxxxx-Vxx... = vat, ADxxxx-xx... = non-vat),
--    not by naming the two seed rows directly, so this also backfills any
--    other so_number already live that this migration's author does not
--    know about.
-- -----------------------------------------------------------------------------

update workflow.projects
set so_register_id = (
  select id from workflow.so_registers
  where code = case when so_number ~ '^AD[0-9]{4}-V' then 'vat' else 'non_vat' end
)
where so_number is not null
  and so_register_id is null;

-- -----------------------------------------------------------------------------
-- 4. CONSTRAINTS — pairing, format, and the new pair-unique index.
-- -----------------------------------------------------------------------------

alter table workflow.projects
  add constraint projects_so_register_pairing_check
  check ((so_number is null) = (so_register_id is null));

comment on constraint projects_so_register_pairing_check on workflow.projects is
  'so_number and so_register_id are set together or not at all — the '
  'pair-unique index below (projects_org_so_number_register_key) is only '
  'a real guarantee if a number can never exist without its register.';

alter table workflow.projects
  add constraint projects_so_number_format_check
  check (so_number is null or so_number ~ '^AD[0-9]{4}-V?[0-9]{2}[TSCPD]$');

comment on constraint projects_so_number_format_check on workflow.projects is
  'ADxxxx-xx{T|S|C|P|D}, VAT variant carries V before the year '
  '(AD0746-V26S). Restored at the database level (Brief Fable 001 §4.5) — '
  'migration 001 had dropped this in favour of app-layer-only validation '
  '(src/lib/validation/so-number.ts). Keep both in step: two validators '
  'that can disagree is worse than one. Validates so_number''s own shape '
  'only — a CHECK cannot see so_register_id, so it cannot validate the '
  'pairing; uniqueness below covers that.';

drop index workflow.projects_org_so_number_key;

create unique index projects_org_so_number_register_key
  on workflow.projects (org_id, so_number, so_register_id)
  where so_number is not null;

comment on index workflow.projects_org_so_number_register_key is
  'Replaces projects_org_so_number_key (migration 001), which uniqued '
  'so_number alone per org — wrong once VAT/non-VAT registers can share a '
  'sequence number. Partial (where so_number is not null) so multiple '
  'won-but-no-SO-yet projects (so_number null) never collide — Postgres '
  'unique indexes already treat every NULL as distinct, so this ''where'' '
  'clause matches migration 001''s original index for clarity rather than '
  'strict necessity.';

commit;
