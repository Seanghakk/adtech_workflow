import { redirect } from 'next/navigation'

/**
 * Brief 097 §2 — "the redirects: /floors... resolve into the matching
 * section (closed item 6), each section keeping its own permalink."
 * Building structure (Project Setup §2) absorbs this screen completely
 * — FloorRow/TowerRow/AddFloorForm/AddTowerForm and this file's own old
 * Server Component body are retired; floors/actions.ts is unchanged and
 * still the real write path, now called from setup/ instead.
 */
export default async function FloorConfigRedirect({ params }: PageProps<'/projects/[projectId]/floors'>) {
  const { projectId } = await params
  redirect(`/projects/${projectId}/setup#structure`)
}
