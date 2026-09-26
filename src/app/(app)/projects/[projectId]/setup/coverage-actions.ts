'use server'

/**
 * Brief 106b — §6.5's "Edit floors": which floors a system covers.
 *
 * Coverage is the gate on everything else in D096. A progress cell cannot
 * exist outside it (migration 045's composite FK), so this action decides
 * what work the app is able to record at all. Two consequences shape it:
 *
 *   · REMOVING COVERAGE NEVER DELETES. §6.5 — "Removing it keeps those
 *     records but takes them out of progress; adding B1 back restores them."
 *     So a removal sets removed_at, and a re-add clears it; the cells hang
 *     off the row by composite FK and would go with it if it were deleted.
 *   · ADDING IS SEEDED BY THE DATABASE. Migration 045's trigger creates the
 *     five cells, so nothing here writes them — the same rule as
 *     preparing_started_at in Brief 105.
 *
 * PIC-gated, per §6.4, and matching migration 045's own RLS rather than
 * re-deciding it here. Coverage is project structure; recording progress is
 * not the same power as deciding what a system covers.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'

// A 'use server' file may export ONLY async functions. CoverageState and
// coverageInitialState live in ./coverage-state because exporting the object
// from here threw at module evaluation and took every server action on this
// route down with it — see that file's header.
import type { CoverageState } from './coverage-state'

export async function saveSystemCoverage(
  _prev: CoverageState,
  formData: FormData,
): Promise<CoverageState> {
  const projectId = String(formData.get('projectId') ?? '').trim()
  const systemId = String(formData.get('systemId') ?? '').trim()
  const selected = formData.getAll('floorId').map(String).filter(Boolean)

  const t = await getServerTranslator()
  if (!projectId || !systemId) return { error: t('writeRefusedNotFound'), savedAt: null }

  const { member } = await getCurrentMember()
  if (!member) return { error: t('writeRefusedForbidden'), savedAt: null }

  const supabase = await createClient()

  // The PIC check is this app's usual belt-and-braces; migration 045's RLS is
  // the real gate, and a refusal from it surfaces as its own sentence.
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, pic_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) return { error: t('writeRefusedForbidden'), savedAt: null }
  if (!project) return { error: t('writeRefusedNotFound'), savedAt: null }

  const isPic = project.pic_id === member.userId
  if (!isPic && !member.isSuperadmin) {
    return { error: t('setupCoverageRefused'), savedAt: null }
  }

  // What coverage exists today, including rows previously removed — those are
  // the ones that must be REVIVED rather than inserted, so their cells come
  // back with their recorded statuses intact.
  const { data: existing, error: existingError } = await supabase
    .from('project_system_floors')
    .select('id, floor_id, removed_at')
    .eq('project_system_id', systemId)
  if (existingError) return { error: t('setupCoverageCouldNotSave'), savedAt: null }

  const byFloor = new Map((existing ?? []).map((r) => [r.floor_id, r]))

  const toRevive = selected.filter((f) => byFloor.get(f)?.removed_at)
  const toInsert = selected.filter((f) => !byFloor.has(f))
  const toRemove = (existing ?? [])
    .filter((r) => r.removed_at === null && !selected.includes(r.floor_id))
    .map((r) => r.floor_id)

  if (toRevive.length > 0) {
    const { error } = await supabase
      .from('project_system_floors')
      .update({ removed_at: null })
      .eq('project_system_id', systemId)
      .in('floor_id', toRevive)
    if (error) return { error: t('setupCoverageCouldNotSave'), savedAt: null }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('project_system_floors').insert(
      toInsert.map((floorId) => ({
        project_system_id: systemId,
        floor_id: floorId,
        source: 'manual' as const,
        added_by: member.userId,
      })),
    )
    if (error) return { error: t('setupCoverageCouldNotSave'), savedAt: null }
  }

  if (toRemove.length > 0) {
    // Never a DELETE. §6.5 is explicit that the records survive.
    const { error } = await supabase
      .from('project_system_floors')
      .update({ removed_at: new Date().toISOString() })
      .eq('project_system_id', systemId)
      .in('floor_id', toRemove)
    if (error) return { error: t('setupCoverageCouldNotSave'), savedAt: null }
  }

  revalidatePath(`/projects/${projectId}/setup`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/update`)
  return { error: null, savedAt: new Date().toISOString() }
}
