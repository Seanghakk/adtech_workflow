import type { createClient } from '@/lib/supabase/server'

type WorkflowSupabaseClient = Awaited<ReturnType<typeof createClient>>

export interface MemberProfile {
  fullName: string | null
  username: string | null
  /** ADTECH_CMMS migration 032 — the Telegram @handle, a DIFFERENT column
   *  from `username` (ADTECH_WF_Brief_014 §1: confirmed by reading the
   *  CMMS's own migrations 002 and 029 directly — `username` is the LOGIN
   *  handle added by 029, `telegram_username` the Telegram handle added by
   *  002; the two never collided at the database level). Nullable — a
   *  linked account's Telegram user may not have set one; use
   *  telegramChatId/telegramLinkedAt to tell "linked, no @handle" apart
   *  from "never linked" (Brief 014 §4.3). */
  telegramUsername: string | null
  telegramChatId: string | null
  telegramLinkedAt: string | null
}

/**
 * Batch identity lookup — id, full_name, username, and the two Telegram
 * identity columns (Brief 001 §3: never .role, that's CMMS vocabulary).
 *
 * CORRECTED (Fable Brief 002 §4): this used to select `email`, which does
 * NOT exist on public.user_profiles. See Result 003 for how that was
 * found and confirmed.
 *
 * CORRECTED AGAIN (ADTECH_WF_Brief_013 / Result 013): selecting the right
 * columns wasn't the whole bug. public.user_profiles carries exactly one
 * RLS policy — "Users read own profile", `auth.uid() = id` (confirmed by
 * reading the CMMS's own migrations 003/008 directly) — so a plain
 * anon-key query like the one this function used to run here returned a
 * row ONLY for the signed-in caller's own id; every other member's
 * full_name/username came back as nothing, and every call site's own
 * fallback chain (see formatMemberName below) landed on whatever came
 * after "no profile found," which used to be the raw id itself. This is
 * why the bug affected every OTHER member's name but never your own.
 *
 * FIXED by calling workflow.get_user_profiles(uuid[]) (migration 010), a
 * SECURITY DEFINER function — this app has never held a service-role key
 * (migration 009's own header), so a privileged read of a table this app
 * does not own is done the way every other privileged operation in this
 * schema already is (assign_project_pic, list_unlinked_accounts): a
 * function that checks the caller internally, not a raw client query
 * against someone else's RLS.
 */
export async function getUserProfilesByIds(
  supabase: WorkflowSupabaseClient,
  ids: (string | null | undefined)[],
): Promise<Map<string, MemberProfile>> {
  const uniqueIds = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (uniqueIds.length === 0) return new Map()

  const { data } = await supabase.rpc('get_user_profiles', { p_ids: uniqueIds })

  const map = new Map<string, MemberProfile>()
  for (const row of data ?? []) {
    map.set(row.id, {
      fullName: row.full_name,
      username: row.username,
      telegramUsername: row.telegram_username,
      telegramChatId: row.telegram_chat_id,
      telegramLinkedAt: row.telegram_linked_at,
    })
  }
  return map
}

/**
 * THE ONE PLACE the fullName -> username -> "no profile" fallback chain
 * is written (ADTECH_WF_Brief_013 §3) — every call site used to write
 * this chain out by hand, and several of them ended it with a raw id
 * instead of words. Deliberately takes the "no profile" text as a
 * parameter rather than importing a translator here: this file has no
 * i18n dependency today and every call site already has `t()` in scope.
 *
 * Callers still decide "unassigned" (no id at all) for themselves before
 * ever calling this — an absent PIC/owner and an assigned PIC/owner whose
 * profile row is missing are different facts and must not collapse into
 * the same label (Brief 013 §3 flagged this exact conflation risk).
 */
export function formatMemberName(profile: MemberProfile | undefined, noProfileText: string): string {
  return profile?.fullName ?? profile?.username ?? noProfileText
}
