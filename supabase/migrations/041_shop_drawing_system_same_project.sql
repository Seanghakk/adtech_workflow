-- Migration 041 — a drawing's system must belong to the drawing's own
-- project.
--
-- Flagged at the end of migration 040 and left for a decision; taken
-- 25 Sep 2026. 040 added shop_drawing_items.system_id with a plain
-- single-column foreign key, which can say "this is a real system" but
-- NOT "this is a system of THIS project". A drawing on project A could
-- be pointed at a system of project B.
--
-- The app already refuses that twice over — the add form only ever
-- offers the project's own systems, and addShopDrawing re-checks
-- ownership before writing — so this closes the direct-POST path rather
-- than a hole anyone can reach through the screen. It belongs in the
-- database because that is the only place the rule cannot be forgotten.
--
-- HOW IT WORKS. A composite foreign key on (project_id, system_id)
-- pointing at project_systems(project_id, id): the pair must exist
-- together, so a system from another project cannot satisfy it. That
-- needs project_systems to carry a unique key on exactly those two
-- columns, which is what the first statement adds — trivially satisfied,
-- since id is already the primary key and therefore unique on its own.
--
-- NULLS ARE UNAFFECTED. system_id stays nullable, and the FK uses the
-- default MATCH SIMPLE: when any referencing column is NULL the
-- constraint is not checked. So every drawing with no system — which is
-- all of them today, and every row the floor trigger will ever seed —
-- passes without change. Nothing is backfilled and no row is modified.
--
-- THE SINGLE-COLUMN FK IS KEPT, not replaced. Dropping
-- shop_drawing_items_system_id_fkey would make migration 040's own
-- verification (check 4) start reporting FAIL on a re-run, and it is the
-- constraint that carries the explicit ON DELETE RESTRICT. The two
-- overlap; the cost is one extra constraint check per insert and the
-- benefit is that 040's checks stay true.
--
-- SAFE TO APPLY: verified on production read-only immediately before
-- writing this — 0 drawings carry a system_id at all, 0 cross-project
-- pairs exist, and project_systems holds 0 rows. There is nothing for
-- either constraint to reject.

begin;

alter table workflow.project_systems
  add constraint project_systems_project_id_key unique (project_id, id);

comment on constraint project_systems_project_id_key on workflow.project_systems is
  'Migration 041 — exists so shop_drawing_items can carry a composite foreign key on (project_id, system_id). Trivially unique already: id is the primary key.';

alter table workflow.shop_drawing_items
  add constraint shop_drawing_items_system_same_project_fkey
  foreign key (project_id, system_id)
  references workflow.project_systems(project_id, id);

comment on constraint shop_drawing_items_system_same_project_fkey on workflow.shop_drawing_items is
  'Migration 041 — a drawing''s system must belong to the drawing''s own project. MATCH SIMPLE, so a NULL system_id is unconstrained.';

commit;
