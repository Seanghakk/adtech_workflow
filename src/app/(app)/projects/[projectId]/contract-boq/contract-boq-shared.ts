/**
 * Brief 046 Amendment A §4. Shared between actions.ts ('use server' — can
 * only export async functions, so the initial-state constant and its type
 * live here instead, per Next.js's own rule) and the client row/add-form
 * components — same split as lookups/lookup-shared.ts.
 */
export interface ContractBoqFormState {
  error: string | null
  /** A fresh, non-empty token on each successful write (never reused
   *  across submissions), null otherwise — same convention as lookups'
   *  own LookupFormState. Row components watch this change to collapse
   *  or clear themselves for the next edit. */
  savedAt: string | null
}

export const contractBoqInitialState: ContractBoqFormState = { error: null, savedAt: null }
