import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { TowerRow, type TowerData } from './TowerRow'
import { FloorRow, type FloorData } from './FloorRow'
import { AddTowerForm } from './AddTowerForm'
import { AddFloorForm } from './AddFloorForm'

export const metadata: Metadata = {
  title: 'Floor & zone configuration — ADTECH Workflow Tracker',
}

/**
 * Brief 047 — Floor & Zone (Tower/Wing) Configuration. Reached by
 * click-through from the project's own SO record page (Screen 2a), same
 * pattern as contract-boq (Brief 046) and every other project-scoped
 * screen — Result 046 already confirmed the sidebar (src/lib/nav.ts) is
 * flat/non-project-scoped, no sidebar entry added here either.
 *
 * Server Component: fetches project (for pic_id), towers, and floors,
 * groups floors by tower_id (null group = "no tower," the common case —
 * see migration 021's own header for why that group's uniqueness is kept
 * project-wide while per-tower groups are not). isPic gates every write
 * control's render, same belt-and-suspenders convention as update/
 * page.tsx and contract-boq/page.tsx — RLS is the real enforcement.
 */
export default async function FloorConfigPage({ params }: PageProps<'/projects/[projectId]/floors'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, pic_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  const isPic = Boolean(user && project.pic_id && project.pic_id === user.id)

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

  const noTowerFloors = floors.filter((f) => f.towerId === null)
  const floorsByTower = new Map<string, FloorData[]>()
  for (const floor of floors) {
    if (!floor.towerId) continue
    const list = floorsByTower.get(floor.towerId) ?? []
    list.push(floor)
    floorsByTower.set(floor.towerId, list)
  }

  const isEmpty = towers.length === 0 && floors.length === 0

  return (
    <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('floorConfigKicker')}</div>
        <h1 className="wf-admin__title">{project.name}</h1>
      </div>

      <p>
        <Link href={`/projects/${project.id}`}>{t('floorConfigBackToSoRecord')}</Link>
      </p>

      {!isPic && <p className="floor-config__note">{t('floorConfigNotPicNote')}</p>}

      {isEmpty && <p className="empty-state">{t('floorConfigEmpty')}</p>}

      <section className="floor-config__tower floor-config__tower--none">
        <h3 className="floor-config__tower-title">{t('floorConfigNoTower')}</h3>
        {noTowerFloors.length === 0 ? (
          <p className="empty-state">{t('floorConfigNoFloorsHere')}</p>
        ) : (
          <ul className="floor-config__floor-list">
            {noTowerFloors.map((floor) => (
              <FloorRow key={floor.id} projectId={project.id} floor={floor} towers={towers} />
            ))}
          </ul>
        )}
        {isPic && <AddFloorForm projectId={project.id} towers={towers} fixedTowerId="" />}
      </section>

      {towers.map((tower) => (
        <section key={tower.id} className="floor-config__tower">
          <TowerRow projectId={project.id} tower={tower} />
          {(floorsByTower.get(tower.id) ?? []).length === 0 ? (
            <p className="empty-state">{t('floorConfigNoFloorsHere')}</p>
          ) : (
            <ul className="floor-config__floor-list">
              {(floorsByTower.get(tower.id) ?? []).map((floor) => (
                <FloorRow key={floor.id} projectId={project.id} floor={floor} towers={towers} />
              ))}
            </ul>
          )}
          {isPic && <AddFloorForm projectId={project.id} towers={towers} fixedTowerId={tower.id} />}
        </section>
      ))}

      {isPic && (
        <section className="floor-config__tower">
          <h3 className="floor-config__tower-title">{t('floorConfigAddTowerTitle')}</h3>
          <AddTowerForm projectId={project.id} />
        </section>
      )}
    </div>
  )
}
