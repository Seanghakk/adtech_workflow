import { redirect } from 'next/navigation'

/**
 * Brief 098 §3.1 — all three tiers import through one component now, at
 * /projects/[projectId]/boq-import/[tier]. This route is kept as a
 * redirect rather than deleted: it is linked from the Contract BOQ screen
 * and may be bookmarked, and Brief 097 set the same precedent when /floors
 * was absorbed into the setup page.
 */
export default async function ContractBoqImportRedirect({
  params,
}: PageProps<'/projects/[projectId]/contract-boq/import'>) {
  const { projectId } = await params
  redirect(`/projects/${projectId}/boq-import/contract`)
}
