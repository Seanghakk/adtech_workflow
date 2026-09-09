import type { createClient } from '@/lib/supabase/server'

type WorkflowSupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Batch identity lookup against public.user_profiles — id, full_name,
 * email ONLY (Brief 001 §3: never .role, that's CMMS vocabulary).
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
): Promise<Map<string, { fullName: string | null; email: string | null }>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase
    .schema('public')
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', uniqueIds)

  const map = new Map<string, { fullName: string | null; email: string | null }>()
  for (const row of data ?? []) {
    map.set(row.id, { fullName: row.full_name, email: row.email })
  }
  return map
}
