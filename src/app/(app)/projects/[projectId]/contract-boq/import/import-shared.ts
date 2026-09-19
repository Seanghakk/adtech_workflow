/**
 * Brief 048 — shared between actions.ts ('use server' — can only export
 * async functions) and ContractBoqImportForm.tsx. Same split as every
 * other *-shared.ts file in this app.
 */
export interface ContractBoqImportState {
  /** A top-level problem — no file selected, wrong file type, missing
   *  required columns, zero data rows, or a write failure. Set together
   *  with rowErrors being empty when the failure isn't row-specific. */
  error: string | null
  /** Per-row validation messages, one 1-based Excel row number each
   *  (header = row 1). Non-empty means nothing was imported — the brief's
   *  own "reject with a clear error rather than partially importing on a
   *  mismatch." */
  rowErrors: string[]
  /** Set on success — how many lines were actually created. */
  importedCount: number | null
}

export const contractBoqImportInitialState: ContractBoqImportState = {
  error: null,
  rowErrors: [],
  importedCount: null,
}
