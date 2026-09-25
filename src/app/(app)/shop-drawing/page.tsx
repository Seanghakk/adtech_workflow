import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getUserProfilesByIds, formatMemberName } from '@/lib/auth/user-profiles'
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
import { computeShopDrawingCounts } from '@/lib/reporting/shopDrawingCounts'

export const metadata: Metadata = {
  title: 'Shop drawing — ADTECH Workflow Tracker',
}

/**
 * Brief 080 / Handoff Addendum v6.1 §2, CORRECTED BY BRIEF 082 §4 — Shop
 * drawing cross-project list.
 *
 * DESTINATION, RE-POINTED (Brief 102 follow-up): each row opens the
 * project's DRAWING REGISTER on /projects/[projectId]/update, not its
 * shop-drawing BOQ. Brief 080 chose the BOQ because it was "a real
 * per-project route that already exists" — true at the time, and the
 * register did not yet. It does now (Brief 100 Part B). These rows count
 * DRAWINGS by status, so the BOQ was answering a question the row had
 * not asked. The BOQ keeps its own route from Project setup's BOQ
 * section.
 *
 * BRIEF 082 CORRECTION: Brief 080's original version mapped the 3-state
 * status (not_started/in_progress/done, migration 008) onto "drawn /
 * approved / with the client" — WRONG, and removed entirely: 'in_progress'
 * usually means ADTECH's own team is still drawing, not that a client
 * has it, so "with the client" would send someone chasing a party who
 * has nothing yet. Seanghakk has since defined the real approval
 * lifecycle (drafting, internal check, submission to a per-drawing
 * reviewer, revisions, codes A/B/C) — that needs a database migration
 * and is a SEPARATE, later brief. NOT built here.
 *
 * UNTIL THEN: show the plain truth. Counted PER ITEM (not per floor —
 * the old floor-grouping logic implied a floor-level verdict the data
 * doesn't actually support), project-wide, across every floor-scope shop
 * drawing item: not started / in progress / done. No claim about
 * approval or about who holds the drawing. This is an INTERIM summary,
 * pending the lifecycle migration.
 *
 * Age key ("longest current wait with the client") UNCHANGED: the oldest
 * updated_at among items currently in_progress, project-wide — this
 * label is arguably also imprecise for the same "in_progress != with the
 * client" reason above, but Brief 082 only asked for the SUMMARY mapping
 * to be corrected, not the age key; left as-is per that explicit scope.
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

  // Brief 094 §3.4 — a failed read here used to render identically to
  // "no projects assigned to you" (see CrossProjectListRows's own
  // loadError prop): both discarded their error and fell back to `?? []`.
  const { data: projectRows, error: projectRowsError } = await supabase
    .from('projects')
    .select('id, name, so_number, pic_id')
    .eq('status', 'open')
  if (projectRowsError) console.error('ShopDrawingPage: projects read failed', projectRowsError)
  const allProjects = (projectRows ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    soNumber: p.so_number as string | null,
    picId: p.pic_id as string | null,
  }))

  const { data: memberRows, error: memberRowsError } = await supabase
    .from('members')
    .select('user_id, team_id')
    .eq('is_active', true)
  if (memberRowsError) console.error('ShopDrawingPage: members read failed', memberRowsError)
  const teamIdByUserId = new Map((memberRows ?? []).map((m) => [m.user_id, m.team_id]))
  const loadError = Boolean(projectRowsError) || Boolean(memberRowsError)

  const scopedProjects = filterProjectsByScope(allProjects, scope, member, teamIdByUserId)
  const projectIds = scopedProjects.map((p) => p.id)

  // Brief 095 §4.3 — see installation/page.tsx's own identical comment.
  const picProfiles = await getUserProfilesByIds(
    supabase,
    scopedProjects.map((p) => p.picId),
  )

  const { data: itemRows } =
    projectIds.length > 0
      ? await supabase
          .from('shop_drawing_items')
          .select('project_id, floor_id, status, updated_at')
          .in('project_id', projectIds)
          .eq('scope', 'floor')
      : { data: [] }

  const itemsByProject = new Map<string, { floorId: string; status: string; updatedAt: string }[]>()
  const floorIds = new Set<string>()
  for (const r of itemRows ?? []) {
    const list = itemsByProject.get(r.project_id) ?? []
    list.push({ floorId: r.floor_id!, status: r.status, updatedAt: r.updated_at })
    itemsByProject.set(r.project_id, list)
    if (r.floor_id) floorIds.add(r.floor_id)
  }

  // Brief 095 §4.1 — a floor label to name what the age is of ("L07"),
  // same shape as installation/testing-commissioning's own floor lookup
  // — this page has no other reason to read project_floors otherwise.
  const { data: floorRows } =
    floorIds.size > 0 ? await supabase.from('project_floors').select('id, label').in('id', [...floorIds]) : { data: [] }
  const floorLabelById = new Map((floorRows ?? []).map((f) => [f.id, f.label]))

  const rows: CrossListRow[] = scopedProjects
    .filter((p) => (itemsByProject.get(p.id)?.length ?? 0) > 0)
    .map((project) => {
      const items = itemsByProject.get(project.id)!
      const counts = computeShopDrawingCounts(items as { status: 'not_started' | 'in_progress' | 'done' }[])
      let oldestWaitAge = 0
      let oldestWaitFloorId: string | null = null
      for (const item of items.filter((i) => i.status === 'in_progress')) {
        const age = daysSinceICT(item.updatedAt)
        if (oldestWaitFloorId === null || age > oldestWaitAge) {
          oldestWaitAge = age
          oldestWaitFloorId = item.floorId
        }
      }
      const ageContext = oldestWaitFloorId
        ? `${floorLabelById.get(oldestWaitFloorId) ?? oldestWaitFloorId} · ${t('crossListShopDrawingInProgress')}`
        : t('crossListAgeNothingWaiting')

      return {
        projectId: project.id,
        projectName: project.name,
        soLabel: project.soNumber ?? t('soRecordNoSoYet'),
        soIsPending: !project.soNumber,
        ageDays: oldestWaitAge,
        ageBand: getAgeLabelBand(oldestWaitAge),
        holderLabel: project.picId ? formatMemberName(picProfiles.get(project.picId), t('membersNoProfile')) : t('dashboardUnassigned'),
        ageContext,
        // The Shop drawing list opens each project's DRAWING REGISTER,
        // not its BOQ. This row counts drawings by status — not BOQ
        // lines — so landing on the BOQ answered a question the row had
        // not asked. The BOQ keeps its own route from Project setup's
        // BOQ section, which is where someone goes looking for it.
        href: `/projects/${project.id}/update`,
        summary: (
          <div className="cross-list__row-summary-line">
            {counts.not_started} {t('crossListShopDrawingNotStarted')} · {counts.in_progress}{' '}
            {t('crossListShopDrawingInProgress')} · {counts.done} {t('crossListShopDrawingDone')}
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
      <CrossProjectList
        titleKey="navExecShopDrawing"
        scope={scope}
        basePath="/shop-drawing"
        rows={sortByAgeDescending(rows)}
        t={t}
        loadError={loadError}
      />
    </>
  )
}
