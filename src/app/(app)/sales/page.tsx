import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { daysSinceICT } from '@/lib/format/datetime'
import { AgeLadder } from '@/components/AgeLadder'
import { getServerTranslator } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Maintenance clients — ADTECH Workflow Tracker',
}

/**
 * ADTECH_WF_Brief_003_Sales_Roles — the read-only monitoring view: "view
 * only, no create/act capability on work orders, requests, or any write
 * action in the maintenance flow." There is no existing progress/project
 * board to filter yet (this app's only other list is the plain, undesigned
 * "/", per that page's own header — screen 4a itself doesn't exist), so
 * this is a NEW, minimal list in the same shape as "/", scoped to
 * is_maintenance_contract = true.
 *
 * The actual scoping (a Sales Engineer sees only clients they own; a
 * Sales Supervisor sees every client any sales-team engineer owns; anyone
 * else sees every maintenance project, unrestricted, matching their
 * existing full access) happens entirely at the RLS layer
 * (workflow.can_view_project(), migration 004) — this query does not
 * duplicate that logic. No write action exists on this page at all, so
 * there is nothing here for the missing UPDATE/INSERT policies on these
 * tables to even need to block.
 */
export default async function SalesMonitoringPage() {
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  const { data: projects } = await supabase
    .from('projects')
    .select(
      'id, name, stream, so_number, percent_complete, last_meaningful_movement_at, opened_at, owner_id, client_id, clients(name)',
    )
    .eq('is_maintenance_contract', true)
    .eq('status', 'open')
    .order('last_meaningful_movement_at', { ascending: true, nullsFirst: true })

  const rows = projects ?? []
  const owners = await getUserProfilesByIds(
    supabase,
    rows.map((p) => p.owner_id),
  )

  return (
    <div className="dashboard">
      <h1 className="dashboard__title">{t('salesMonitoringTitle')}</h1>
      <p className="empty-state" style={{ marginBottom: '1rem' }}>
        {member ? t('salesMonitoringReadOnlyNote') : null}
      </p>

      {rows.length === 0 ? (
        <p className="empty-state">{t('salesMonitoringEmpty')}</p>
      ) : (
        <ul className="project-list">
          {rows.map((project) => {
            const stallAnchor = project.last_meaningful_movement_at ?? project.opened_at
            const daysSince = daysSinceICT(stallAnchor)
            const owner = project.owner_id ? owners.get(project.owner_id) : undefined
            const client = Array.isArray(project.clients) ? project.clients[0] : project.clients

            return (
              // Not a Link into /projects/[id]/update — that route is the
              // WRITE path (Brief §"Sales does NOT manage ongoing
              // maintenance work"). This view has no destination to click
              // into yet, matching "view only" literally: there is
              // nothing to navigate TO beyond what's already shown here.
              <li key={project.id} className="project-list__row">
                <div className="project-list__link" style={{ cursor: 'default' }}>
                  <div className="project-list__identity">
                    <div className="project-list__meta">
                      {project.so_number ? (
                        <span className="so-number">{project.so_number}</span>
                      ) : (
                        // Matches "/" (dashboard) page's own convention — a
                        // hardcoded English label here too, not run through
                        // the translator (that page never added a key for
                        // it either).
                        <span className="so-number so-number--pending">No SO yet</span>
                      )}
                      <span className="stream-tag">{project.stream.toUpperCase()}</span>
                    </div>
                    <div className="project-list__name">{project.name}</div>
                    <div className="project-list__owner">
                      {(client?.name ?? '—').toUpperCase()}
                      {' · '}
                      {(owner?.fullName ?? owner?.username ?? t('dashboardUnassigned')).toUpperCase()}
                    </div>
                  </div>
                  <div className="project-list__percent">
                    {project.percent_complete}
                    <span className="project-list__percent-sign">%</span>
                  </div>
                  <AgeLadder days={daysSince} label={`${daysSince}d since last movement`} />
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {member && (member.role === 'manager' || member.role === 'admin') && (
        <p style={{ marginTop: '1.5rem' }}>
          <Link href="/sales/assign">{t('salesAssignLinkLabel')}</Link>
        </p>
      )}
    </div>
  )
}
