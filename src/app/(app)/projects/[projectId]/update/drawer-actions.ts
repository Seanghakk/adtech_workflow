'use server'

/**
 * Brief 100 Part B — v7.2 §9.5's four recordings.
 *
 * The backend shipped in migrations 027–028 and does the real work: the
 * check RPC stamps its own name and time, the submission insert trigger
 * refuses an unchecked revision and copies the check stamp onto the
 * submission, the immutability trigger allows a return exactly once, and
 * an A/B return sets the item to done. None of that is re-implemented
 * here — these actions carry the user's intent to it and turn a refusal
 * into a sentence.
 *
 * Every write goes through Brief 094's verified-write helper where it is
 * an UPDATE (RLS refuses those silently, with zero rows and no error).
 * Inserts and the RPC throw on refusal, which is already honest.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { verifyWriteAffectedRow, existsByColumn, writeFailureMessage } from '@/lib/supabase/verified-write'
import type { DrawerActionState } from './drawer-shared'


/**
 * A date input yields midnight, so "sent today" would read as 00:00 — which
 * is before a check recorded this morning, and migration 027's
 * checked_at <= submitted_at CHECK would refuse a perfectly ordinary
 * same-day submission. Today means now; any other date is taken literally,
 * so a deliberately backdated entry is never quietly moved.
 */
function atEndOfDayIfToday(dateOnly: string): string {
  const today = new Date().toISOString().slice(0, 10)
  return dateOnly === today ? new Date().toISOString() : new Date(dateOnly).toISOString()
}

const ok = (): DrawerActionState => ({ error: null, savedAt: crypto.randomUUID() })
const fail = (error: string): DrawerActionState => ({ error, savedAt: null })

/** §9.5 first recording — "Start drafting" and "Move to internal check" are
 *  the same write with a different value. Entering drafting moves a
 *  not-started drawing to in progress automatically and stamps
 *  drafting_started_at; both are done by migration 028's own trigger, not
 *  here, so there is exactly one place that decides when the clock starts. */
export async function setPreSubmissionStage(
  _prev: DrawerActionState,
  formData: FormData,
): Promise<DrawerActionState> {
  const projectId = String(formData.get('projectId') ?? '')
  const itemId = String(formData.get('itemId') ?? '')
  const stage = String(formData.get('stage') ?? '')
  if (!projectId || !itemId || (stage !== 'drafting' && stage !== 'internal_check')) {
    return fail('Invalid request.')
  }

  const supabase = await createClient()
  const t = await getServerTranslator()

  const writeResult = await supabase
    .from('shop_drawing_items')
    .update({ pre_submission_stage: stage })
    .eq('id', itemId)
    .select('id')

  const verdict = await verifyWriteAffectedRow(
    writeResult,
    existsByColumn(supabase, 'shop_drawing_items', 'id', itemId),
  )
  if (!verdict.ok) {
    return fail(writeFailureMessage(verdict, t, t('drawerCouldNotSave')))
  }

  revalidatePath(`/projects/${projectId}/update`)
  return ok()
}

/** §9.5 second recording — Shop Drawing manager only. The RPC decides that
 *  itself and raises a readable exception; it takes only the item id, so
 *  there is no checked_by or checked_at for a caller to supply. */
export async function recordInternalCheck(
  _prev: DrawerActionState,
  formData: FormData,
): Promise<DrawerActionState> {
  const projectId = String(formData.get('projectId') ?? '')
  const itemId = String(formData.get('itemId') ?? '')
  if (!projectId || !itemId) return fail('Invalid request.')

  const supabase = await createClient()
  const t = await getServerTranslator()

  const { error } = await supabase.rpc('record_shop_drawing_check', { p_item_id: itemId })
  if (error) {
    // The RPC's own refusals are already plain sentences; anything else is
    // a real database failure.
    return fail(error.message || t('drawerCouldNotSave'))
  }

  revalidatePath(`/projects/${projectId}/update`)
  return ok()
}

/** §9.5 third recording. The revision is derived here the same way the
 *  check RPC derives it, and the insert trigger refuses outright if that
 *  revision has no recorded check — so an unchecked submission cannot be
 *  written even if this action were called directly. */
export async function submitRevision(
  _prev: DrawerActionState,
  formData: FormData,
): Promise<DrawerActionState> {
  const projectId = String(formData.get('projectId') ?? '')
  const itemId = String(formData.get('itemId') ?? '')
  const revision = Number(formData.get('revision') ?? NaN)
  const reviewerParty = String(formData.get('reviewerParty') ?? '')
  const reviewerOrg = String(formData.get('reviewerOrg') ?? '').trim()
  const submittedAt = String(formData.get('submittedAt') ?? '')

  if (!projectId || !itemId || !Number.isInteger(revision) || revision < 0) {
    return fail('Invalid request.')
  }
  if (!['client', 'consultant', 'main_contractor', 'other'].includes(reviewerParty)) {
    return fail('Invalid request.')
  }
  if (!submittedAt) return fail('Invalid request.')

  const supabase = await createClient()
  const t = await getServerTranslator()
  const { user } = await getCurrentMember()
  if (!user) return fail('You need to be signed in to do this.')

  const { error } = await supabase.from('shop_drawing_submissions').insert({
    item_id: itemId,
    revision,
    reviewer_party: reviewerParty,
    reviewer_org: reviewerOrg || null,
    submitted_at: atEndOfDayIfToday(submittedAt),
    submitted_by: user.id,
  })

  if (error) {
    if (error.code === '42501') return fail(t('drawerRefusedSubmit'))
    // 23514 on this constraint is a date the user can fix; the raw name
    // means nothing to them.
    if (error.message?.includes('checked_before_submitted')) {
      return fail(t('drawerSentBeforeChecked'))
    }
    // The insert trigger's "no recorded internal check" refusal is already
    // a readable sentence in its own right.
    return fail(error.message || t('drawerCouldNotSave'))
  }

  revalidatePath(`/projects/${projectId}/update`)
  return ok()
}

/** §9.5 fourth recording. A and B mark the drawing done automatically
 *  (migration 028's trigger); C leaves the status alone and opens the next
 *  revision back at drafting. Migration 027's immutability trigger means a
 *  submission can be returned exactly once. */
export async function recordReturn(
  _prev: DrawerActionState,
  formData: FormData,
): Promise<DrawerActionState> {
  const projectId = String(formData.get('projectId') ?? '')
  const submissionId = String(formData.get('submissionId') ?? '')
  const returnedAt = String(formData.get('returnedAt') ?? '')
  const code = String(formData.get('code') ?? '')
  const comments = String(formData.get('comments') ?? '').trim()

  if (!projectId || !submissionId || !returnedAt) return fail('Invalid request.')
  if (!['A', 'B', 'C'].includes(code)) return fail('Invalid request.')

  const supabase = await createClient()
  const t = await getServerTranslator()

  const writeResult = await supabase
    .from('shop_drawing_submissions')
    .update({
      // Same reason as the submission's own date: a return recorded today
      // means now, not this morning's midnight, which would fall before a
      // revision sent earlier today.
      returned_at: atEndOfDayIfToday(returnedAt),
      code,
      comments: comments || null,
    })
    .eq('id', submissionId)
    .select('id, item_id')

  const verdict = await verifyWriteAffectedRow(
    writeResult,
    existsByColumn(supabase, 'shop_drawing_submissions', 'id', submissionId),
  )
  if (!verdict.ok) {
    if (verdict.reason === 'error') {
      if (verdict.error?.message?.includes('returned_after_submitted')) {
        return fail(t('drawerReturnedBeforeSent'))
      }
      return fail(verdict.error?.message || t('drawerCouldNotSave'))
    }
    return fail(writeFailureMessage(verdict, t, t('drawerCouldNotSave')))
  }

  // §9.5 — a C return "opens Rev n+1 back at drafting". pre_submission_stage
  // is per-drawing, not per-revision, so it still holds whatever the
  // PREVIOUS revision reached; left alone, the new revision would open
  // already sitting at internal check. A and B finish the drawing and
  // leave it as it is.
  if (code === 'C') {
    const itemId = (writeResult.data as { item_id?: string }[] | null)?.[0]?.item_id
    if (itemId) {
      await supabase
        .from('shop_drawing_items')
        .update({ pre_submission_stage: 'drafting' })
        .eq('id', itemId)
    }
  }

  revalidatePath(`/projects/${projectId}/update`)
  return ok()
}
