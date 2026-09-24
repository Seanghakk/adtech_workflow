/**
 * Brief 100 Part A — shared between actions.ts ('use server' — can only
 * export async functions) and the client panel.
 */
export interface ExportRunState {
  error: string | null
  /** Set on success: the CSV to hand the browser, and what to call it. */
  file: { name: string; content: string } | null
  /** Bumped on every successful run so the client can tell two identical
   *  downloads apart and trigger the save each time. */
  runId: string | null
}

export const exportRunInitialState: ExportRunState = { error: null, file: null, runId: null }
