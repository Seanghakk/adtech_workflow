-- =============================================================================
-- ADTECH Workflow Tracker — Migration 010: cross-member profile lookup,
-- Unlink for the member table.
-- Briefs: ADTECH_WF_Brief_013_Member_Name_Display_Everywhere,
--         ADTECH_WF_Brief_014_Reactivate_Unlink_And_Telegram §3
--
-- CONFIRMED AGAINST THE LIVE SCHEMA FIRST: main is 9b8a286, migration 009
-- applied to prod. This session has no psql/DATABASE_URL/SQL-editor access
-- — the same standing limitation every migration here has documented since
-- Brief 001 — so nothing below is verified by running; see the
-- verification file and this round's Result docs for exactly what could
-- and could not be checked from here.
--
-- TWO UNRELATED FIXES, bundled into one migration because both were found
-- while investigating the same two briefs and both are small:
--
--  1. THE ROOT CAUSE OF BRIEF 013's BUG. public.user_profiles (owned by
--     the CMMS, not this app) has exactly one RLS policy: "Users read own
--     profile", USING (auth.uid() = id) — confirmed by reading the CMMS's
--     own migrations 003/008 directly, not assumed. Every batch lookup
--     this app makes against that table (getUserProfilesByIds, used by
--     every screen that names an owner/PIC/member) goes through the
--     signed-in user's own anon-key session — RLS silently returns
--     nothing for any row that isn't the caller's own, which is why a
--     member's name renders fine to themselves and as a raw id (or, after
--     this migration's app-code half, explicit missing-profile text) to
--     everyone else. This is NOT something migration 006/003's earlier
--     "wrong column name" fix (Fable Brief 002 §4, see user-profiles.ts's
--     own comment) touched — that fix corrected WHICH columns were
--     selected; this fixes WHO is allowed to read them.
--
--     This app has never held a service-role key (confirmed: not in
--     .env.local, and migration 009's own header says explicitly this app
--     has only ever held the anon key). Matching this schema's own
--     established idiom for exactly this situation (migration 009's
--     list_unlinked_accounts, which reads auth.users — a table this app
--     also does not own and cannot get a broader RLS policy on): a
--     SECURITY DEFINER function in `workflow`, checked internally, rather
--     than a service-role client or an RLS policy on someone else's table.
--
--     workflow.get_user_profiles(p_ids uuid[]) returns full_name,
--     username, AND the two Telegram columns (telegram_username,
--     telegram_chat_id, telegram_linked_at) — the extra three are for
--     Brief 014 §4's Telegram column, added here rather than in a second
--     function since it is the exact same privilege problem against the
--     exact same table, and a second SECURITY DEFINER function reading
--     the same row for a different column would be pure duplication.
--     Gated on workflow.is_member(), not is_manager(): every screen that
--     names a person (dashboard, sales monitoring, load, exceptions) is
--     visible to any active member, not just managers, and this function
--     replaces a lookup those screens already made with the anon key.
--
--  2. UNLINK (Brief 014 §3). workflow.members has never had a DELETE
--     grant or policy — migration 002's own blanket grant to
--     `authenticated` was insert/update only, and migration 009's DELETE
--     grant/policies went to six migration-008 tables, not `members`.
--
--     CHECKED FIRST, per §3.1: workflow.progress_updates.author_id and
--     workflow.projects.pic_id both reference public.user_profiles(id)
--     directly (migration 001 lines 554 and 403, migration 006 line 92)
--     — NEVER workflow.members(id). No foreign key anywhere in this
--     schema references workflow.members(id) (grepped every migration
--     file). Deleting a members row therefore orphans nothing: history
--     keeps its author, a project keeps its pic_id value, exactly as
--     before. §3.2's Case A applies — UNLINK is allowed generally,
--     alongside Deactivate, with no history/PIC check required at the
--     database level (the confirmation UI still names the PIC-count
--     consequence per §3.3, matching Deactivate's own pattern, but that
--     is a UI-level warning, not a DB-level block).
--
--     Built as a plain RLS DELETE policy, NOT a third SECURITY DEFINER
--     function: unlike assign_project_pic (migration 009), which needed
--     to narrow an UPDATE to exactly two columns, or list_unlinked_accounts
--     (which reads a table with zero grants to `authenticated` at all), a
--     DELETE has no column-scoping question, and workflow.members already
--     has this exact is_manager()-gated shape for members_update/
--     members_insert (migration 001) — members_delete matches its two
--     siblings on the same table rather than introducing a different
--     mechanism for no reason.
--
-- Wrapped in an explicit transaction, matching every other file here.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. workflow.get_user_profiles — cross-member identity lookup, SECURITY
--    DEFINER so it can read public.user_profiles rows the caller does not
--    own. Any active member may call it (workflow.is_member()) — this is
--    a read of exactly the columns every screen in this app already
--    displays to every member (id, full_name, username, telegram_*),
--    nothing CMMS-role-shaped (Brief 001 §3's "never .role" still holds:
--    that column is not selected here).
-- -----------------------------------------------------------------------------

create or replace function workflow.get_user_profiles(p_ids uuid[])
returns table (
  id uuid,
  full_name text,
  username text,
  telegram_username text,
  telegram_chat_id text,
  telegram_linked_at timestamptz
)
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if not workflow.is_member() then
    raise exception 'Only a signed-in member may look up member profiles.';
  end if;

  return query
  select p.id, p.full_name, p.username, p.telegram_username, p.telegram_chat_id, p.telegram_linked_at
  from public.user_profiles p
  where p.id = any(p_ids);
end;
$$;

comment on function workflow.get_user_profiles(uuid[]) is
  'Brief 013 / Brief 014 §4 — the shared name-and-Telegram lookup every
   screen in this app uses to display an owner/PIC/member. SECURITY
   DEFINER because public.user_profiles carries exactly one RLS policy
   ("Users read own profile", auth.uid() = id) and this app has never
   held a service-role key — see this migration''s own header for how
   that was confirmed against the CMMS''s migrations directly. Gated on
   workflow.is_member(), not is_manager(): name display is not an
   admin-only concern. Read-only; never writes telegram_username or any
   other column — that belongs to the CMMS (Brief 013 §6 / Brief 014
   §4.2/§6).';

-- -----------------------------------------------------------------------------
-- 2. workflow.members — DELETE grant + policy for Unlink (Brief 014 §3).
--    Mirrors members_insert/members_update (migration 001) exactly: same
--    table, same is_manager() gate, same shape. No column-scoping or
--    cross-table check is needed at the database level per §3.2's Case A
--    (nothing is ever orphaned by this delete) — the app still shows a
--    consequence-naming confirmation before calling it (§3.3), same
--    pattern as Deactivate.
-- -----------------------------------------------------------------------------

grant delete on workflow.members to authenticated;

create policy members_delete on workflow.members
  for delete using (workflow.is_manager());

commit;
