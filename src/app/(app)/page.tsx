import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isSalesTeamMember } from '@/lib/auth/sales-roles'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { daysSinceICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { getCardWeight, type CardWeight } from '@/lib/age'
import { AgeLadder } from '@/components/AgeLadder'
import {
  buildLanes,
  defaultScopeForRole,
  filterByScope,
  oldestStallDays,
  type BoardLane,
  type BoardProject,
  type GroupBy,
  type Scope,
} from '@/lib/reporting/board'

export const metadata: Metadata = {
  title: 'Project board — ADTECH Workflow Tracker',
}

/**
 * Screen 4a — "one board, three scopes" (Fable Brief 009 / Amendment A).
 * Replaces the interim placeholder that has sat at "/" since Brief 002
 * (see that route's own retired header comment, now on this file).
 *
 * §1's deliberate deviation, the single most important fact about this
 * screen: built over workflow.projects, NOT workflow.requests. The Rev 2
 * handoff's own 4a is a request board grouped by which team currently
 * holds a request — screens 1a/1c (the only write path into
 * workflow.requests) don't exist, so that board would be permanently
 * empty. This is projects' own scope/lane/age structure instead — see
 * lib/reporting/board.ts for the grouping/scope logic itself.
 *
 * Scope and grouping are plain URL search params (?scope=&group=), not
 * client state — every other data-bearing screen in this app is a Server
 * Component with no client-side fetch, and a link-driven tab keeps this
 * screen consistent with that rather than introducing the first one.
 */
export default async function ProjectBoardPage({
  searchParams,
}: PageProps<'/'>) {
  const params = await searchParams
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  // (app)/layout.tsx already renders NoAccessScreen and never reaches this
  // page when member is null — this narrows the type for what follows,
  // not a second access check.
  if (!member) return null

  const restricted = isSalesTeamMember(member)

  const scopeParam = Array.isArray(params.scope) ? params.scope[0] : params.scope
  const scope: Scope =
    scopeParam === 'mine' || scopeParam === 'my-team' || scopeParam === 'everything'
      ? scopeParam
      : defaultScopeForRole(member.role)

  const groupParam = Array.isArray(params.group) ? params.group[0] : params.group
  // §3.3 — default grouping is by stream.
  const groupBy: GroupBy =
    groupParam === 'stream' || groupParam === 'pic' || groupParam === 'age-band'
      ? groupParam
      : 'stream'

  const [{ data: projects }, { data: activeMembers }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, stream, so_number, percent_complete, last_meaningful_movement_at, opened_at, pic_id')
      .eq('status', 'open'),
    supabase.from('members').select('user_id, team_id').eq('is_active', true),
  ])

  const teamIdByUserId = new Map((activeMembers ?? []).map((m) => [m.user_id, m.team_id]))

  const boardProjects: BoardProject[] = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stream: p.stream,
    soNumber: p.so_number,
    percentComplete: p.percent_complete,
    picId: p.pic_id,
    stallDays: daysSinceICT(p.last_meaningful_movement_at ?? p.opened_at),
  }))

  const scoped = filterByScope(boardProjects, scope, member, teamIdByUserId)

  const profiles = await getUserProfilesByIds(supabase, scoped.map((p) => p.picId))
  const picName = (picId: string): string =>
    profiles.get(picId)?.fullName ?? profiles.get(picId)?.username ?? picId
  const unassigned = t('dashboardUnassigned')
  const picLabel = (picId: string | null): string => (picId ? picName(picId).toUpperCase() : unassigned)

  const lanes = buildLanes(scoped, groupBy, picName)

  const laneTitle = (lane: BoardLane): string => {
    if (groupBy === 'stream') return lane.id.toUpperCase()
    if (groupBy === 'pic') return lane.id === 'unassigned' ? t('boardLaneUnassigned') : picName(lane.id).toUpperCase()
    return (
      {
        moving: t('boardBandMoving'),
        waiting: t('boardBandWaiting'),
        late: t('boardBandLate'),
        stalled: t('boardBandStalled'),
      } satisfies Record<CardWeight, string>
    )[lane.id as CardWeight]
  }

  const ageBandCaption: Record<CardWeight, string> = {
    moving: t('boardBandMovingCaption'),
    waiting: t('boardBandWaitingCaption'),
    late: t('boardBandLateCaption'),
    stalled: t('boardBandStalledCaption'),
  }

  const laneCaption = (lane: BoardLane): string => {
    const oldest = oldestStallDays(lane)
    const oldestText = oldest === null ? '' : `${oldest}d ${t('boardOldest')}`
    if (groupBy === 'age-band') {
      const semantic = ageBandCaption[lane.id as CardWeight]
      return oldestText ? `${semantic} · ${oldestText}` : semantic
    }
    return oldestText
  }

  const scopeTitle: Record<Scope, string> = {
    mine: t('boardTitleMine'),
    'my-team': t('boardTitleMyTeam'),
    everything: t('boardTitleEverything'),
  }

  const scopeTabs: { value: Scope; label: string }[] = [
    { value: 'mine', label: t('boardScopeMine') },
    { value: 'my-team', label: t('boardScopeMyTeam') },
    { value: 'everything', label: t('boardScopeEverything') },
  ]
  const groupTabs: { value: GroupBy; label: string }[] = [
    { value: 'stream', label: t('boardGroupStream') },
    { value: 'pic', label: t('boardGroupPic') },
    { value: 'age-band', label: t('boardGroupAgeBand') },
  ]
  const tabHref = (next: { scope?: Scope; group?: GroupBy }) => {
    const s = next.scope ?? scope
    const g = next.group ?? groupBy
    return `/?scope=${s}&group=${g}`
  }

  return (
    <div className="board">
      <div className="board__header">
        <div>
          <div className="board__kicker">{t('boardKicker')}</div>
          <h1 className="board__title">{scopeTitle[scope]}</h1>
        </div>
      </div>

      <div className="board__controls">
        <div className="board__control">
          <span className="board__control-label">{t('boardScopeLabel')}</span>
          <div className="board__tabs">
            {scopeTabs.map((tab) => (
              <Link
                key={tab.value}
                href={tabHref({ scope: tab.value })}
                className={tab.value === scope ? 'board__tab board__tab--active' : 'board__tab'}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="board__control">
          <span className="board__control-label">{t('boardGroupLabel')}</span>
          <div className="board__tabs">
            {groupTabs.map((tab) => (
              <Link
                key={tab.value}
                href={tabHref({ group: tab.value })}
                className={tab.value === groupBy ? 'board__tab board__tab--active' : 'board__tab'}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* §4 — shown for every scope, not only when empty: the RLS
          restriction narrows which ROWS come back regardless of scope
          (it keys off client ownership, not PIC), so "Mine" can be just
          as incomplete as "Everything" for a restricted member. */}
      {restricted && <div className="board__restricted-notice">{t('boardRestrictedNotice')}</div>}

      {scoped.length === 0 ? (
        <p className="empty-state">{restricted ? t('boardRestrictedEmpty') : t('boardEmpty')}</p>
      ) : (
        <div className="board__lanes">
          {lanes.map((lane) => (
            <div key={lane.id} className="board-lane">
              <div className="board-lane__head">
                <div className="board-lane__title-row">
                  <span className="board-lane__title">{laneTitle(lane)}</span>
                  <span className="board-lane__count">{lane.projects.length}</span>
                </div>
                <div className="board-lane__caption">{laneCaption(lane)}</div>
              </div>
              <div className="board-lane__body">
                {lane.projects.map((project) => (
                  <ProjectBoardCard
                    key={project.id}
                    project={project}
                    picLabel={picLabel(project.picId)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectBoardCard({
  project,
  picLabel,
}: {
  project: BoardProject
  picLabel: string
}) {
  const weight = getCardWeight(project.stallDays)
  const className = `exception-card exception-card--${weight}`

  return (
    <div className={className}>
      <div className="exception-card__meta">
        {project.soNumber ? (
          <span className="so-number">{project.soNumber}</span>
        ) : (
          <span className="so-number so-number--pending">No SO yet</span>
        )}{' '}
        <span className="stream-tag">{project.stream.toUpperCase()}</span>
      </div>
      <div className="exception-card__title">{project.name}</div>
      <div className="exception-card__figures">
        <span className="exception-card__percent">{project.percentComplete}%</span>
      </div>
      <div className="exception-card__footer-row">
        <span
          className={
            project.picId
              ? 'exception-card__pic'
              : 'exception-card__pic board-card__pic--unassigned'
          }
        >
          {picLabel}
        </span>
      </div>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <AgeLadder days={project.stallDays} label={`${project.stallDays}d since last movement`} full />
      </div>
    </div>
  )
}
