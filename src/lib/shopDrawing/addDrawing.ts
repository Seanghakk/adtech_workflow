/**
 * Brief 102 — what "Add a shop drawing" may ask for, and what it must
 * refuse (v7.2 §9, §21.4).
 *
 * Pure. Which drawing types belong to which scope, and whether a
 * proposed drawing already exists, are both decided here so they can be
 * tested rather than clicked through.
 */
import type { DrawingTypeKey } from './drawingTypes'

export type DrawingScope = 'project' | 'floor'

/**
 * The scope-to-type split, mirroring migration 008's own
 * shop_drawing_items_shape_check:
 *
 *   scope 'project' -> floor_id IS NULL, type in (schematic, typical_section)
 *   scope 'floor'   -> floor_id NOT NULL, type in (layout, detail_connection)
 *
 * This is NOT a new rule invented for the form — the database has
 * enforced it since migration 008, and the form mirrors it so a person
 * never picks a combination that will be refused after they submit.
 *
 * It is also the standing decision (Sep 2026) that typical / section
 * drawings live at project level rather than being duplicated into every
 * floor, expressed as a constraint: offering "typical / section" on a
 * floor is exactly the accident that decision exists to prevent.
 */
export const TYPES_FOR_SCOPE: Record<DrawingScope, DrawingTypeKey[]> = {
  project: ['schematic', 'typical_section'],
  floor: ['layout', 'detail_connection'],
}

export function typesForScope(scope: DrawingScope): DrawingTypeKey[] {
  return TYPES_FOR_SCOPE[scope]
}

export function isTypeAllowedForScope(scope: DrawingScope, type: string): boolean {
  return (TYPES_FOR_SCOPE[scope] as string[]).includes(type)
}

export interface ExistingDrawing {
  id: string
  scope: DrawingScope
  drawingType: string
  floorId: string | null
}

export interface ProposedDrawing {
  scope: DrawingScope
  drawingType: string
  floorId: string | null
}

/**
 * The duplicate §3.4 asks about, found BEFORE the insert so the refusal
 * can name the drawing that already exists.
 *
 * The database would refuse it anyway — two partial unique indexes have
 * guarded this since migration 008:
 *
 *   unique (project_id, drawing_type) where scope = 'project'
 *   unique (floor_id,  drawing_type) where scope = 'floor'
 *
 * so this is not the gate, and it is not trying to be. It exists purely
 * so the person reads "Level 3 already has a layout drawing" instead of
 * a unique-constraint violation. The insert still has to survive the
 * index, which is what actually makes a race impossible.
 */
export function findDuplicate(
  proposed: ProposedDrawing,
  existing: ExistingDrawing[],
): ExistingDrawing | null {
  return (
    existing.find(
      (e) =>
        e.scope === proposed.scope &&
        e.drawingType === proposed.drawingType &&
        (proposed.scope === 'project' ? true : e.floorId === proposed.floorId),
    ) ?? null
  )
}

/**
 * Whether this person may add a drawing at all, mirroring migration
 * 039's widened INSERT policy: superadmin, the Shop Drawing or A&A
 * teams, or the project's PIC. RLS is the real gate; this decides
 * whether to render the control or the sentence.
 */
export const ADD_DRAWING_TEAMS = ['shop_drawing', 'a_and_a'] as const

export function canAddDrawing(viewer: {
  teamCode: string | null
  isSuperadmin: boolean
  isPic: boolean
}): boolean {
  if (viewer.isSuperadmin) return true
  if (viewer.isPic) return true
  return (ADD_DRAWING_TEAMS as readonly string[]).includes(viewer.teamCode ?? '')
}
