import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getTeamLabelsByUserIds } from '@/lib/auth/member-teams'
import { formatDateICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { AgeLadder } from '@/components/AgeLadder'
import { computeDependencyChain, type ComputedDependencyLink } from '@/lib/reporting/dependency-chain'

export const metadata: Metadata = {
  title: 'Dependency chain — ADTECH Workflow Tracker',
}

/**
 * Screen 2d — dependency chain (Brief 023). Record/detail archetype,
 * Design Note Rev 3 §4.3: "Days taken against days allowed per link on
 * 2d, front-end slip drawn pushing the commissioning date at the back."
 *
 * SCHEMA FINDINGS (§1) — reported here rather than invented around, same
 * convention as Results 018/019/022:
 *
 *   - workflow.dependency_links DOES carry days_allowed (nullable
 *     integer) — unlike the brief's own stated expectation that this
 *     round would probably surface a missing column, it does not. A row
 *     can still leave it unset (null), handled per-link below.
 *
 *   - workflow.dependency_links carries NO owner/PIC column. Design Note
 *     Rev 3 §4.9's "named person holding it, then age" invariant cannot
 *     be satisfied AT THE LINK LEVEL, the same gap Results 018/019 found
 *     on their own tables. The project's own PIC is shown in the header
 *     for identification only — see dependencyChainOwnerGapNote — never
 *     implied to be who is working a given link.
 *
 *   - What the table links: only project_id, plus a per-project `sequence`
 *     and free-text `name` (unique on project_id+sequence). This is a
 *     single ORDERED LIST per project ("drawing approval, submittal, PO,
 *     delivery, installation, T&C" — the table's own comment), not a
 *     graph of pairwise dependencies between two named entities. A chain
 *     is genuinely assemblable from it — order by sequence — so §2.1/2.2
 *     are buildable as drawn. `name` is a plain per-row value already
 *     data-driven; there is no separate lookup table for link names to
 *     hardcode around.
 *
 *   - No target/planned date exists ANYWHERE in the schema — not on this
 *     table, not on workflow.projects (checked: opened_at is the only
 *     project-level date besides so_assigned_at/closed_at). §2.2 asks for
 *     the slip to push "the commissioning date at the back"; there is no
 *     date to push. What IS computable and is drawn instead: the
 *     cumulative day-count slip carried to the end of the chain — see
 *     dependencyChainNoDateNote, shown on screen rather than silently
 *     upgraded into a calendar date it cannot support.
 *
 * ARCHETYPE (§2.3): stays filed under record/detail (Rev 3 §4.3 already
 * names 2d explicitly in that list with this exact screen's content
 * described), so no re-classification to report — it is a diagram
 * living inside the same 1300px/2px-rule shell as 2a/2c, not a
 * mis-filed ninth archetype.
 *
 * DAYS-AGAINST-ALLOWANCE TREATMENT (§4): deliberately NOT the shared
 * age ladder — an overrun is relative to a PER-LINK allowance, not the
 * fixed absolute-day bands src/lib/age.ts encodes, and forcing this onto
 * that scale would misrepresent a 40-day allowance the same as a 4-day
 * one. Re-uses screen 6c's own load-bar mechanic instead (base fill,
 * red overrun fill past the threshold) at card scale — an existing
 * pattern in this app, not a new one invented for this screen. Where a
 * link has NO allowance set, this bar cannot be drawn honestly, so that
 * link falls back to the standard AgeLadder (plain elapsed age) with a
 * note that no allowance exists for it, rather than being forced onto
 * either scale.
 *
 * READ-ONLY this round (§3), same precedent as 1c/2a/2c: no editing, no
 * setting allowances, no marking links complete. No migration — the
 * existing dependency_links_select policy (migration 004, confirmed live
 * against pg_policies rather than trusted from the migration file per
 * §0's own standing trap) already scopes read access through
 * workflow.can_view_project, the same policy shape 2a/2c already depend
 * on.
 */
export default async function DependencyChainPage({
  params,
}: PageProps<'/projects/[projectId]/dependencies'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, so_number, pic_id, clients(name), sites(name)')
    .eq('id', projectId)
    .maybeSingle()

  // Same "not found or not visible" convention as /projects/[projectId]
  // and /projects/[projectId]/procurement — RLS and a genuinely missing
  // row are not distinguishable from here, and neither tries to be.
  if (!project) {
    notFound()
  }

  const { data: links } = await supabase
    .from('dependency_links')
    .select('id, sequence, name, days_allowed, started_at, ended_at, created_at')
    .eq('project_id', project.id)
    .order('sequence', { ascending: true })

  const profiles = await getUserProfilesByIds(supabase, [project.pic_id])
  const teamLabels = await getTeamLabelsByUserIds(supabase, [project.pic_id])
  const picLabel = project.pic_id
    ? formatMemberName(profiles.get(project.pic_id), t('membersNoProfile'))
    : null
  const picTeam = project.pic_id ? teamLabels.get(project.pic_id) : undefined

  const client = Array.isArray(project.clients) ? project.clients[0] : project.clients
  const site = Array.isArray(project.sites) ? project.sites[0] : project.sites

  const { rows, totalSlip } = computeDependencyChain(links ?? [])
  const lastRow = rows.length > 0 ? rows[rows.length - 1] : null

  return (
    <div className="dependency-chain">
      <div className="dependency-chain__header">
        <div className="dependency-chain__identity">
          <div className="dependency-chain__kicker-row">
            {project.so_number ? (
              <span className="so-record__so-badge">{project.so_number}</span>
            ) : (
              <span className="so-number so-number--pending">{t('soRecordNoSoYet')}</span>
            )}
            <span className="dependency-chain__kicker">{t('dependencyChainKicker')}</span>
          </div>
          <h1 className="dependency-chain__title">{project.name}</h1>
          <div className="dependency-chain__subline">
            {[client?.name, site?.name].filter(Boolean).join(' · ')}
          </div>
          <Link href={`/projects/${project.id}`} className="dependency-chain__back-link">
            {t('dependencyChainBackLink')}
          </Link>
        </div>
        <div className="dependency-chain__owner-block">
          <span className="so-record__owner-label">{t('soRecordPicLabel')}</span>
          <span className={picLabel ? 'exception-card__pic' : 'exception-card__pic board-card__pic--unassigned'}>
            {(picLabel ?? t('dashboardUnassigned')).toUpperCase()}
          </span>
          {picTeam && <span className="so-record__owner-team">{picTeam}</span>}
        </div>
      </div>

      <p className="dependency-chain__owner-gap-note">{t('dependencyChainOwnerGapNote')}</p>

      <div className="dependency-chain__section-head">
        <h2 className="so-record__section-title">{t('dependencyChainSectionTitle')}</h2>
        <span className="so-record__variations-count">{rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p className="empty-state">{t('dependencyChainEmpty')}</p>
      ) : (
        <>
          <div className="dependency-chain__list">
            {rows.map((row, i) => (
              <div key={row.link.id}>
                {i > 0 && (
                  <div className="dependency-chain__connector" aria-hidden="true">
                    ▾
                  </div>
                )}
                <DependencyLinkCard row={row} t={t} />
              </div>
            ))}
          </div>

          <div className={totalSlip > 0 ? 'dependency-chain__slip-summary dependency-chain__slip-summary--slipped' : 'dependency-chain__slip-summary'}>
            <span className="dependency-chain__slip-kicker">{t('dependencyChainSlipTitle')}</span>
            {totalSlip > 0 ? (
              <>
                <span className="dependency-chain__slip-figure">+{totalSlip}d</span>
                {lastRow && (
                  <div className="dependency-chain__slip-into">
                    {t('dependencyChainSlipInto')} &ldquo;{lastRow.link.name}&rdquo;
                  </div>
                )}
              </>
            ) : (
              <span className="dependency-chain__slip-figure">{t('dependencyChainSlipNone')}</span>
            )}
            <p className="dependency-chain__date-note">{t('dependencyChainNoDateNote')}</p>
          </div>
        </>
      )}

      <p className="dependency-chain__write-note">{t('dependencyChainWriteNote')}</p>
    </div>
  )
}

function DependencyLinkCard({
  row,
  t,
}: {
  row: ComputedDependencyLink
  t: (key: import('@/lib/i18n/dictionary').DictionaryKey) => string
}) {
  const { link, status, daysTaken, overrunDays, upstreamSlip } = row
  const allowed = link.days_allowed
  const hasBar = allowed !== null && allowed > 0 && daysTaken !== null

  return (
    <div className="dependency-link-card">
      <div className="dependency-link-card__label">
        <span className="dependency-link-card__sequence">
          {t('dependencyChainSequencePrefix')} {link.sequence}
        </span>
        <span>{link.name}</span>
        {upstreamSlip > 0 && (
          <span className="dependency-link-card__upstream-note">
            +{upstreamSlip}d {t('dependencyChainUpstreamSlip')}
          </span>
        )}
      </div>

      {status === 'not_started' && (
        <span className="dependency-link-card__status">{t('dependencyChainNotStarted')}</span>
      )}

      {status !== 'not_started' && hasBar && daysTaken !== null && allowed !== null && (
        <div className="dependency-link-card__bar-row">
          <div className="dependency-link-card__bar-track">
            <div
              className="dependency-link-card__bar-fill"
              style={{ width: `${Math.min((Math.min(daysTaken, allowed) / allowed) * 100, 100)}%` }}
            />
            {overrunDays !== null && overrunDays > 0 && (
              <div
                className="dependency-link-card__bar-overrun"
                style={{
                  left: `${Math.min((Math.min(daysTaken, allowed) / allowed) * 100, 100)}%`,
                  width: `${Math.min((overrunDays / allowed) * 100, 100)}%`,
                }}
              />
            )}
          </div>
          <div className="dependency-link-card__bar-figures">
            <span>
              {daysTaken}d {t('dependencyChainDaysTakenLabel')} / {allowed}d {t('dependencyChainDaysAllowedLabel')}
            </span>
            {overrunDays !== null && overrunDays > 0 && (
              <span className="dependency-link-card__overrun-tag">
                +{overrunDays}d {t('dependencyChainOverrunTag')}
              </span>
            )}
            {status === 'done' && overrunDays === 0 && <span>{t('dependencyChainDone')}</span>}
            {status === 'in_progress' && <span>({t('dependencyChainInProgress')})</span>}
          </div>
        </div>
      )}

      {status !== 'not_started' && !hasBar && daysTaken !== null && (
        <div className="dependency-link-card__bar-row">
          <AgeLadder days={daysTaken} label={`${daysTaken}d`} full />
          <p className="dependency-link-card__no-allowance">{t('dependencyChainNoAllowance')}</p>
        </div>
      )}

      {(link.started_at || link.ended_at) && (
        <div className="dependency-link-card__dates">
          {link.started_at && (
            <div className="dependency-link-card__date">
              <span className="dependency-link-card__date-label">{t('dependencyChainStartedLabel')}</span>
              <span className="dependency-link-card__date-value">{formatDateICT(link.started_at)}</span>
            </div>
          )}
          {link.ended_at && (
            <div className="dependency-link-card__date">
              <span className="dependency-link-card__date-label">{t('dependencyChainEndedLabel')}</span>
              <span className="dependency-link-card__date-value">{formatDateICT(link.ended_at)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
