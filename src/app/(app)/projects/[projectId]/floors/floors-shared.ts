/**
 * Brief 047 — shared between actions.ts ('use server' — can only export
 * async functions, so the initial-state constant and its type live here
 * instead) and the client row/add-form components. Same split as
 * lookups/lookup-shared.ts and contract-boq/contract-boq-shared.ts.
 */
export interface FloorZoneFormState {
  error: string | null
  /** A fresh, non-empty token on each successful write (never reused
   *  across submissions), null otherwise — same convention as the other
   *  two admin-style forms in this app. Row components watch this change
   *  to collapse or clear themselves for the next edit. */
  savedAt: string | null
}

export const floorZoneInitialState: FloorZoneFormState = { error: null, savedAt: null }
