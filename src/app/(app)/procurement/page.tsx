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
import { computeProcurementCounts } from '@/lib/reporting/procurementCounts'

export const metadata: Metadata = {
  title: 'Procurement — ADTECH Workflow Tracker',
}

/**
 * Brief 080 / Handoff Addendum v6.1 §2, REVISED BY BRIEF 082 §3 —
 * Procurement cross-project list. DESTINATION: the project's existing
 * procurement route (unambiguous).
 *
 * workflow.procurement_lines (migration 001) has no status enum; it's a
 * milestone-timestamp progression (sourcing_started_at / mr_submitted_at
 * / mr_approved_at / po_issued_at) plus a delivery fraction
 * (delivery_received/delivery_total).
 *
 * DECISION (Seanghakk, 22 Sep 2026): partial deliveries are shown as
 * their own count, not folded into "not delivered" or "delivered" —
 * materials often arrive in batches, so counting a partial as
 * undelivered makes a line look stuck when most of it is on site;
 * counting it as delivered hides the missing part, which on site can be
 * exactly what blocks installation. Per project:
 *
 *   total lines · ordered (po_issued_at set) · partly delivered ·
 *   fully delivered
 *
 *   partly delivered = delivery_received > 0 AND delivery_received <
 *                       delivery_total
 *   fully delivered  = delivery_total set AND delivery_received >=
 *                       delivery_total
 *
 * A line where delivery_total IS NULL cannot be classed as partly or
 * fully delivered — not guessed. It still counts under "ordered" if a PO
 * is issued, but contributes to neither delivery bucket. See this
 * brief's own Result doc for how many such lines exist in real data.
 *
 * Age key ("age of the oldest undelivered line") UNCHANGED: oldest
 * po_issued_at among ordered lines NOT fully delivered — a partly
 * delivered line is still waiting, so it stays in the age order.
 */
export default async function ProcurementPage({
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
  if (projectRowsError) console.error('ProcurementPage: projects read failed', projectRowsError)
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
  if (memberRowsError) console.error('ProcurementPage: members read failed', memberRowsError)
  const teamIdByUserId = new Map((memberRows ?? []).map((m) => [m.user_id, m.team_id]))
  const loadError = Boolean(projectRowsError) || Boolean(memberRowsError)

  const scopedProjects = filterProjectsByScope(allProjects, scope, member, teamIdByUserId)
  const projectIds = scopedProjects.map((p) => p.id)

  const { data: lineRows } =
    projectIds.length > 0
      ? await supabase
          .from('procurement_lines')
          .select('project_id, po_issued_at, delivery_received, delivery_total')
          .in('project_id', projectIds)
      : { data: [] }

  const linesByProject = new Map<
    string,
    { poIssuedAt: string | null; deliveryReceived: number; deliveryTotal: number | null }[]
  >()
  for (const r of lineRows ?? []) {
    const list = linesByProject.get(r.project_id) ?? []
    list.push({ poIssuedAt: r.po_issued_at, deliveryReceived: r.delivery_received, deliveryTotal: r.delivery_total })
    linesByProject.set(r.project_id, list)
  }

  const rows: CrossListRow[] = scopedProjects
    .filter((p) => (linesByProject.get(p.id)?.length ?? 0) > 0)
    .map((project) => {
      const lines = linesByProject.get(project.id)!
      const counts = computeProcurementCounts(lines)
      const ordered = lines.filter((l) => l.poIssuedAt !== null)
      const undelivered = ordered.filter((l) => !(l.deliveryTotal !== null && l.deliveryReceived >= l.deliveryTotal))

      const oldestAge =
        undelivered.length > 0
          ? Math.max(...undelivered.map((l) => daysSinceICT(l.poIssuedAt!)))
          : 0

      return {
        projectId: project.id,
        projectName: project.name,
        soLabel: project.soNumber ?? t('soRecordNoSoYet'),
        soIsPending: !project.soNumber,
        ageDays: oldestAge,
        ageBand: getAgeLabelBand(oldestAge),
        href: `/projects/${project.id}/procurement`,
        summary: (
          <div className="cross-list__row-summary-line">
            {counts.ordered}/{counts.total} {t('crossListProcurementOrdered')} · {counts.partlyDelivered}{' '}
            {t('crossListProcurementPartlyDelivered')} · {counts.fullyDelivered} {t('crossListProcurementFullyDelivered')}
          </div>
        ),
      }
    })

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_EXECUTION.label), href: CRUMB_EXECUTION.href }]}
        current={t('navExecProcurement')}
      />
      <ScopeSync scope={scope} />
      <CrossProjectList
        titleKey="navExecProcurement"
        scope={scope}
        basePath="/procurement"
        rows={sortByAgeDescending(rows)}
        t={t}
        loadError={loadError}
      />
    </>
  )
}
