import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getServerTranslator } from '@/lib/i18n/server'
import { DAILY_PROJECT_LIMIT } from '@/lib/reporting/exceptions'
import { buildPerPersonLoad, buildPerStreamLoad, type PerPersonLoad, type PerStreamLoad } from '@/lib/reporting/load'

export const metadata: Metadata = {
  title: 'Who is carrying what — ADTECH Workflow Tracker',
}

/**
 * Screen 6c — load, per person and per stream (Fable Brief 002 §3 /
 * README Theme 6). "Detection and data only... presented in the weekly
 * management meeting" — no write action anywhere on this page, same
 * read-only posture as /sales.
 *
 * Deliberately NOT built (README's Theme 6 state spec for 6c lists only
 * perPerson[] and perStream[], nothing else): the mockup's bottom summary
 * row (a global "3.6 per project" / "81% no reason" / "3 Excel files"
 * strip) is decorative dressing on top of that state, not part of it, and
 * the middle figure would require re-deriving 6b's own "no reason given"
 * logic a second time on this page for a number nobody asked this screen
 * to state authoritatively — left out rather than duplicated or guessed.
 *
 * Same can_view_project() scoping note as 6b applies here unchanged: a
 * sales-team member/manager sees load figures computed only from the
 * maintenance-flagged projects under a client they (or their supervisor)
 * own, via RLS, not any extra filtering in this query.
 */
export default async function LoadPage() {
  const supabase = await createClient()
  const t = await getServerTranslator()

  const [{ data: projects }, { data: items }] = await Promise.all([
    supabase.from('projects').select('id, stream').eq('status', 'open'),
    supabase.from('project_items').select('id, project_id, pic_id').eq('status', 'open'),
  ])

  const projectRows = projects ?? []
  const itemRows = items ?? []

  const perPerson = buildPerPersonLoad(
    itemRows.map((i) => ({ picId: i.pic_id, projectId: i.project_id })),
  )
  const perStream = buildPerStreamLoad(
    projectRows,
    itemRows.map((i) => ({ projectId: i.project_id })),
  )

  const profiles = await getUserProfilesByIds(
    supabase,
    perPerson.map((p) => p.picId),
  )

  return (
    <div className="load-board">
      <div className="load-board__header">
        <span className="load-board__kicker">{t('loadKicker')}</span>
        <h1 className="load-board__title">{t('loadTitle')}</h1>
        <span className="load-board__subhead">{t('loadSubhead')}</span>
      </div>

      <div className="load-board__panels">
        <div className="load-board__panel load-board__panel--person">
          <div className="load-board__panel-head">
            <span className="load-board__panel-title">{t('loadPerPerson')}</span>
            <span className="load-board__panel-legend">{t('loadPerPersonLegend')}</span>
          </div>
          <p className="load-board__panel-caption">{t('loadPerPersonCaption')}</p>

          {perPerson.length === 0 ? (
            <p className="empty-state">{t('loadEmpty')}</p>
          ) : (
            <PerPersonChart
              rows={perPerson}
              nameFor={(picId) => {
                const profile = profiles.get(picId)
                return (profile?.fullName ?? profile?.username ?? picId).toUpperCase()
              }}
              openItemsLabel={t('loadOpenItems')}
              lineLabel={t('loadThreeProjectLine')}
            />
          )}
        </div>

        <div className="load-board__panel">
          <div className="load-board__panel-head">
            <span className="load-board__panel-title">{t('loadPerStream')}</span>
          </div>
          <p className="load-board__panel-caption">{t('loadPerStreamCaption')}</p>

          {perStream.length === 0 ? (
            <p className="empty-state">{t('loadEmpty')}</p>
          ) : (
            <StreamChart
              rows={perStream}
              projectsLabel={t('loadProjectsCount')}
              openLabel={t('loadOpenCount')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** Bars are TOTAL distinct open projects a PIC currently carries any open
 *  item in (not date-scoped) — see lib/reporting/load.ts's own header for
 *  why this differs from 6b's day-scoped PIC-over-limit group, and why
 *  the three-project reference line is a borrowed benchmark here, not a
 *  restatement of the daily rule. */
function PerPersonChart({
  rows,
  nameFor,
  openItemsLabel,
  lineLabel,
}: {
  rows: PerPersonLoad[]
  nameFor: (picId: string) => string
  openItemsLabel: string
  lineLabel: string
}) {
  const scaleMax = Math.max(...rows.map((r) => r.distinctProjectCount), DAILY_PROJECT_LIMIT * 2)
  const linePosition = (DAILY_PROJECT_LIMIT / scaleMax) * 100

  return (
    <div className="load-bars">
      {rows.map((row) => {
        const severe = row.distinctProjectCount > DAILY_PROJECT_LIMIT * 2
        const elevated = !severe && row.distinctProjectCount > DAILY_PROJECT_LIMIT
        const baseWidth = (Math.min(row.distinctProjectCount, DAILY_PROJECT_LIMIT) / scaleMax) * 100
        const overflowWidth = (Math.max(0, row.distinctProjectCount - DAILY_PROJECT_LIMIT) / scaleMax) * 100

        return (
          <div key={row.picId}>
            <div className="load-bar__head">
              <span className="load-bar__name">{nameFor(row.picId)}</span>
              <span className="load-bar__items">
                {row.openItemCount} {openItemsLabel}
              </span>
              <span
                className={
                  severe
                    ? 'load-bar__value load-bar__value--severe'
                    : elevated
                      ? 'load-bar__value load-bar__value--elevated'
                      : 'load-bar__value'
                }
              >
                {row.distinctProjectCount}
              </span>
            </div>
            <div className="load-bar__track">
              <div className="load-bar__fill load-bar__fill--base" style={{ width: `${baseWidth}%` }} />
              {overflowWidth > 0 && (
                <div
                  className={
                    severe
                      ? 'load-bar__fill load-bar__fill--overflow-severe'
                      : 'load-bar__fill load-bar__fill--overflow-elevated'
                  }
                  style={{ left: `${baseWidth}%`, width: `${overflowWidth}%` }}
                />
              )}
              <div className="load-bar__line" style={{ left: `${linePosition}%` }} />
            </div>
          </div>
        )
      })}

      <div className="load-board__line-legend">
        <span className="load-board__line-swatch" />
        <span className="load-board__line-label">{lineLabel}</span>
      </div>
    </div>
  )
}

function StreamChart({
  rows,
  projectsLabel,
  openLabel,
}: {
  rows: PerStreamLoad[]
  projectsLabel: string
  openLabel: string
}) {
  const maxValue = Math.max(...rows.map((r) => r.openItemsPerProject), 0.1)
  const maxBarPx = 190

  return (
    <>
      <div className="stream-chart">
        {rows.map((row, i) => (
          <div key={row.stream} className="stream-chart__col">
            <div className="stream-chart__value">{row.openItemsPerProject.toFixed(1)}</div>
            <div
              className={i === 0 ? 'stream-chart__bar stream-chart__bar--primary' : 'stream-chart__bar'}
              style={{ height: `${Math.round((row.openItemsPerProject / maxValue) * maxBarPx)}px` }}
            />
          </div>
        ))}
      </div>
      <div className="stream-chart__labels">
        {rows.map((row) => (
          <div key={row.stream} className="stream-chart__label-col">
            <div className="stream-chart__label-name">{row.stream.toUpperCase()}</div>
            <div className="stream-chart__label-sub">
              {row.projectCount} {projectsLabel} · {row.openItemCount} {openLabel}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
