import type { createClient } from '@/lib/supabase/server'

type WorkflowSupabaseClient = Awaited<ReturnType<typeof createClient>>

/**
 * Screen 2a/2b (Brief 018) — Design Note Rev 3 §4.9: "Division appears
 * only as an unemphasised secondary label after the name." Team is a
 * fact about a workflow.members row, not about public.user_profiles, so
 * this is a separate lookup from getUserProfilesByIds. Not filtered by
 * is_active: a name shown here may belong to someone since deactivated,
 * and the secondary label should still resolve rather than silently
 * disappear.
 */
export async function getTeamLabelsByUserIds(
  supabase: WorkflowSupabaseClient,
  userIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase
    .from('members')
    .select('user_id, teams(label_en)')
    .in('user_id', uniqueIds)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    const team = Array.isArray(row.teams) ? row.teams[0] : row.teams
    if (team?.label_en) map.set(row.user_id, team.label_en)
  }
  return map
}
