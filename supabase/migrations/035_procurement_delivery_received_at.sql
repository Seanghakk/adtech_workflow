-- =============================================================================
-- ADTECH Workflow Tracker — Migration 035: procurement partial-delivery
-- timestamp
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §3 item 9
--
-- CHECKED THE LIVE SCHEMA FIRST: workflow.procurement_lines (migration
-- 001, extended by 015) has delivery_received/delivery_total (both
-- counts) and no timestamp anywhere that records WHEN a delivery
-- actually arrived — po_issued_at is the only delivery-adjacent date,
-- and it never moves once set (Brief 095 §1's own finding: "a PARTIAL
-- delivery updates delivery_received but writes no timestamp anywhere,"
-- which is why the six-list procurement clock still runs from the PO
-- date even after real progress).
--
-- Adds delivery_last_received_at, nullable, no default, no backfill —
-- an existing line's history of past partial deliveries cannot be
-- recovered, so this starts null and is set going forward only.
--
-- SET BY TRIGGER, not left to whichever future code path writes
-- delivery_received to remember to also set the timestamp: this table
-- has no app-code write path at all today (Brief 094's full write-path
-- inventory found none, and procurement/page.tsx's own header says so
-- directly) — every row is populated by something outside this app.
-- workflow.shop_drawing_items had exactly this failure mode until
-- migration 028's trigger fixed it (Brief 095 §1 found that fix, and
-- this table has never had one), and floor_sub_stages needed the same
-- fix from Brief 056 before that — a column whose whole purpose is
-- "when did this last genuinely change" must not depend on every future
-- caller remembering to set it by hand. A BEFORE UPDATE trigger, guarded
-- so it only fires when delivery_received actually changes value, sets
-- it unconditionally regardless of which future code path (this app,
-- or whatever external system writes here today) performs the update.
-- =============================================================================

begin;

alter table workflow.procurement_lines
  add column if not exists delivery_last_received_at timestamptz;

comment on column workflow.procurement_lines.delivery_last_received_at is
  'When delivery_received last actually changed value — set by trigger
   (workflow.procurement_lines_before_update, below), not by whichever
   caller happens to write this row, so it cannot be forgotten the way
   shop_drawing_items.updated_at was before migration 028. Nullable, no
   backfill: an existing line''s own delivery history before this
   migration cannot be recovered. Brief 096 §3 item 9 / Brief 095 §1.';

create or replace function workflow.procurement_lines_before_update()
returns trigger
language plpgsql
security definer
set search_path = workflow, pg_temp
as $$
begin
  if new.delivery_received is distinct from old.delivery_received then
    new.delivery_last_received_at := now();
  end if;
  return new;
end;
$$;

comment on function workflow.procurement_lines_before_update() is
  'Brief 096 §3 item 9. BEFORE UPDATE on workflow.procurement_lines. Sets
   delivery_last_received_at unconditionally whenever delivery_received
   actually changes value, regardless of which caller performs the
   write — same shape as workflow.shop_drawing_items_before_update()
   (migration 028) and workflow.project_milestone_before_write
   (migration 026), this schema''s own established "one trigger bumps a
   timestamp no caller should have to remember" pattern.';

drop trigger if exists procurement_lines_before_update on workflow.procurement_lines;
create trigger procurement_lines_before_update
  before update on workflow.procurement_lines
  for each row
  execute function workflow.procurement_lines_before_update();

commit;
