import type { createClient } from '@/lib/supabase/server'

type WorkflowSupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Batch identity lookup against public.user_profiles — id, full_name,
 * username ONLY (Brief 001 §3: never .role, that's CMMS vocabulary).
 *
 * CORRECTED (Fable Brief 002 §4): this used to select `email`, which does
 * NOT exist on public.user_profiles — its real columns are id, full_name,
 * role, telegram_chat_id, telegram_username, telegram_linked_at,
 * is_active, created_at, updated_at, username, must_change_password.
 * Requesting a nonexistent column makes PostgREST fail the WHOLE query
 * (not just that field), so every caller of this function was silently
 * getting an EMPTY map back for every batch — not just a missing email,
 * but every owner/PIC name in the app (dashboard, sales monitoring,
 * assign-owner, 6a) rendering as "Unassigned"/"—" regardless of whether a
 * real owner was set. `username` is the real column that plays the same
 * "identify a person when full_name isn't set" role email was standing in
 * for. See Result 003 for how this was found and confirmed.
 *
 * Deliberately NOT done via a single PostgREST nested-embed select (e.g.
 * `.select('*, user_profiles(full_name)')`) even though workflow.projects
 * carries a real FK to public.user_profiles: this app's Supabase clients
 * are pinned to `db: { schema: 'workflow' }` (lib/supabase/client.ts /
 * server.ts), and cross-schema embedding across two different exposed
 * schemas is not something to rely on without being able to verify it
 * against the live PostgREST instance (no psql/DATABASE_URL in this
 * environment — see Result 002). Two explicit queries, joined by hand in
 * TypeScript, behaves identically regardless of PostgREST's cross-schema
 * embedding support.
 */
export async function getUserProfilesByIds(
  supabase: WorkflowSupabaseClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, { fullName: string | null; username: string | null }>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase
    .schema('public')
    .from('user_profiles')
    .select('id, full_name, username')
    .in('id', uniqueIds)

  const map = new Map<string, { fullName: string | null; username: string | null }>()
  for (const row of data ?? []) {
    map.set(row.id, { fullName: row.full_name, username: row.username })
  }
  return map
}
