import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/uuid'
import { getServerTranslator } from '@/lib/i18n/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { STAGE_TEAM, SUB_STAGE_KEYS, type Stage } from '@/lib/floorScan/rows'
import { PhotoGate } from './PhotoGate'

export const metadata: Metadata = {
  title: 'Photo required — ADTECH Workflow Tracker',
}

/**
 * Brief 100 Part E — v7.2 §12.6, the photo gate.
 *
 * "The photo gate is a step, not a validation message. Selecting 'done'
 * navigates immediately to the capture screen, and the capture screen
 * has no save control — so 'no photo, no save' is structural and needs
 * no guard."
 *
 * That is why this is a ROUTE and not a panel on the floor page. There
 * is nowhere on this screen to save without a photo, so the rule cannot
 * be forgotten, bypassed by a fast tap, or re-implemented slightly
 * differently the next time someone touches the row component.
 *
 * Arriving here does NOT change the status. Nothing is written until
 * "Save this update" on the confirm step, and Cancel returns with the
 * status unchanged.
 */
export default async function PhotoGatePage({
  params,
}: {
  params: Promise<{ floorId: string; subStageId: string }>
}) {
  const { floorId, subStageId } = await params

  if (!isUuid(floorId) || !isUuid(subStageId)) notFound()

  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  const { data: subStage } = await supabase
    .from('floor_sub_stages')
    .select('id, floor_id, stage, sub_stage, status')
    .eq('id', subStageId)
    .maybeSingle()

  // A sub-stage that is not on the floor in the URL is not this screen's
  // to act on, however it was reached.
  if (!subStage || subStage.floor_id !== floorId) notFound()

  const { data: floor } = await supabase
    .from('project_floors')
    .select('id, label, project_id')
    .eq('id', floorId)
    .maybeSingle()

  if (!floor) notFound()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', floor.project_id)
    .maybeSingle()

  if (!project) notFound()

  // Whoever cannot write this stage has no business on a capture screen
  // for it — send them back to the floor rather than letting them take a
  // photo that could never be saved. RLS would refuse the write anyway;
  // this is so the refusal does not arrive AFTER the photo is taken.
  if (member?.teamCode !== STAGE_TEAM[subStage.stage as Stage]) {
    redirect(`/floors/${floorId}/scan`)
  }

  return (
    <PhotoGate
      floorId={floor.id}
      floorLabel={floor.label}
      projectId={project.id}
      subStageId={subStage.id}
      stage={subStage.stage as Stage}
      subStageLabel={t(SUB_STAGE_KEYS[subStage.sub_stage] ?? 'subStageFirstFix')}
      memberName={member?.fullName ?? null}
    />
  )
}
