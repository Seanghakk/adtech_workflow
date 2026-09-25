-- =============================================================================
-- 044 — Link a procurement line to its contract BOQ line
-- =============================================================================
--
-- Brief 105 §5.1 found that v7.4 §23.8's procurement column could not be
-- built: it says a line "is in <MA-nn>", but material approval packages cover
-- CONTRACT BOQ LINES and workflow.procurement_lines had no link to one. Its
-- only foreign keys were assigned_to, project_id, updated_by and migration
-- 043's own override columns.
--
-- Seanghakk's decision, 25 Sep 2026: one nullable column, no backfill — the
-- same shape migration 040 used for shop_drawing_items.system_id, and for the
-- same reason. A guess about which BOQ line a procurement line came from would
-- be worse than an honest null.
--
-- WHAT THIS MIGRATION DOES NOT DO, AND WHY IT CANNOT
--
-- The brief says to set the column where procurement lines are created from a
-- BOQ. THERE IS NO SUCH CREATION PATH TODAY — checked before writing this, in
-- both directions:
--   · nothing in src/ inserts into procurement_lines (every reference is a
--     .select()); the procurement screen's own header has said since Brief 019
--     that nothing writes to this table from the app;
--   · no database function inserts into it either — workflow.commit_boq_import
--     does not mention procurement_lines at all.
-- Procurement lines are created outside the app. So there is no INSERT here to
-- amend, and this migration adds the column ready for whoever builds that path
-- rather than inventing one. Nothing is backfilled: every existing row keeps a
-- null, which the UI now states as "not linked to a BOQ line" — NEVER as "no
-- material approval", which would be a claim about the approval rather than
-- about the link.
-- =============================================================================

begin;

alter table workflow.procurement_lines
  add column if not exists contract_boq_line_id uuid
    references workflow.contract_boq_lines (id) on delete set null;

comment on column workflow.procurement_lines.contract_boq_line_id is
  'Migration 044 / Brief 105 §5.1. Which contract BOQ line this procurement
   line orders, when that is known. NULLABLE AND NEVER BACKFILLED: a
   procurement line created before this column existed has no recoverable
   link, and guessing one — by matching description text, say — would put a
   wrong MA-nn against a real purchase order. Where it is null the UI says
   the line is not linked to a BOQ line, which is a statement about the LINK;
   it must never be rendered as "no material approval recorded", which would
   be a statement about the APPROVAL and would be false.

   ON DELETE SET NULL, not CASCADE: deleting a BOQ line must never delete a
   purchase order that was already raised against it.';

create index if not exists procurement_lines_contract_boq_line_idx
  on workflow.procurement_lines (contract_boq_line_id);

commit;
