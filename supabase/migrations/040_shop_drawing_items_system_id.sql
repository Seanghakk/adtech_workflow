-- Brief 102 follow-up — a drawing's system.
--
-- Decided 25 Sep 2026, after Brief 102 stopped on it: ONE nullable
-- system_id on workflow.shop_drawing_items, referencing
-- workflow.project_systems (Brief 098's table).
--
-- WHY IT IS NEEDED. Brief 102 §3.2 asks the "Add a shop drawing" form to
-- offer a system from the project's systems, and there was nowhere to
-- put the answer, so the form did not ask. This closes that.
--
-- It is also the missing input to v7.2 §8.2's drawing-number format:
--     {SO}-ADT-{SYSTEM}-{LEVEL}-DR-{DISCIPLINE}-{NNNN}
-- where {SYSTEM} is the Part 1 system code — which is exactly
-- project_systems.cad_code. §8.3 already warns "n systems with no CAD
-- code"; until now a drawing had no system for that code to come from.
--
-- SEPARATE MIGRATION, not an amendment to 039. 039's production copy is
-- already in Drive and may have been applied. Editing a migration whose
-- production copy is out in the world is precisely how the superseded
-- Brief 098 file reached production under Brief 099.
--
-- SCOPE, deliberately narrow. This is the system of a DRAWING and
-- nothing else. "Progress by system" — the Brief 100 Part D bar — needs
-- a system on the WORK (sub-stages, procurement lines), which is a
-- separate decision and is NOT folded in here.
--
-- NULLABLE, NO BACKFILL. Every existing drawing was seeded by the floor
-- trigger with no system, and there is no honest way to guess which
-- system a layout drawing belongs to. They stay NULL and the screen says
-- so, the same way created_by does.
--
-- ON DELETE RESTRICT, matching every other FK in this schema: a system
-- that a drawing points at cannot be deleted out from under it.

begin;

alter table workflow.shop_drawing_items
  add column if not exists system_id uuid
    references workflow.project_systems(id) on delete restrict;

comment on column workflow.shop_drawing_items.system_id is
  'Brief 102 follow-up — which of the project''s systems this drawing is for (workflow.project_systems). NULL on every row the floor trigger seeded and on anything predating this migration; no value is guessed for them. Supplies the {SYSTEM} part of v7.2 §8.2''s drawing-number format via project_systems.cad_code.';

-- Finding a project's drawings-by-system is the read this column exists
-- for, and it is always scoped to one project.
create index if not exists shop_drawing_items_system_id_idx
  on workflow.shop_drawing_items (project_id, system_id)
  where system_id is not null;

commit;

-- NOT DONE HERE, AND FLAGGED INSTEAD — a plain FK cannot express "the
-- system must belong to the SAME project as the drawing". A drawing on
-- project A could be pointed at a system of project B by a direct POST;
-- the form only ever offers the project's own systems, and the server
-- action re-checks ownership before writing, so this is belt and braces
-- rather than an open hole.
--
-- The database-level fix is a composite foreign key, which would need
-- project_systems to carry a matching unique key:
--
--   alter table workflow.project_systems
--     add constraint project_systems_id_project_key unique (id, project_id);
--
--   alter table workflow.shop_drawing_items
--     add constraint shop_drawing_items_system_same_project_fkey
--     foreign key (project_id, system_id)
--     references workflow.project_systems(project_id, id);
--
-- Both are safe to apply (id is already the primary key, so the unique
-- constraint is trivially satisfied, and no existing row has a
-- system_id at all). It is left out because this change was asked for as
-- one nullable column, and a second table's constraints are a decision
-- rather than a build fix. Worth doing.
