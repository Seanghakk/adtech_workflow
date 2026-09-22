import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'
import { getAgeLabelBand } from '@/lib/age'
import { daysSinceICT } from '@/lib/format/datetime'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_EXECUTION } from '@/lib/breadcrumbs'
import { ScopeSync } from '@/components/ScopeSync'
import { CrossProjectList, type CrossListRow } from '@/components/CrossProjectList'
import { SCOPE_COOKIE } from '@/lib/scopeCookie'
import { defaultScopeForRole, type Scope } from '@/lib/reporting/board'
import { filterProjectsByScope, sortByAgeDescending } from '@/lib/reporting/crossProjectLists'

export const metadata: Metadata = {
  title: 'Shop drawing — ADTECH Workflow Tracker',
}

/**
 * Brief 080 / Handoff Addendum v6.1 §2 — Shop drawing cross-project
 * list. DESTINATION: the project's existing shop-drawing-boq route
 * (unambiguous — a real per-project route already exists).
 *
 * "Floors drawn / approved of total; count sitting with the client" is
 * a JUDGMENT CALL against workflow.shop_drawing_items' own 3-state
 * status (not_started/in_progress/done, migration 008) — the addendum
 * names no explicit mapping. Per FLOOR-scope item (drawing_type in
 * layout/detail_connection; a floor typically carries both):
 *   - "not drawn": every floor-scope item on that floor is not_started
 *   - "with the client": at least one item is in_progress (drawn,
 *     submitted, awaiting the client's approval — 'in_progress' is the
 *     only state between not-yet-drawn and fully approved)
 *   - "approved": every floor-scope item on that floor is done
 * "Total" = every floor that carries at least one floor-scope shop
 * drawing item. Age key ("longest current wait with the client") = the
 * oldest updated_at among items currently in_progress, project-wide.
 */
export default async function ShopDrawingPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string | string[] }>
}) {
  const params = await searchParams
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()
  if (!member) return null

  const cookieStore = await cookies()
  const persistedScope = cookieStore.get(SCOPE_COOKIE)?.value
  const scopeParam = Array.isArray(params.scope) ? params.scope[0] : params.scope
  const scope: Scope =
    scopeParam === 'mine' || scopeParam === 'my-team' || scopeParam === 'everything'
      ? scopeParam
      : persistedScope === 'mine' || persistedScope === 'my-team' || persistedScope === 'everything'
        ? persistedScope
        : defaultScopeForRole(member.role)

  const { data: projectRows } = await supabase.from('projects').select('id, name, so_number, pic_id').eq('status', 'open')
  const allProjects = (projectRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    soNumber: p.so_number as string | null,
    picId: p.pic_id as string | null,
  }))

  const { data: memberRows } = await supabase.from('members').select('user_id, team_id').eq('is_active', true)
  const teamIdByUserId = new Map((memberRows ?? []).map((m) => [m.user_id, m.team_id]))

  const scopedProjects = filterProjectsByScope(allProjects, scope, member, teamIdByUserId)
  const projectIds = scopedProjects.map((p) => p.id)

  const { data: itemRows } =
    projectIds.length > 0
      ? await supabase
          .from('shop_drawing_items')
          .select('project_id, floor_id, status, updated_at')
          .in('project_id', projectIds)
          .eq('scope', 'floor')
      : { data: [] }

  const itemsByProject = new Map<string, { floorId: string; status: string; updatedAt: string }[]>()
  for (const r of itemRows ?? []) {
    const list = itemsByProject.get(r.project_id) ?? []
    list.push({ floorId: r.floor_id!, status: r.status, updatedAt: r.updated_at })
    itemsByProject.set(r.project_id, list)
  }

  const rows: CrossListRow[] = scopedProjects
    .filter((p) => (itemsByProject.get(p.id)?.length ?? 0) > 0)
    .map((project) => {
      const items = itemsByProject.get(project.id)!
      const floorIds = [...new Set(items.map((i) => i.floorId))]
      let drawn = 0
      let approved = 0
      let withClient = 0
      let oldestWaitAge = 0
      for (const floorId of floorIds) {
        const floorItems = items.filter((i) => i.floorId === floorId)
        const allDone = floorItems.every((i) => i.status === 'done')
        const anyInProgress = floorItems.some((i) => i.status === 'in_progress')
        if (allDone) {
          approved++
          drawn++
        } else if (anyInProgress) {
          withClient++
          drawn++
        }
      }
      for (const item of items.filter((i) => i.status === 'in_progress')) {
        oldestWaitAge = Math.max(oldestWaitAge, daysSinceICT(item.updatedAt))
      }

      return {
        projectId: project.id,
        projectName: project.name,
        soLabel: project.soNumber ?? t('soRecordNoSoYet'),
        soIsPending: !project.soNumber,
        ageDays: oldestWaitAge,
        ageBand: getAgeLabelBand(oldestWaitAge),
        href: `/projects/${project.id}/shop-drawing-boq`,
        summary: (
          <div className="cross-list__row-summary-line">
            {drawn}/{floorIds.length} {t('crossListShopDrawingDrawnOfTotal')}, {approved}{' '}
            {t('crossListShopDrawingApprovedOfTotal')} · {withClient} {t('crossListShopDrawingWithClient')}
          </div>
        ),
      }
    })

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_EXECUTION.label), href: CRUMB_EXECUTION.href }]}
        current={t('navExecShopDrawing')}
      />
      <ScopeSync scope={scope} />
      <CrossProjectList titleKey="navExecShopDrawing" scope={scope} basePath="/shop-drawing" rows={sortByAgeDescending(rows)} t={t} />
    </>
  )
}
