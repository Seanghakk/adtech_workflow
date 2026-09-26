/**
 * Brief 097 — shared between actions.ts ('use server' — can only export
 * async functions) and the client form components. Same split every
 * other admin-style form in this app already uses (lookups/lookup-
 * shared.ts, contract-boq/contract-boq-shared.ts, floors/floors-shared.ts).
 */
export interface SetupFormState {
  error: string | null
  savedAt: string | null
}

export const setupInitialState: SetupFormState = { error: null, savedAt: null }

/**
 * v7.4 §6.5: "A system added by hand opens the editor with every floor
 * selected." To open THAT system's editor, the caller has to know which row
 * was just created — hence the id coming back with the result.
 *
 * It is deliberately a separate type rather than a field on SetupFormState:
 * only this one action creates a row, and widening the shared state would
 * invite every other setup form to carry a field it never sets.
 */
export interface AddSystemState extends SetupFormState {
  /** The row just created, or null when nothing was created this submit. */
  createdSystemId: string | null
}

export const addSystemInitialState: AddSystemState = {
  error: null,
  savedAt: null,
  createdSystemId: null,
}
