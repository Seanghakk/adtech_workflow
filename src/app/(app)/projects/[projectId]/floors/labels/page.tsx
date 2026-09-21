import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { generateFloorQrSvg, floorQrTotalModules } from '@/lib/floorQr'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import { FloorLabelsPrint, type PrintableLabel } from './FloorLabelsPrint'

export const metadata: Metadata = {
  title: 'Print floor labels — ADTECH Workflow Tracker',
}

/** Same "no-tower floors first (by sort_order), then each tower in
 *  sort_order, its own floors in sort_order" convention as this app's
 *  other floor-ordered surfaces (shop-drawing-boq/floor-columns.ts,
 *  projects/[projectId]/floor-matrix.ts) — reimplemented locally rather
 *  than imported cross-route, matching this app's own established
 *  per-folder convention (confirmed before writing this file: no
 *  existing cross-route-folder import exists anywhere under
 *  projects/[projectId]/). */
function orderFloors<T extends { id: string; sortOrder: number; towerId: string | null }>(
  towers: { id: string; sortOrder: number }[],
  floors: T[],
): T[] {
  const sortedTowers = [...towers].sort((a, b) => a.sortOrder - b.sortOrder)
  const noTowerFloors = floors.filter((f) => f.towerId === null).sort((a, b) => a.sortOrder - b.sortOrder)
  const ordered: T[] = [...noTowerFloors]
  for (const tower of sortedTowers) {
    ordered.push(...floors.filter((f) => f.towerId === tower.id).sort((a, b) => a.sortOrder - b.sortOrder))
  }
  return ordered
}

/**
 * Brief 058 §5 — print screen producing QR labels for every floor of a
 * project in one run, mirroring the CMMS's own AssetLabelPrint pattern
 * (ADTECH_CMMS_Brief_029_QR_Generation) extended from one asset to a
 * whole project's floors at once, since floor labels are printed and put
 * up in one go (§5's own wording), unlike the CMMS's per-asset label
 * (that pattern had no bulk precedent to mirror — checked directly,
 * grepped its whole src/app for a second label route, found none).
 *
 * Read-only, no write gate: viewing/printing carries no more risk than
 * viewing the floor list itself (/floors, Brief 047), so this relies on
 * the same project-visibility RLS that page already depends on and adds
 * nothing on top of it.
 */
export default async function FloorLabelsPage({ params }: PageProps<'/projects/[projectId]/floors/labels'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, so_number')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  const [{ data: towerRows }, { data: floorRows }] = await Promise.all([
    supabase.from('project_towers').select('id, label, sort_order').eq('project_id', project.id).order('sort_order'),
    supabase.from('project_floors').select('id, label, sort_order, tower_id').eq('project_id', project.id).order('sort_order'),
  ])

  const towers = (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order }))
  const towerLabelById = new Map(towers.map((tw) => [tw.id, tw.label]))
  const floors = (floorRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    sortOrder: f.sort_order,
    towerId: f.tower_id,
  }))

  const orderedFloors = orderFloors(towers, floors)

  // QR generation is pure/local (no network call — see lib/floorQr.ts),
  // so generating one per floor up front is cheap even for a project
  // with several dozen floors.
  const labels: PrintableLabel[] = await Promise.all(
    orderedFloors.map(async (floor) => ({
      floorId: floor.id,
      floorLabel: floor.label,
      towerLabel: floor.towerId ? (towerLabelById.get(floor.towerId) ?? null) : null,
      qrSvg: await generateFloorQrSvg(floor.id),
    })),
  )

  // Brief 072 §2 — the label's own printed identity line: the SO
  // number when the project has one, else the project's full title
  // (CSS-truncated to one line on the label itself — see
  // FloorLabelsPrint.tsx's own header for why NOT the app's on-screen
  // "No SO number yet" fallback text here).
  const labelIdentity = project.so_number ?? project.name

  return (
    <FloorLabelsPrint
      projectName={project.name}
      labelIdentity={labelIdentity}
      labels={labels}
      totalModules={floorQrTotalModules()}
      strings={{
        kicker: t('floorLabelsKicker'),
        empty: t('floorLabelsEmpty'),
        intro: t('floorLabelsIntro'),
        sizeLabel: t('floorLabelsSizeLabel'),
        moduleSizeSuffix: t('floorLabelsModuleSizeSuffix'),
        printButton: t('floorLabelsPrintButton'),
      }}
      breadcrumbAncestors={[
        { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
        { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
        { label: t('floorConfigKicker'), href: `/projects/${project.id}/floors` },
      ]}
    />
  )
}
