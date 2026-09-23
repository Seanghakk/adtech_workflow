/**
 * Brief 098 §3.1 — all three BOQ tiers import through ONE component. They
 * differ in destination table and in which columns the template carries,
 * not in behaviour. That difference lives here and nowhere else, so the
 * parser, the differ, the template generator and the import screen all
 * read the same description of a tier.
 */
export type BoqTier = 'tender' | 'contract' | 'shop_drawing'

export interface BoqTierConfig {
  tier: BoqTier
  /** URL segment for /projects/[projectId]/boq-import/[tier]. */
  slug: 'tender' | 'contract' | 'shop-drawing'
  table: 'tender_boq_lines' | 'contract_boq_lines' | 'shop_drawing_boq_lines'
  /** The tier's own quantity column — contract calls it `quantity`, the
   *  other two `total_quantity` (migration 018). */
  quantityColumn: 'quantity' | 'total_quantity'
  hasSystemType: boolean
  hasSectionLabel: boolean
  hasModelPartNumber: boolean
  hasRemarks: boolean
  /** Whether the template carries one column per project floor. Shop
   *  drawing only — see the note in FLOOR_COLUMN_TIERS below. */
  hasFloorColumns: boolean
  /** The columns fixed for every project, in template order. Item Number
   *  is first on every tier: it is the stable key a re-import matches on
   *  (Brief 098 §3.5, indexes from migration 034). */
  fixedHeaders: readonly string[]
}

const TENDER_HEADERS = [
  'Item Number',
  'System Type',
  'Description',
  'Brand',
  'Model / Part Number',
  'Unit',
  'Total Quantity',
  'Remarks',
] as const

export const BOQ_TIERS: Record<BoqTier, BoqTierConfig> = {
  tender: {
    tier: 'tender',
    slug: 'tender',
    table: 'tender_boq_lines',
    quantityColumn: 'total_quantity',
    hasSystemType: true,
    hasSectionLabel: false,
    hasModelPartNumber: true,
    hasRemarks: true,
    // NOT true, although v7.2 §7.6 groups "a shop drawing or tender BOQ"
    // together as carrying floor columns. Checked directly against the
    // schema rather than taken from the sentence: workflow.
    // tender_boq_line_locations has NO floor_id column at all — it routes
    // through a separate workflow.tender_boq_location_map that nothing in
    // this app currently writes. Wiring tender floor quantities would mean
    // building that mapping mechanism, which is a second schema concern
    // this brief does not authorise. Flagged in the Result doc.
    hasFloorColumns: false,
    fixedHeaders: TENDER_HEADERS,
  },
  contract: {
    tier: 'contract',
    slug: 'contract',
    table: 'contract_boq_lines',
    quantityColumn: 'quantity',
    // v7.2 §6.2 item 4: "Contract BOQ stays flat — no floor or system
    // grouping, because it has neither in the schema." Confirmed:
    // contract_boq_lines has section_label but no system_type.
    hasSystemType: false,
    hasSectionLabel: true,
    hasModelPartNumber: false,
    hasRemarks: false,
    hasFloorColumns: false,
    fixedHeaders: ['Item Number', 'Section', 'Description', 'Brand', 'Unit', 'Total Quantity'] as const,
  },
  shop_drawing: {
    tier: 'shop_drawing',
    slug: 'shop-drawing',
    table: 'shop_drawing_boq_lines',
    quantityColumn: 'total_quantity',
    hasSystemType: true,
    hasSectionLabel: false,
    hasModelPartNumber: true,
    hasRemarks: true,
    hasFloorColumns: true,
    fixedHeaders: TENDER_HEADERS,
  },
}

export const BOQ_TIER_BY_SLUG: Record<string, BoqTierConfig> = {
  tender: BOQ_TIERS.tender,
  contract: BOQ_TIERS.contract,
  'shop-drawing': BOQ_TIERS.shop_drawing,
}
