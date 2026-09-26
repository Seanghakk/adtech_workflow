'use server'

/**
 * Brief 100 Part A — running the export.
 *
 * One action does both halves and in this order deliberately: it records
 * the export FIRST, then hands back the CSV. If the log write is refused
 * the user gets an honest error and no file, rather than a file that
 * "changed since" will never account for. v7.2 §8.4 depends on every
 * download being recorded, so a download that skipped the log would
 * silently corrupt the next export's changed-since list.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { buildExportCsv, exportFileName } from '@/lib/autocad/export'
import { canRunExport } from '@/lib/autocad/permissions'
import { loadExportData } from './export-data'
import type { ExportRunState } from './export-shared'
import type { Json } from '@/lib/supabase/database.types'

export async function runExport(
  _prev: ExportRunState,
  formData: FormData,
): Promise<ExportRunState> {
  const projectId = String(formData.get('projectId') ?? '')
  if (!projectId) return { error: 'Invalid request.', file: null, runId: null }

  const supabase = await createClient()
  const t = await getServerTranslator()
  const { user, member } = await getCurrentMember()
  if (!user) return { error: 'You need to be signed in to do this.', file: null, runId: null }

  const data = await loadExportData(supabase, projectId, t)
  if ('error' in data) return { error: t('exportLoadFailedHeadline'), file: null, runId: null }

  const actor = {
    isPic: Boolean(data.project.picId && data.project.picId === user.id),
    isSuperadmin: Boolean(member?.isSuperadmin),
    teamCode: member?.teamCode ?? '',
  }
  // v7.2 §8.6, and autocad_export_log's own INSERT policy. The policy is
  // the real enforcement; this is the same belt-and-suspenders gate every
  // other write path in this app carries.
  if (!canRunExport(actor)) return { error: t('exportRefused'), file: null, runId: null }

  const { data: written, error } = await supabase
    .from('autocad_export_log')
    .insert({
      project_id: projectId,
      exported_by: user.id,
      // The generator types a jsonb column as `Json`, a recursive union a
      // concrete object type does not satisfy structurally even though it
      // serialises identically. Cast at the boundary only.
      snapshot: data.snapshot as unknown as NonNullable<Json>,
    })
    .select('id')

  // An INSERT refused by a WITH CHECK clause always throws (Brief 094's own
  // Class A), so `error` catches a refusal outright. The row-count check is
  // the verified-write rule applied anyway: a write that reports success
  // while affecting nothing must never be read as success. The shared
  // helper itself is shaped for UPDATE/DELETE, whose "does the row still
  // exist" follow-up has no meaning for a row that was never created.
  if (error || !written || written.length === 0) {
    return { error: t('exportFailed'), file: null, runId: null }
  }

  const csv = buildExportCsv(data.values, data.drawings)

  // The panel's "last exported" and "changed since" both move the moment
  // this lands, so the page behind the download is refreshed.
  revalidatePath(`/projects/${projectId}/export`)
  revalidatePath(`/projects/${projectId}/setup`)

  return {
    error: null,
    file: { name: exportFileName(data.project.soNumber, new Date()), content: csv },
    runId: crypto.randomUUID(),
  }
}
