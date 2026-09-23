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
