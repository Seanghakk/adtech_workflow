import { describe, it, expect } from 'vitest'
import { canImportTier, canCreateProjectSetup, type BoqImporter } from './permissions'

const pic: BoqImporter = { isPic: true, isSuperadmin: false, teamCode: 'project_management' }
const shopDrawing: BoqImporter = { isPic: false, isSuperadmin: false, teamCode: 'shop_drawing' }
const aAndA: BoqImporter = { isPic: false, isSuperadmin: false, teamCode: 'a_and_a' }
const superadmin: BoqImporter = { isPic: false, isSuperadmin: true, teamCode: 'qs' }
const outsider: BoqImporter = { isPic: false, isSuperadmin: false, teamCode: 'finance' }
const tenderTeam: BoqImporter = { isPic: false, isSuperadmin: false, teamCode: 'tender' }

/**
 * Brief 099 §1 — these mirror the three tables' own INSERT policies, and
 * must keep mirroring them. Each expectation below is the policy restated:
 *   contract      = superadmin OR pic
 *   shop_drawing  = superadmin OR team in (shop_drawing, a_and_a)
 *   tender        = superadmin
 */
describe('canImportTier — permission follows each tier’s owner', () => {
  it('contract BOQ belongs to the project’s PIC', () => {
    expect(canImportTier('contract', pic)).toBe(true)
    expect(canImportTier('contract', shopDrawing)).toBe(false)
    expect(canImportTier('contract', aAndA)).toBe(false)
    expect(canImportTier('contract', outsider)).toBe(false)
  })

  it('shop drawing BOQ belongs to Shop Drawing and A&A, not the PIC', () => {
    expect(canImportTier('shop_drawing', shopDrawing)).toBe(true)
    expect(canImportTier('shop_drawing', aAndA)).toBe(true)
    expect(canImportTier('shop_drawing', pic)).toBe(false)
    expect(canImportTier('shop_drawing', outsider)).toBe(false)
  })

  it('tender BOQ is superadmin-only — the Tender team has no rule behind it today', () => {
    expect(canImportTier('tender', superadmin)).toBe(true)
    expect(canImportTier('tender', pic)).toBe(false)
    expect(canImportTier('tender', shopDrawing)).toBe(false)
    // Named explicitly: it would be easy to assume the Tender team owns
    // this tier, and the policy says otherwise.
    expect(canImportTier('tender', tenderTeam)).toBe(false)
  })

  it('a superadmin may import every tier', () => {
    expect(canImportTier('contract', superadmin)).toBe(true)
    expect(canImportTier('shop_drawing', superadmin)).toBe(true)
    expect(canImportTier('tender', superadmin)).toBe(true)
  })
})

describe('canCreateProjectSetup — floors and systems stay with the PIC', () => {
  it('lets the PIC and a superadmin create', () => {
    expect(canCreateProjectSetup(pic)).toBe(true)
    expect(canCreateProjectSetup(superadmin)).toBe(true)
  })

  it('refuses everyone else, including someone who MAY import that tier', () => {
    // The point of Brief 099 §2: a Shop Drawing member can import shop
    // drawing lines and still not create a floor while doing it.
    expect(canImportTier('shop_drawing', shopDrawing)).toBe(true)
    expect(canCreateProjectSetup(shopDrawing)).toBe(false)
    expect(canCreateProjectSetup(aAndA)).toBe(false)
    expect(canCreateProjectSetup(outsider)).toBe(false)
  })
})
