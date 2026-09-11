'use server'

/**
 * Screen 6a's write path (Brief 002 §3 — the central decision of the
 * brief). This NEVER issues `update workflow.projects set percent_complete
 * = ...` — workflow.projects has no UPDATE policy at all, by design. The
 * only thing this does is INSERT into workflow.progress_updates; migration
 * 003's triggers are what actually move percent_complete and (when the
 * 5-point threshold is met) last_meaningful_movement_at. See migration
 * 003's own header for the full reasoning.
 */
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

export interface SubmitProgressUpdateState {
  error: string | null
}

export async function submitProgressUpdate(
  _prevState: SubmitProgressUpdateState,
  formData: FormData,
): Promise<SubmitProgressUpdateState> {
  const projectId = String(formData.get('projectId') ?? '')
  const currentPercentRaw = formData.get('currentPercent')
  const newPercentRaw = formData.get('newPercent')
  const reasonCode = String(formData.get('reasonCode') ?? '').trim()
  const reasonNote = String(formData.get('reasonNote') ?? '').trim()

  if (!projectId) {
    return { error: 'Missing project.' }
  }

  // Genuinely blocked server-side too, not only by the disabled Save
  // button (Brief §5.3 — the mandatory-reason rule; a direct POST to this
  // Server Function must be refused exactly like the UI refuses the
  // click, per the Next.js Data Security guidance this project follows).
  if (!reasonCode) {
    return { error: 'Pick a reason to save this update.' }
  }

  const newPercent = Number(newPercentRaw)
  if (!Number.isInteger(newPercent) || newPercent < 0 || newPercent > 100) {
    return { error: 'Enter a whole number between 0 and 100.' }
  }

  const currentPercent = Number(currentPercentRaw)
  const isNoChange = Number.isFinite(currentPercent) && newPercent === currentPercent

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Belt-and-suspenders on top of migration 006's RLS policy (Fable Brief
  // 002 §2.1 / Next.js's own "verify authorization inside each Server
  // Function, not only client-side" guidance): a direct POST here must be
  // refused with the SAME clear reason the UI already shows, not the
  // generic insertError message below, which would otherwise be the only
  // thing a non-PIC caller ever sees.
  const { data: project } = await supabase.from('projects').select('pic_id').eq('id', projectId).maybeSingle()

  if (!project) {
    return { error: 'Project not found.' }
  }
  if (!project.pic_id) {
    return { error: 'No PIC is assigned to this project — nobody can save an update here yet.' }
  }
  if (project.pic_id !== user.id) {
    return { error: 'Only this project’s PIC can save an update here. Nothing was recorded.' }
  }

  // Current global reporting period covering today, if one exists.
  // reporting_periods rows are seeded ahead of time (migration 001); a
  // gap here is a legitimate, non-fatal empty state — the update still
  // saves with period_id = null rather than blocking the save on it.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Phnom_Penh' }).format(new Date())
  const { data: period } = await supabase
    .from('reporting_periods')
    .select('id')
    .is('stream', null)
    .lte('starts_on', today)
    .gte('ends_on', today)
    .maybeSingle()

  const { error: insertError } = await supabase.from('progress_updates').insert({
    subject_type: 'project',
    subject_id: projectId,
    period_id: period?.id ?? null,
    author_id: user.id,
    new_percent: newPercent,
    is_no_change: isNoChange,
    reason_code: reasonCode,
    reason_note: reasonNote || null,
  })

  if (insertError) {
    return { error: 'Could not save this update. Nothing was recorded — try again.' }
  }

  // No success toast to dismiss (Brief §2) — returning to the project
  // list, now showing the new percentage, is the confirmation. Optimises
  // the repeat case: pick the next project, straight from this same list.
  revalidatePath('/')
  revalidatePath(`/projects/${projectId}/update`)
  redirect('/')
}
