import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'
import { buildFloorColumns, type FloorData, type TowerData } from '../floor-columns'
import { ShopDrawingBoqImportForm } from './ShopDrawingBoqImportForm'

export const metadata: Metadata = {
  title: 'Import Shop Drawing BOQ — ADTECH Workflow Tracker',
}

/** Migration 022 §3 — Shop Drawing or A&A team, not PIC. */
const WRITE_TEAM_CODES = ['shop_drawing', 'a_and_a']

/**
 * Brief 055 — Shop Drawing BOQ Excel import, reachable from the same area
 * as this tier's list/view (../page.tsx, this brief's own new screen — no
 * manual entry existed before this round). Team-gated, not PIC-gated
 * (migration 022 §3) — RLS is the real enforcement.
 */
export default async function ShopDrawingBoqImportPage({
  params,
}: PageProps<'/projects/[projectId]/shop-drawing-boq/import'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  const { data: project } = await supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle()

  if (!project) {
    notFound()
  }

  const canWrite = Boolean(member && WRITE_TEAM_CODES.includes(member.teamCode))

  const [{ data: towerRows }, { data: floorRows }] = await Promise.all([
    supabase.from('project_towers').select('id, label, sort_order').eq('project_id', project.id).order('sort_order'),
    supabase
      .from('project_floors')
      .select('id, label, sort_order, tower_id')
      .eq('project_id', project.id)
      .order('sort_order'),
  ])

  const towers: TowerData[] = (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order }))
  const floors: FloorData[] = (floorRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    sortOrder: f.sort_order,
    towerId: f.tower_id,
  }))
  const floorColumnHeaders = buildFloorColumns(towers, floors).map((c) => c.header)

  return (
    <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('shopDrawingBoqImportKicker')}</div>
        <h1 className="wf-admin__title">{project.name}</h1>
      </div>

      <p>
        <Link href={`/projects/${project.id}/shop-drawing-boq`}>{t('shopDrawingBoqImportBackToList')}</Link>
      </p>

      {canWrite ? (
        <ShopDrawingBoqImportForm projectId={project.id} floorColumnHeaders={floorColumnHeaders} />
      ) : (
        <p className="shop-drawing-boq__note">{t('shopDrawingBoqNotTeamNote')}</p>
      )}
    </div>
  )
}
