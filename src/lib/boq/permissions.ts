/**
 * Brief 099 — who may import each BOQ tier.
 *
 * Brief 098 assumed one PIC rule for all three tiers. That was wrong: each
 * tier belongs to a different part of the company, and each table already
 * says so in its own RLS policy. An import is just another way to write
 * those lines, so it must not become a side door that widens who may write
 * them.
 *
 * The three cases below are deliberately literal transcriptions of the
 * INSERT policies on contract_boq_lines, shop_drawing_boq_lines and
 * tender_boq_lines, and they mirror workflow.commit_boq_import()'s own
 * internal check (migration 037) one-for-one. This is the app-layer half
 * of the same belt-and-suspenders convention every other gate in this app
 * uses — the function and the policies are the real enforcement. If a
 * policy changes, all three places change together.
 */
import type { BoqTier } from './tiers'

export const SHOP_DRAWING_WRITE_TEAMS = ['shop_drawing', 'a_and_a'] as const

export interface BoqImporter {
  isPic: boolean
  isSuperadmin: boolean
  teamCode: string
}

export function canImportTier(tier: BoqTier, who: BoqImporter): boolean {
  if (who.isSuperadmin) return true
  switch (tier) {
    case 'contract':
      return who.isPic
    case 'shop_drawing':
      return (SHOP_DRAWING_WRITE_TEAMS as readonly string[]).includes(who.teamCode)
    case 'tender':
      return false
  }
}

/**
 * Creating floors and systems is project setup, not a BOQ write, so it
 * stays where v7.2 §6.4 puts it — with the PIC. Same rule project_floors'
 * and project_systems' own INSERT policies apply. A Shop Drawing member
 * may import shop drawing lines without being able to create floors, so
 * this is asked separately from canImportTier.
 */
export function canCreateProjectSetup(who: BoqImporter): boolean {
  return who.isSuperadmin || who.isPic
}

/** Which dictionary key names the right owner when someone may not import
 *  this tier. Never "the PIC" by default — the sentence has to name whoever
 *  actually owns that tier, or it sends people to the wrong person. */
export function importRefusalKeyFor(
  tier: BoqTier,
): 'boqImportRefusedContract' | 'boqImportRefusedShopDrawing' | 'boqImportRefusedTender' {
  switch (tier) {
    case 'contract':
      return 'boqImportRefusedContract'
    case 'shop_drawing':
      return 'boqImportRefusedShopDrawing'
    case 'tender':
      return 'boqImportRefusedTender'
  }
}
