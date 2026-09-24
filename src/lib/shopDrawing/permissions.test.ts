import { describe, it, expect } from 'vitest'
import { canDraft, canRecordCheck, canSubmitOrReturn, type DrawingActor } from './permissions'

const actor = (over: Partial<DrawingActor>): DrawingActor => ({
  isPic: false,
  isSuperadmin: false,
  teamCode: 'finance',
  isShopDrawingManager: false,
  displayName: 'Test Person',
  ...over,
})

const pic = actor({ isPic: true, teamCode: 'project_management' })
const sdMember = actor({ teamCode: 'shop_drawing' })
const sdManager = actor({ teamCode: 'shop_drawing', isShopDrawingManager: true })
const aAndA = actor({ teamCode: 'a_and_a' })
const superadmin = actor({ isSuperadmin: true, teamCode: 'qs' })
const outsider = actor({})

describe('who may draft (§9.5)', () => {
  it('is the PIC, both shop drawing teams, and a superadmin', () => {
    expect([pic, sdMember, aAndA, superadmin].map(canDraft)).toEqual([true, true, true, true])
  })
  it('is nobody else', () => {
    expect(canDraft(outsider)).toBe(false)
  })
})

describe('who may record the internal check (§9.5)', () => {
  it('is the Shop Drawing team’s manager, and only them', () => {
    expect(canRecordCheck(sdManager)).toBe(true)
    expect([pic, sdMember, aAndA, outsider].map(canRecordCheck)).toEqual([false, false, false, false])
  })

  it('has no superadmin bypass — migration 028 is explicit about that', () => {
    expect(canRecordCheck(superadmin)).toBe(false)
  })

  it('has no other-team-manager bypass', () => {
    expect(canRecordCheck(actor({ teamCode: 'qs', isShopDrawingManager: false }))).toBe(false)
  })
})

describe('who may submit or record a return (§9.5)', () => {
  it('is the PIC and both shop drawing teams', () => {
    expect([pic, sdMember, aAndA].map(canSubmitOrReturn)).toEqual([true, true, true])
  })
  it('is not an unrelated member', () => {
    expect(canSubmitOrReturn(outsider)).toBe(false)
  })
})
