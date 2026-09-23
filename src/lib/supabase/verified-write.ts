/**
 * Brief 094 — when an UPDATE or DELETE's RLS USING clause refuses a row,
 * Postgres/PostgREST returns ZERO ROWS AFFECTED AND NO ERROR (unlike an
 * INSERT's WITH CHECK, which throws). Code that only checks `if (error)`
 * reads that silence as success. Every write this wraps must chain
 * `.select('<some column>')` onto the UPDATE/DELETE/UPSERT builder so the
 * affected row(s) come back in `data` — their absence, with no error, is
 * the signal that the write did nothing.
 *
 * This turns that silence into an honest verdict, distinguishing the two
 * causes the brief asks for: a follow-up read of the row's existence under
 * the SAME session tells "still there but unchanged" (forbidden) apart
 * from "gone" (not found) — a cheap read, not a second guess, since RLS
 * SELECT policies in this app are consistently at least as permissive as
 * the corresponding UPDATE/DELETE policy for every table this wraps.
 *
 * One shared function so the next write path inherits this by construction
 * rather than re-deriving it per file, per the brief's own instruction.
 */
export interface VerifiedWriteOk {
  ok: true
}

export interface VerifiedWriteFailure {
  ok: false
  /** 'error' — the write itself threw (a real PostgrestError, e.g. a
   *  foreign-key or unique violation the caller should keep handling on
   *  its own). 'not_found' — zero rows affected and the row no longer
   *  exists. 'forbidden' — zero rows affected but the row still exists;
   *  RLS refused it silently. */
  reason: 'error' | 'not_found' | 'forbidden'
  error?: { message: string; code?: string }
}

export type VerifiedWriteResult = VerifiedWriteOk | VerifiedWriteFailure

export async function verifyWriteAffectedRow(
  writeResult: { data: unknown[] | null; error: { message: string; code?: string } | null },
  existsCheck: () => Promise<boolean>,
): Promise<VerifiedWriteResult> {
  if (writeResult.error) {
    return { ok: false, reason: 'error', error: writeResult.error }
  }
  if (writeResult.data && writeResult.data.length > 0) {
    return { ok: true }
  }
  const stillExists = await existsCheck()
  return { ok: false, reason: stillExists ? 'forbidden' : 'not_found' }
}

/** The common case: the row is looked up again by one equality column,
 *  under the same request-scoped client so RLS applies identically to
 *  both the write and this check. Untyped on purpose: every call site
 *  passes its own already-created `createClient()` result, and its full
 *  generic type is deep enough that re-typing the parameter here trips
 *  TypeScript's own instantiation-depth limit (TS2589) — the call sites
 *  themselves stay fully typed; only this narrow internal wrapper does
 *  not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function existsByColumn(supabase: any, table: string, column: string, value: string): () => Promise<boolean> {
  return async () => {
    const { data } = await supabase.from(table).select(column).eq(column, value).maybeSingle()
    return Boolean(data)
  }
}

/** Turns a failed verdict into the one string a Server Function's caller
 *  shows. `t` must come from getServerTranslator() (Brief 094 §3.3 — the
 *  two silent-refusal outcomes are bilingual, dictionary-driven, same as
 *  every other user-facing string in this app); `onError` is this call
 *  site's own existing "could not save" copy for a REAL PostgrestError,
 *  unchanged from before this brief. */
export function writeFailureMessage(
  verdict: VerifiedWriteFailure,
  t: (key: 'writeRefusedNotFound' | 'writeRefusedForbidden') => string,
  onError: string,
): string {
  if (verdict.reason === 'error') return onError
  return t(verdict.reason === 'not_found' ? 'writeRefusedNotFound' : 'writeRefusedForbidden')
}
