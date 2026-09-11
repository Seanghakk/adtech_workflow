import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { daysSinceICT } from '@/lib/format/datetime'
import { AgeLadder } from '@/components/AgeLadder'
import { getServerTranslator } from '@/lib/i18n/server'

export const metadata: Metadata = {
  title: 'Update progress — ADTECH Workflow Tracker',
}

/**
 * Landing route after login (Brief 002 §5.2). This is deliberately NOT
 * screen 4a — 4a ("one board, three scopes") is explicitly out of scope
 * for this brief (§6), and cannot honestly be approximated: its lane
 * definitions depend on workflow.requests (a different, unbuilt theme)
 * and its role-scope landing rule is itself marked provisional/hatched
 * in the design handoff, pending stakeholder interviews. Building even a
 * stub of it would mean redoing exploratory design work the brief says
 * not to touch. So this is the minimum honest thing that can sit at `/`
 * today: a plain, undesigned list of every project, sorted stalest
 * first, each linking into screen 6a — the one screen this brief
 * actually builds. See Result 002 for this reasoning in full.
 */
export default async function DashboardPage() {
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: projects } = await supabase
    .from('projects')
    .select(
      'id, name, stream, so_number, percent_complete, last_meaningful_movement_at, opened_at, owner_id',
    )
    .eq('status', 'open')
    .order('last_meaningful_movement_at', { ascending: true, nullsFirst: true })

  const rows = projects ?? []
  const owners = await getUserProfilesByIds(
    supabase,
    rows.map((p) => p.owner_id),
  )

  return (
    <div className="dashboard">
      <h1 className="dashboard__title">{t('dashboardTitle')}</h1>

      {rows.length === 0 ? (
        <p className="empty-state">{t('dashboardEmpty')}</p>
      ) : (
        <ul className="project-list">
          {rows.map((project) => {
            const stallAnchor = project.last_meaningful_movement_at ?? project.opened_at
            const daysSince = daysSinceICT(stallAnchor)
            const owner = project.owner_id ? owners.get(project.owner_id) : undefined

            return (
              <li key={project.id} className="project-list__row">
                <Link href={`/projects/${project.id}/update`} className="project-list__link">
                  <div className="project-list__identity">
                    <div className="project-list__meta">
                      {project.so_number ? (
                        <span className="so-number">{project.so_number}</span>
                      ) : (
                        <span className="so-number so-number--pending">No SO yet</span>
                      )}
                      <span className="stream-tag">{project.stream.toUpperCase()}</span>
                    </div>
                    <div className="project-list__name">{project.name}</div>
                    <div className="project-list__owner">
                      {(owner?.fullName ?? owner?.username ?? t('dashboardUnassigned')).toUpperCase()}
                    </div>
                  </div>
                  <div className="project-list__percent">
                    {project.percent_complete}
                    <span className="project-list__percent-sign">%</span>
                  </div>
                  <AgeLadder days={daysSince} label={`${daysSince}d since last movement`} />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
