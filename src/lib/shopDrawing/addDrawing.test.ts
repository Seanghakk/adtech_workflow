import { describe, it, expect } from 'vitest'
import {
  typesForScope,
  isTypeAllowedForScope,
  findDuplicate,
  canAddDrawing,
  type ExistingDrawing,
} from './addDrawing'
import { composeDrawingTitle } from '@/lib/autocad/export'

describe('the scope-to-type split mirrors migration 008 exactly', () => {
  it('offers project level only the two that belong there', () => {
    expect(typesForScope('project')).toEqual(['schematic', 'typical_section'])
  })

  it('offers a floor only the other two', () => {
    expect(typesForScope('floor')).toEqual(['layout', 'detail_connection'])
  })

  it('never offers typical / section on a floor', () => {
    // The standing decision (Sep 2026): typical drawings live at project
    // level rather than being duplicated into every floor. Offering it
    // per floor is the accident that decision exists to prevent.
    expect(typesForScope('floor')).not.toContain('typical_section')
    expect(isTypeAllowedForScope('floor', 'typical_section')).toBe(false)
  })

  it('never offers a layout at project level', () => {
    expect(isTypeAllowedForScope('project', 'layout')).toBe(false)
  })

  it('accepts the combinations the database accepts', () => {
    expect(isTypeAllowedForScope('project', 'schematic')).toBe(true)
    expect(isTypeAllowedForScope('floor', 'detail_connection')).toBe(true)
  })
})

describe('§3.4 — a duplicate is refused by naming the existing drawing', () => {
  const existing: ExistingDrawing[] = [
    { id: 'p1', scope: 'project', drawingType: 'schematic', floorId: null },
    { id: 'f1', scope: 'floor', drawingType: 'layout', floorId: 'floor-a' },
    { id: 'f2', scope: 'floor', drawingType: 'detail_connection', floorId: 'floor-a' },
  ]

  it('finds a project-level duplicate regardless of floor', () => {
    const dup = findDuplicate({ scope: 'project', drawingType: 'schematic', floorId: null }, existing)
    expect(dup?.id).toBe('p1')
  })

  it('finds a floor duplicate only on the SAME floor', () => {
    expect(findDuplicate({ scope: 'floor', drawingType: 'layout', floorId: 'floor-a' }, existing)?.id).toBe('f1')
    // the floor trigger seeds two per floor, so floor-b's layout is a
    // different drawing, not a duplicate of floor-a's
    expect(findDuplicate({ scope: 'floor', drawingType: 'layout', floorId: 'floor-b' }, existing)).toBeNull()
  })

  it('lets a second project-level drawing of a DIFFERENT type through', () => {
    expect(
      findDuplicate({ scope: 'project', drawingType: 'typical_section', floorId: null }, existing),
    ).toBeNull()
  })

  it('does not confuse a project drawing with a floor drawing of the same type', () => {
    const both: ExistingDrawing[] = [{ id: 'x', scope: 'floor', drawingType: 'schematic', floorId: 'f' }]
    expect(findDuplicate({ scope: 'project', drawingType: 'schematic', floorId: null }, both)).toBeNull()
  })
})

describe('who may add a drawing (migration 039)', () => {
  const v = (teamCode: string | null, isSuperadmin = false, isPic = false) => ({
    teamCode,
    isSuperadmin,
    isPic,
  })

  it('lets the Shop Drawing and A&A teams add one', () => {
    expect(canAddDrawing(v('shop_drawing'))).toBe(true)
    expect(canAddDrawing(v('a_and_a'))).toBe(true)
  })

  it('keeps the PIC and superadmins, who had it before', () => {
    // "Widened, not replaced" — the whole point of the migration.
    expect(canAddDrawing(v('project_management', false, true))).toBe(true)
    expect(canAddDrawing(v('qs', true, false))).toBe(true)
  })

  it('refuses an unrelated team', () => {
    expect(canAddDrawing(v('qs'))).toBe(false)
    expect(canAddDrawing(v('tnc'))).toBe(false)
    expect(canAddDrawing(v(null))).toBe(false)
  })
})

describe('the title is composed, never stored', () => {
  it('uses the export’s own composition, so the two cannot disagree', () => {
    expect(composeDrawingTitle({ typeLabel: 'Layout', floorLabel: 'Level 3' })).toBe('Layout — Level 3')
    expect(composeDrawingTitle({ typeLabel: 'System schematic', floorLabel: null })).toBe(
      'System schematic',
    )
  })
})
