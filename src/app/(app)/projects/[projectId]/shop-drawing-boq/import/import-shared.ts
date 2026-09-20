/**
 * Brief 055 — shared between actions.ts ('use server' — can only export
 * async functions) and ShopDrawingBoqImportForm.tsx. Same split as
 * contract-boq/import's own import-shared.ts.
 */
export interface ShopDrawingBoqImportState {
  /** A top-level problem — no file selected, wrong file type, missing or
   *  unrecognized column(s), zero data rows, or a write failure. Set
   *  together with rowErrors being empty when the failure isn't
   *  row-specific. */
  error: string | null
  /** Per-row validation messages, one 1-based Excel row number each
   *  (header = row 1). Non-empty means nothing was imported — "reject with
   *  a clear error rather than partially importing on a mismatch," same
   *  standard as Contract BOQ import. */
  rowErrors: string[]
  /** Set on success — how many lines were actually created. */
  importedCount: number | null
}

export const shopDrawingBoqImportInitialState: ShopDrawingBoqImportState = {
  error: null,
  rowErrors: [],
  importedCount: null,
}

/** The six columns fixed for every project, in template order. "System
 *  Type" was added ahead of the brief's own literal template list —
 *  shop_drawing_boq_lines.system_type is NOT NULL (migration 018) and the
 *  brief's list omitted it entirely; confirmed with Seanghakk rather than
 *  guessed, decision: add it as column 1. "Model / Part Number" is
 *  deliberately ONE column even though the table has two separate model/
 *  part_number columns — also confirmed rather than guessed, decision:
 *  one input column, written into both. Column 7 onward is per-project
 *  floor/zone columns (see ../floor-columns.ts), not listed here. */
export const SHOP_DRAWING_BOQ_FIXED_HEADERS = [
  'System Type',
  'Description',
  'Brand',
  'Model / Part Number',
  'Unit',
  'Total Quantity',
] as const
