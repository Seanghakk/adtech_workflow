/**
 * Shared between actions.ts ('use server' — can only export async
 * functions, so the initial-state constant and its type live here
 * instead, per Next.js's own rule: https://nextjs.org/docs/messages/invalid-use-server-value)
 * and the client row/add-form components.
 */
export interface LookupFormState {
  error: string | null
  /** A fresh, non-empty token on each successful write (never reused
   *  across submissions), null otherwise — same convention as screen 1a's
   *  PostRequestState.posted (src/app/(app)/requests/new/actions.ts). The
   *  row/add-form components watch this change to collapse or clear
   *  themselves for the next edit. */
  savedAt: string | null
}

export const lookupInitialState: LookupFormState = { error: null, savedAt: null }
