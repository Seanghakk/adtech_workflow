'use server'

/**
 * Screen 1a's write path (Brief 015 §2 — the central decision of the
 * brief). Migration 011 adds the only thing this needs: an INSERT policy
 * on workflow.requests gated on workflow.is_member(). This inserts
 * exactly the columns migration 001 actually defined on workflow.requests
 * (see that migration's own header/comments) — no invented fields.
 *
 * request_handoffs is NOT written here — routing a request to a handoff
 * leg is screen 1c's job (triage, out of scope this round per Brief §6),
 * not a side effect of posting.
 */
import { createClient } from '@/lib/supabase/server'

export interface PostRequestState {
  error: string | null
  /** A fresh, non-empty token on each successful insert (never reused
   *  across submissions) — the client form watches this change to show a
   *  confirmation and reset its own fields, per Brief §3.5 ("a
   *  confirmation on the form itself is acceptable"). null otherwise. */
  posted: string | null
}

export async function postRequest(
  _prevState: PostRequestState,
  formData: FormData,
): Promise<PostRequestState> {
  const body = String(formData.get('body') ?? '').trim()
  const destinationTeamId = String(formData.get('destinationTeamId') ?? '').trim()
  const destinationUnsure = formData.get('destinationUnsure') === 'true'
  const clientId = String(formData.get('clientId') ?? '').trim()
  const siteId = String(formData.get('siteId') ?? '').trim()
  const projectId = String(formData.get('projectId') ?? '').trim()

  // Genuinely blocked server-side too, not only by the disabled Post
  // button (Brief §3.3 / Next.js's own "verify authorization inside each
  // Server Function, not only client-side" guidance) — a direct POST to
  // this Server Function must be refused exactly like the UI refuses the
  // click.
  if (!body) {
    return { error: 'Write what the request is before posting.', posted: null }
  }
  if (!destinationTeamId && !destinationUnsure) {
    return { error: 'Pick a team, or "I\'m not sure", before posting.', posted: null }
  }
  if (destinationTeamId && destinationUnsure) {
    // Cannot happen through the UI (the two are mutually exclusive there)
    // — only reachable via a direct POST, so this is a plain refusal, not
    // a state the UI needs to explain.
    return { error: 'A request cannot both name a team and be unsure. Nothing was saved.', posted: null }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not signed in. Nothing was saved.', posted: null }
  }

  const { error: insertError } = await supabase.from('requests').insert({
    body,
    requester_id: user.id,
    destination_team_id: destinationTeamId || null,
    destination_unsure: destinationUnsure,
    client_id: clientId || null,
    site_id: siteId || null,
    project_id: projectId || null,
  })

  if (insertError) {
    return { error: 'Could not post this request. Nothing was saved — try again.', posted: null }
  }

  return { error: null, posted: crypto.randomUUID() }
}
