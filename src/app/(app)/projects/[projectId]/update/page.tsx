import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { formatDateICT, daysSinceICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { UpdateProgressForm } from './UpdateProgressForm'

export const metadata: Metadata = {
  title: 'Update progress — ADTECH Workflow Tracker',
}

/**
 * Screen 6a — build as drawn (Brief 002 §5.3). Server Component: fetches
 * everything the form needs, then hands it to the client form for the
 * interactive parts (reason selection, disabled-Save gating).
 */
export default async function UpdateProgressPage({
  params,
}: PageProps<'/projects/[projectId]/update'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, stream, so_number, percent_complete, last_meaningful_movement_at, opened_at, owner_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  const [{ data: reasonCodes }, { data: lastUpdate }, { count: openItemCount }] = await Promise.all([
    supabase
      .from('reason_codes')
      .select('code, label_en, label_km, sort_order')
      .eq('is_active', true)
      .or(`stream.is.null,stream.eq.${project.stream}`)
      .order('sort_order'),
    supabase
      .from('progress_updates')
      .select('author_id, recorded_at')
      .eq('subject_type', 'project')
      .eq('subject_id', project.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('project_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'open'),
  ])

  const profileIds = [project.owner_id, lastUpdate?.author_id]
  const profiles = await getUserProfilesByIds(supabase, profileIds)
  const owner = project.owner_id ? profiles.get(project.owner_id) : undefined
  const lastAuthor = lastUpdate?.author_id ? profiles.get(lastUpdate.author_id) : undefined

  const stallAnchor = project.last_meaningful_movement_at ?? project.opened_at
  const daysSinceMovement = daysSinceICT(stallAnchor)

  return (
    <div className="update-screen">
      <UpdateProgressForm
        project={{
          id: project.id,
          name: project.name,
          stream: project.stream,
          soNumber: project.so_number,
          percentComplete: project.percent_complete,
          openItemCount: openItemCount ?? 0,
          ownerLabel: owner?.fullName ?? owner?.email ?? null,
        }}
        lastReported={
          lastUpdate
            ? {
                dateLabel: formatDateICT(lastUpdate.recorded_at),
                byLabel: lastAuthor?.fullName ?? lastAuthor?.email ?? null,
              }
            : null
        }
        daysSinceMovement={daysSinceMovement}
        reasonCodes={(reasonCodes ?? []).map((r) => ({
          code: r.code,
          labelEn: r.label_en,
          labelKm: r.label_km,
        }))}
        strings={{
          lastReported: t('updateLastReported'),
          thisWeek: t('updateThisWeek'),
          movement: t('updateMovement'),
          tapToType: t('updateTapToType'),
          clearsThreshold: t('updateClearsThreshold'),
          drawnUnchanged: t('updateDrawnUnchanged'),
          reasonLabel: t('updateReasonLabel'),
          reasonLabelNoMovement: t('updateReasonLabelNoMovement'),
          required: t('updateRequired'),
          noteLabel: t('updateNoteLabel'),
          noteOptional: t('updateNoteOptional'),
          save: t('updateSave'),
          saveNoChange: t('updateSaveNoChange'),
          cancel: t('updateCancel'),
          blockedTitle: t('updateBlockedTitle'),
          blockedBody: t('updateBlockedBody'),
          saveHint: t('updateSaveHint'),
          by: t('updateBy'),
          unreported: t('updateUnreported'),
          unassigned: t('dashboardUnassigned'),
        }}
      />
    </div>
  )
}
