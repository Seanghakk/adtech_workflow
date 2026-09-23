-- =============================================================================
-- ADTECH Workflow Tracker — Migration 034: BOQ item-number import key
-- Brief: ADTECH_WF_Brief_096_Schema_Batch_For_v7.1_Screens §3 item 6
--
-- CHECKED THE LIVE SCHEMA FIRST: none of the three BOQ tiers (migration
-- 018's own three-tier schema) carries an item-number column under any
-- name — contract_boq_lines, tender_boq_lines, and shop_drawing_boq_lines
-- were all read directly; none has anything resembling "1.2.3".
--
-- DECIDED 22 Sep 2026 (per this brief's own §3 item 6): the ADTECH BOQ
-- template always carries an item-number column, and a re-import matches
-- on it so a second import updates lines instead of duplicating them.
-- Adds `item_number` to all three tables — "the BOQ tier" is which of
-- the three tables a line lives in, so uniqueness is scoped to
-- (project_id, item_number) WITHIN each table individually, exactly the
-- same partial-unique-index shape as this brief's other two uniqueness
-- additions (project_floors.drawing_code, shop_drawing_items.
-- drawing_number) — nullable, no backfill.
--
-- EXISTING ROWS WITH NO ITEM NUMBER, checked directly on production
-- before writing this file: contract_boq_lines has 1 row, tender_boq_
-- lines and shop_drawing_boq_lines have 0. All three would have
-- item_number = null after this migration, exactly as every other new
-- column in this brief is left. See this brief's own Result doc §5 for
-- the recommendation on what should happen to them (not carried out
-- here — this migration adds the column only, no data touched).
-- =============================================================================

begin;

alter table workflow.contract_boq_lines
  add column if not exists item_number text;
create unique index if not exists contract_boq_lines_item_number_per_project_key
  on workflow.contract_boq_lines (project_id, item_number)
  where item_number is not null;
comment on column workflow.contract_boq_lines.item_number is
  'The BOQ template''s own item-number column (e.g. "1.2.3") — the key a
   re-import matches an existing line on, so a second import updates
   rather than duplicates. Nullable, no backfill (Brief 096 §3 item 6);
   unique within a project where set.';

alter table workflow.tender_boq_lines
  add column if not exists item_number text;
create unique index if not exists tender_boq_lines_item_number_per_project_key
  on workflow.tender_boq_lines (project_id, item_number)
  where item_number is not null;
comment on column workflow.tender_boq_lines.item_number is
  'Same as workflow.contract_boq_lines.item_number — see that column''s
   own comment.';

alter table workflow.shop_drawing_boq_lines
  add column if not exists item_number text;
create unique index if not exists shop_drawing_boq_lines_item_number_per_project_key
  on workflow.shop_drawing_boq_lines (project_id, item_number)
  where item_number is not null;
comment on column workflow.shop_drawing_boq_lines.item_number is
  'Same as workflow.contract_boq_lines.item_number — see that column''s
   own comment.';

commit;
