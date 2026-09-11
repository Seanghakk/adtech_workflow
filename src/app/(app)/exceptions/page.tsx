import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { daysSinceICT, formatDateICT } from '@/lib/format/datetime'
import { getServerTranslator, getServerLang } from '@/lib/i18n/server'
import { localizedLabel } from '@/lib/i18n/localized-label'
import { getCardWeight, type CardWeight } from '@/lib/age'
import { AgeLadder } from '@/components/AgeLadder'
import {
  buildExceptionGroups,
  buildPicBreaches,
  DAILY_PROJECT_LIMIT,
  type ExceptionProject,
  type PicBreach,
} from '@/lib/reporting/exceptions'

export const metadata: Metadata = {
  title: 'Where the work is stuck — ADTECH Workflow Tracker',
}

/**
 * Screen 6b — reviewer exception board (Fable Brief 002 §2 / README Theme
 * 6). Exceptions first, in the README's fixed order, plus one group the
 * README's mockup predates: "no PIC assigned" (Brief 002 §2.1, required
 * not optional, now the first group — see lib/reporting/exceptions.ts for
 * why).
 *
 * §2.3 — the can_view_project() question, reported here rather than
 * silently resolved: this page issues plain `.from('projects')` /
 * `.from('project_items')` / `.from('progress_updates')` selects with no
 * extra scoping of its own. RLS (migration 004's workflow.can_view_project,
 * ANDed onto every affected SELECT policy) is the only thing narrowing the
 * result set. For a sales-team member/manager (not admin), that means:
 * every group on this board is silently restricted to maintenance-flagged
 * (is_maintenance_contract = true) projects under a client they, or their
 * Sales Supervisor, own — exactly workflow.can_view_project()'s existing
 * rule, unchanged by this brief. A sales-team member who owns no
 * maintenance clients yet sees a fully empty board, which reads as "no
 * exceptions" rather than "no visibility" — this is the SAME ambiguity
 * that already exists on "/" and "/sales" today, not a new one introduced
 * here, so it is reported rather than acted on, per §2.3's instruction.
 * Everyone else (including a sales-team ADMIN) sees every open project,
 * unrestricted, same as "/" today.
 *
 * No scope switch (Mine / My team / Everything): that control belongs to
 * screen 4a, explicitly out of scope for this brief (§7) and not built —
 * see this route's own Result 003 entry for why bolting a scope selector
 * onto 6b alone, ahead of 4a, was not done.
 */
export default async function ExceptionsPage() {
  const supabase = await createClient()
  const t = await getServerTranslator()
  const lang = await getServerLang()

  const [{ data: projects }, { data: progressRows }, { data: reasonCodes }, { data: openItems }] =
    await Promise.all([
      supabase
        .from('projects')
        .select(
          'id, name, stream, so_number, percent_complete, last_meaningful_movement_at, opened_at, pic_id',
        )
        .eq('status', 'open'),
      supabase
        .from('progress_updates')
        .select('subject_id, reason_code, recorded_at')
        .eq('subject_type', 'project')
        .order('recorded_at', { ascending: false }),
      supabase.from('reason_codes').select('code, label_en, label_km'),
      supabase.from('project_items').select('id, project_id, pic_id, scheduled_date').eq('status', 'open'),
    ])

  // First occurrence per subject_id, in recorded_at-descending order, is
  // that project's most recent progress update — and its existence at all
  // is what "no reason given" (below) actually tests, since reason_code is
  // NOT NULL at the database level (migration 001): there is no such thing
  // as an update with a blank reason, only a project with no update yet.
  const latestReasonByProjectId = new Map<string, string>()
  for (const row of progressRows ?? []) {
    if (!latestReasonByProjectId.has(row.subject_id)) {
      latestReasonByProjectId.set(row.subject_id, row.reason_code)
    }
  }

  const reasonCodeMap = new Map((reasonCodes ?? []).map((r) => [r.code, r]))
  const reasonLabelFor = (projectId: string): string => {
    const code = latestReasonByProjectId.get(projectId)
    if (!code) return t('exceptionsNoReasonOnFile')
    const rc = reasonCodeMap.get(code)
    if (!rc) return code
    return localizedLabel(rc.label_en, rc.label_km, lang)
  }

  const exceptionProjects: ExceptionProject[] = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    stream: p.stream,
    soNumber: p.so_number,
    percentComplete: p.percent_complete,
    picId: p.pic_id,
    stallDays: daysSinceICT(p.last_meaningful_movement_at ?? p.opened_at),
    hasReasonOnFile: latestReasonByProjectId.has(p.id),
  }))

  const groups = buildExceptionGroups(exceptionProjects)
  const picBreaches = buildPicBreaches(
    (openItems ?? []).map((i) => ({
      projectId: i.project_id,
      picId: i.pic_id,
      scheduledDate: i.scheduled_date,
    })),
  )

  const inExceptionCount = new Set([
    ...groups.noPicAssigned.map((p) => p.id),
    ...groups.noReasonGiven.map((p) => p.id),
    ...groups.stalled.map((p) => p.id),
    ...groups.ninetyNineBand.map((p) => p.id),
  ]).size

  const profiles = await getUserProfilesByIds(supabase, [
    ...exceptionProjects.map((p) => p.picId),
    ...picBreaches.map((b) => b.picId),
  ])
  const picLabel = (picId: string | null): string | null =>
    picId ? (profiles.get(picId)?.fullName ?? profiles.get(picId)?.username ?? null) : null

  const unassigned = t('dashboardUnassigned')

  return (
    <div className="exception-board">
      <div className="exception-board__header">
        <div>
          <div className="exception-board__kicker">{t('exceptionsKicker')}</div>
          <h1 className="exception-board__title">{t('exceptionsTitle')}</h1>
        </div>
        <div className="exception-board__totals">
          <div className="exception-board__stat">
            <div className="exception-board__stat-value">{exceptionProjects.length}</div>
            <div className="exception-board__stat-label">{t('exceptionsOpenProjects')}</div>
          </div>
          <div className="exception-board__stat exception-board__stat--accent">
            <div className="exception-board__stat-value">{inExceptionCount}</div>
            <div className="exception-board__stat-label">{t('exceptionsInException')}</div>
          </div>
        </div>
      </div>

      {exceptionProjects.length === 0 ? (
        <p className="empty-state">{t('exceptionsEmpty')}</p>
      ) : (
        <>
          {groups.noPicAssigned.length > 0 && (
            <div className="exception-board__banner">
              <div className="exception-board__banner-head">
                <span className="exception-board__banner-title">{t('exceptionsGroupNoPic')}</span>
                <span className="exception-board__banner-count">{groups.noPicAssigned.length}</span>
              </div>
              <div className="exception-board__banner-caption">{t('exceptionsGroupNoPicCaption')}</div>
              <div className="exception-board__banner-list">
                {groups.noPicAssigned.map((p) => (
                  <ProjectExceptionCard
                    key={p.id}
                    project={p}
                    picLabel={picLabel(p.picId) ?? unassigned}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="exception-board__groups">
            <div className="exception-group">
              <div className="exception-group__head exception-group__head--severe">
                <div className="exception-group__title-row">
                  <span className="exception-group__title exception-group__title--severe">
                    {t('exceptionsGroupNoReason')}
                  </span>
                  <span className="exception-group__count">{groups.noReasonGiven.length}</span>
                </div>
                <div className="exception-group__caption">{t('exceptionsGroupNoReasonCaption')}</div>
              </div>
              <div className="exception-group__body">
                {groups.noReasonGiven.length === 0 ? (
                  <p className="empty-state">{t('exceptionsEmptyGroup')}</p>
                ) : (
                  groups.noReasonGiven.map((p) => (
                    <ProjectExceptionCard
                      key={p.id}
                      project={p}
                      picLabel={picLabel(p.picId) ?? unassigned}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="exception-group">
              <div className="exception-group__head">
                <div className="exception-group__title-row">
                  <span className="exception-group__title">{t('exceptionsGroupStalled')}</span>
                  <span className="exception-group__count">{groups.stalled.length}</span>
                </div>
                <div className="exception-group__caption">{t('exceptionsGroupStalledCaption')}</div>
              </div>
              <div className="exception-group__body">
                {groups.stalled.length === 0 ? (
                  <p className="empty-state">{t('exceptionsEmptyGroup')}</p>
                ) : (
                  groups.stalled.map((p) => (
                    <ProjectExceptionCard
                      key={p.id}
                      project={p}
                      picLabel={picLabel(p.picId) ?? unassigned}
                      showPercent
                    />
                  ))
                )}
              </div>
            </div>

            <div className="exception-group">
              <div className="exception-group__head">
                <div className="exception-group__title-row">
                  <span className="exception-group__title">{t('exceptionsGroupPicLimit')}</span>
                  <span className="exception-group__count">{picBreaches.length}</span>
                </div>
                <div className="exception-group__caption">{t('exceptionsGroupPicLimitCaption')}</div>
              </div>
              <div className="exception-group__body">
                {picBreaches.length === 0 ? (
                  <p className="empty-state">{t('exceptionsEmptyGroup')}</p>
                ) : (
                  picBreaches.map((b) => (
                    <PicBreachCard
                      key={`${b.picId}|${b.scheduledDate}`}
                      breach={b}
                      picLabel={(picLabel(b.picId) ?? b.picId).toUpperCase()}
                      dateLabel={formatDateICT(b.scheduledDate)}
                      multipleSuffix={t('exceptionsLimitMultiple')}
                      projectsTodayLabel={t('exceptionsProjectsToday')}
                      openItemsLabel={t('exceptionsOpenItems')}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="exception-group">
              <div className="exception-group__head">
                <div className="exception-group__title-row">
                  <span className="exception-group__title">{t('exceptionsGroupBand')}</span>
                  <span className="exception-group__count">{groups.ninetyNineBand.length}</span>
                </div>
                <div className="exception-group__caption">{t('exceptionsGroupBandCaption')}</div>
              </div>
              <div className="exception-group__body">
                {groups.ninetyNineBand.length === 0 ? (
                  <p className="empty-state">{t('exceptionsEmptyGroup')}</p>
                ) : (
                  groups.ninetyNineBand.map((p) => (
                    <ProjectExceptionCard
                      key={p.id}
                      project={p}
                      picLabel={picLabel(p.picId) ?? unassigned}
                      showPercent
                      reasonLabel={reasonLabelFor(p.id)}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <p className="exception-board__footnote">{t('exceptionsFootnote')}</p>
        </>
      )}
    </div>
  )
}

const weightClassName: Record<CardWeight, string> = {
  plain: 'exception-card',
  elevated: 'exception-card exception-card--elevated',
  severe: 'exception-card exception-card--severe',
}

function ProjectExceptionCard({
  project,
  picLabel,
  showPercent = false,
  reasonLabel,
}: {
  project: ExceptionProject
  picLabel: string
  showPercent?: boolean
  reasonLabel?: string
}) {
  const weight = getCardWeight(project.stallDays)

  return (
    <div className={weightClassName[weight]}>
      <div className="exception-card__meta">
        {project.soNumber ? (
          <span className="so-number">{project.soNumber}</span>
        ) : (
          <span className="so-number so-number--pending">No SO yet</span>
        )}{' '}
        <span className="stream-tag">{project.stream.toUpperCase()}</span>
      </div>
      <div className="exception-card__title">{project.name}</div>
      {showPercent && (
        <div className="exception-card__figures">
          <span className="exception-card__percent">{project.percentComplete}%</span>
          {reasonLabel && (
            <span
              className={
                project.hasReasonOnFile ? 'exception-card__reason exception-card__reason--amber' : 'exception-card__reason'
              }
            >
              {reasonLabel}
            </span>
          )}
        </div>
      )}
      <div className="exception-card__footer-row">
        <span className="exception-card__pic">{picLabel.toUpperCase()}</span>
      </div>
      <div style={{ marginTop: 'var(--space-4)' }}>
        <AgeLadder days={project.stallDays} label={`${project.stallDays}d since last movement`} />
      </div>
    </div>
  )
}

function PicBreachCard({
  breach,
  picLabel,
  dateLabel,
  multipleSuffix,
  projectsTodayLabel,
  openItemsLabel,
}: {
  breach: PicBreach
  picLabel: string
  dateLabel: string
  multipleSuffix: string
  projectsTodayLabel: string
  openItemsLabel: string
}) {
  const multiple = Math.floor(breach.distinctProjectCount / DAILY_PROJECT_LIMIT)
  // Judgment call (Result 003): the mockup draws exactly one 6x-limit case
  // red and a 2x-limit case amber, without pinning down where the line
  // between them falls — "severe" (red) is reserved here for more than
  // 3x the daily limit, everything past the limit but at or under that is
  // "elevated" (amber). Change this in one place if a real breach pattern
  // argues for a different cut.
  const severe = breach.distinctProjectCount > DAILY_PROJECT_LIMIT * 3

  return (
    <div className={severe ? 'pic-breach-card pic-breach-card--severe' : 'pic-breach-card'}>
      <div className="pic-breach-card__head">
        <span className="pic-breach-card__name">{picLabel}</span>
        <span
          className={
            severe
              ? 'pic-breach-card__multiple pic-breach-card__multiple--severe'
              : 'pic-breach-card__multiple pic-breach-card__multiple--elevated'
          }
        >
          {multiple}
          {multipleSuffix}
        </span>
      </div>
      <div className="pic-breach-card__figures">
        <div>
          <div
            className={
              severe
                ? 'pic-breach-card__figure-value pic-breach-card__figure-value--severe'
                : 'pic-breach-card__figure-value pic-breach-card__figure-value--elevated'
            }
          >
            {breach.distinctProjectCount}
          </div>
          <div className="pic-breach-card__figure-label">{projectsTodayLabel}</div>
        </div>
        <div className="pic-breach-card__figure-divider">
          <div className="pic-breach-card__figure-value">{breach.openItemCount}</div>
          <div className="pic-breach-card__figure-label">{openItemsLabel}</div>
        </div>
      </div>
      <div className="pic-breach-card__bar">
        {Array.from({ length: Math.min(DAILY_PROJECT_LIMIT, breach.distinctProjectCount) }).map((_, i) => (
          <span key={i} className="pic-breach-card__bar-segment" />
        ))}
        <span
          className={
            severe
              ? 'pic-breach-card__bar-overflow pic-breach-card__bar-overflow--severe'
              : 'pic-breach-card__bar-overflow pic-breach-card__bar-overflow--elevated'
          }
        />
      </div>
      <div className="pic-breach-card__note">{dateLabel}</div>
    </div>
  )
}
