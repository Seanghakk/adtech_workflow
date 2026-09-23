import { redirect } from 'next/navigation'

/**
 * Brief 098 §3.1 — see the sibling redirect under contract-boq/import.
 */
export default async function ShopDrawingBoqImportRedirect({
  params,
}: PageProps<'/projects/[projectId]/shop-drawing-boq/import'>) {
  const { projectId } = await params
  redirect(`/projects/${projectId}/boq-import/shop-drawing`)
}
