import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import type { FloorData, TowerData } from './floor-columns'
import { groupBySystem, groupByFloorAndTower, type FloorAndTowerGroups, type ShopDrawingBoqView } from './grouped-views'

export const metadata: Metadata = {
  title: 'Shop Drawing BOQ — ADTECH Workflow Tracker',
}

/** Migration 022 §3 — Shop Drawing or A&A team, not PIC. */
const WRITE_TEAM_CODES = ['shop_drawing', 'a_and_a']

/**
 * Brief 055 — Shop Drawing BOQ, minimal list/view screen. No manual-entry
 * screen exists for this tier yet (confirmed before building: grepped the
 * whole src tree for shop_drawing_boq_lines/_locations reads — none, apart
 * from this brief's own new files). Built as the reachability anchor the
 * import screen needs, per the brief's own instruction ("if manual entry
 * does not exist, place the import entry point wherever makes sense
 * alongside the Shop Drawing BOQ list/view") — display-only, no add/edit/
 * delete UI, matching this brief's own scope (import only, re-import/
 * update/merge explicitly out of scope).
 *
 * Team-gated, not PIC-gated (migration 022 §3) — mirrors update/
 * floor-actions.ts's own requireTeam() shape for the app-layer belt-and-
 * suspenders check (a different local check per file, per this app's own
 * convention); RLS is the real enforcement. Reading is NOT team-restricted
 * (shop_drawing_boq_lines_select is_member()-scoped, same as every other
 * BOQ tier) — only the import link and its write path are gated.
 *
 * Brief 049 — grouped views (system/tower/floor), in addition to the flat
 * list above. View is a plain URL search param (?view=), not client
 * state — same pattern as the project board's own scope/group tabs
 * (src/app/(app)/page.tsx, Screen 4a), the one existing precedent for a
 * switchable view in this app. Contract BOQ does NOT get this treatment
 * this round — confirmed with Seanghakk: it has no system_type column and
 * no floor breakdown at all, so none of the three grouping axes genuinely
 * fit it (see grouped-views.ts's own header for the full reasoning).
 */
export default async function ShopDrawingBoqPage({
  params,
  searchParams,
}: PageProps<'/projects/[projectId]/shop-drawing-boq'>) {
  const { projectId } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, so_number')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  const canWrite = Boolean(member && WRITE_TEAM_CODES.includes(member.teamCode))

  const viewParam = Array.isArray(sp.view) ? sp.view[0] : sp.view
  const view: ShopDrawingBoqView =
    viewParam === 'system' || viewParam === 'tower' || viewParam === 'floor' ? viewParam : 'flat'

  const [{ data: lineRows }, { data: towerRows }, { data: floorRows }] = await Promise.all([
    supabase
      .from('shop_drawing_boq_lines')
      .select('id, system_type, description, brand, model, unit, total_quantity, requested_quantity')
      .eq('project_id', project.id)
      .order('created_at'),
    supabase.from('project_towers').select('id, label, sort_order').eq('project_id', project.id).order('sort_order'),
    supabase
      .from('project_floors')
      .select('id, label, sort_order, tower_id')
      .eq('project_id', project.id)
      .order('sort_order'),
  ])

  const lines = lineRows ?? []
  const towers: TowerData[] = (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order }))
  const floors: FloorData[] = (floorRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    sortOrder: f.sort_order,
    towerId: f.tower_id,
  }))
  const hasFloorConfig = towers.length > 0 || floors.length > 0

  const lineIds = lines.map((l) => l.id)
  const { data: locationRows } =
    (view === 'tower' || view === 'floor') && lineIds.length > 0
      ? await supabase
          .from('shop_drawing_boq_line_locations')
          .select('shop_drawing_boq_line_id, floor_id, quantity')
          .in('shop_drawing_boq_line_id', lineIds)
      : { data: [] }

  const floorAndTower: FloorAndTowerGroups | null =
    (view === 'tower' || view === 'floor') && hasFloorConfig
      ? groupByFloorAndTower(
          lines.map((l) => ({ id: l.id, systemType: l.system_type, totalQuantity: l.total_quantity })),
          (locationRows ?? []).map((r) => ({
            shopDrawingBoqLineId: r.shop_drawing_boq_line_id,
            floorId: r.floor_id,
            quantity: r.quantity,
          })),
          towers,
          floors,
        )
      : null

  const viewTabs: { value: ShopDrawingBoqView; label: string }[] = [
    { value: 'flat', label: t('shopDrawingBoqViewFlat') },
    { value: 'system', label: t('shopDrawingBoqViewSystem') },
    { value: 'tower', label: t('shopDrawingBoqViewTower') },
    { value: 'floor', label: t('shopDrawingBoqViewFloor') },
  ]
  const viewHref = (v: ShopDrawingBoqView) => `/projects/${project.id}/shop-drawing-boq?view=${v}`

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
        ]}
        current={t('shopDrawingBoqKicker')}
      />
      <div className="wf-admin">
      <div className="wf-admin__header">
        <div className="wf-admin__kicker">{t('shopDrawingBoqKicker')}</div>
        <h1 className="wf-admin__title">{project.name}</h1>
      </div>

      {/* Brief 070 §3 — shopDrawingBoqBackToSoRecord ('Back to SO
          record') removed: the breadcrumb's own "<SO#>" ancestor above
          links to the exact same /projects/{id} destination. */}

      {canWrite && (
        <p>
          <Link href={`/projects/${project.id}/boq-import/shop-drawing`}>{t('shopDrawingBoqGoToImport')}</Link>
        </p>
      )}

      {!canWrite && <p className="shop-drawing-boq__note">{t('shopDrawingBoqNotTeamNote')}</p>}

      {lines.length === 0 ? (
        <p className="empty-state">{t('shopDrawingBoqEmpty')}</p>
      ) : (
        <>
          <div className="shop-drawing-boq__control">
            <span className="shop-drawing-boq__control-label">{t('shopDrawingBoqViewLabel')}</span>
            <div className="shop-drawing-boq__view-tabs">
              {viewTabs.map((tab) => (
                <Link
                  key={tab.value}
                  href={viewHref(tab.value)}
                  className={
                    tab.value === view
                      ? 'shop-drawing-boq__view-tab shop-drawing-boq__view-tab--active'
                      : 'shop-drawing-boq__view-tab'
                  }
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>

          {view === 'flat' && (
            <table className="wf-admin-table">
              <thead>
                <tr>
                  <th>{t('shopDrawingBoqColSystemType')}</th>
                  <th>{t('shopDrawingBoqColDescription')}</th>
                  <th>{t('shopDrawingBoqColBrand')}</th>
                  <th>{t('shopDrawingBoqColModelPartNumber')}</th>
                  <th>{t('shopDrawingBoqColUnit')}</th>
                  <th>{t('shopDrawingBoqColQuantity')}</th>
                  <th>{t('shopDrawingBoqColRequested')}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.system_type}</td>
                    <td>{line.description}</td>
                    <td>{line.brand ?? '—'}</td>
                    <td>{line.model ?? '—'}</td>
                    <td>{line.unit}</td>
                    <td>{line.total_quantity}</td>
                    <td>{line.requested_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === 'system' && (
            <table className="wf-admin-table">
              <thead>
                <tr>
                  <th>{t('shopDrawingBoqGroupColSystem')}</th>
                  <th>{t('shopDrawingBoqGroupColLineCount')}</th>
                  <th>{t('shopDrawingBoqColQuantity')}</th>
                </tr>
              </thead>
              <tbody>
                {groupBySystem(
                  lines.map((l) => ({ id: l.id, systemType: l.system_type, totalQuantity: l.total_quantity })),
                ).map((group) => (
                  <tr key={group.systemType}>
                    <td>{group.systemType}</td>
                    <td>{group.lineCount}</td>
                    <td>{group.totalQuantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(view === 'tower' || view === 'floor') && !hasFloorConfig && (
            <div>
              <p className="empty-state">{t('shopDrawingBoqFloorsNotConfigured')}</p>
              <p>
                <Link href={`/projects/${project.id}/floors`}>{t('shopDrawingBoqGoToFloorConfig')}</Link>
              </p>
            </div>
          )}

          {floorAndTower && (
            <>
              <table className="wf-admin-table">
                <thead>
                  <tr>
                    <th>{view === 'tower' ? t('shopDrawingBoqGroupColTower') : t('shopDrawingBoqGroupColFloor')}</th>
                    <th>{t('shopDrawingBoqGroupColEntries')}</th>
                    <th>{t('shopDrawingBoqColQuantity')}</th>
                  </tr>
                </thead>
                <tbody>
                  {view === 'tower'
                    ? floorAndTower.towerGroups.map((group) => (
                        <tr key={group.towerId ?? 'no-tower'}>
                          <td>{group.towerLabel}</td>
                          <td>{group.entryCount}</td>
                          <td>{group.totalQuantity}</td>
                        </tr>
                      ))
                    : floorAndTower.floorGroups.map((group) => (
                        <tr key={group.floorId}>
                          <td>{group.header}</td>
                          <td>{group.entryCount}</td>
                          <td>{group.totalQuantity}</td>
                        </tr>
                      ))}
                </tbody>
              </table>
              {floorAndTower.noBreakdown.lineCount > 0 && (
                <p className="shop-drawing-boq__note">
                  {t('shopDrawingBoqNoBreakdownPrefix')} {floorAndTower.noBreakdown.lineCount}{' '}
                  {t('shopDrawingBoqNoBreakdownSuffix')} {floorAndTower.noBreakdown.totalQuantity}.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
    </>
  )
}
