import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getTeamLabelsByUserIds } from '@/lib/auth/member-teams'
import { formatDateICT, formatTimeICT, daysSinceICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { AgeLadder } from '@/components/AgeLadder'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'

export const metadata: Metadata = {
  title: 'Procurement — ADTECH Workflow Tracker',
}

type ProcurementLine = {
  id: string
  sourcing_started_at: string | null
  mr_submitted_at: string | null
  mr_approved_at: string | null
  po_issued_at: string | null
  delivery_received: number
  delivery_total: number | null
  customs_status: string | null
  created_at: string
  /** Brief 105 / v7.4 §23.8 / §5.4 — written ONLY when the "Not approved
   *  yet" warning was overridden, and never edited afterwards. The record
   *  stays visible on the line for good. */
  raised_before_approval: boolean | null
  override_accepted_at: string | null
  override_accepted_by: string | null
  override_package_id: string | null
}

/**
 * Screen 2c — procurement line (Brief 019). Record/detail archetype,
 * Design Note Rev 3 §4.3, 1300px, same family as Screen 2a.
 *
 * DATA-MODEL GAPS FOUND WHILE BUILDING THIS — reported per §1's own
 * instruction, not invented around (see ADTECH_WF_Result_019 for the full
 * account):
 *
 *   - workflow.procurement_lines carries no name/description/item column
 *     and no FK to workflow.project_items or a BOQ line. There is no real
 *     identity for a given line beyond its row itself, so lines are
 *     labelled by ordinal position (creation order) rather than by what is
 *     being procured — the brief's own vocabulary ("procurement line")
 *     used literally rather than a fabricated item name.
 *
 *   - workflow.procurement_lines carries no floor_id. Brief §4's "follows
 *     whatever the project itself uses" rule cannot be honoured for a
 *     project that DOES track floors (workflow.project_floors) — every
 *     line renders at project level regardless, and that project-level
 *     grouping is called out explicitly on screen when the project has
 *     floor rows, rather than silently presented as floor-aware.
 *
 *   - workflow.procurement_lines carries no owner/PIC column of its own.
 *     Design Note Rev 3 §4.9's "named person holding it, then age"
 *     invariant cannot be satisfied AT THE LINE LEVEL — the only named
 *     person available is the project's own PIC, shown in the header for
 *     identification only, NOT as who is doing the procurement work
 *     (§3.1 of the brief is explicit that the PIC is NOT that person).
 *     Each line's two bands therefore show a clock with no attached name,
 *     a deliberate, reported departure from the invariant rather than a
 *     fabricated owner.
 *
 * MR approval path (§2): shown as the plain fact recorded on the row
 * (submitted / approved timestamps) — NOT modelled as a chain, since
 * workflow.approval_steps is empty by design. Customs/logistics status
 * (§6, Design Note Rev 3 §8 point 4 — "logistics statuses (2c)" is still
 * hatched by design) renders inside an amber-hatched treatment: the
 * column is real and free-text, but no lookup vocabulary exists yet, so
 * it is shown as unspecified rather than categorised.
 *
 * READ-ONLY this round, matching Screen 2a's own precedent: no input
 * anywhere writes to procurement_lines from this screen. Migration 014
 * (Brief §3) grants an active procurement-team member write access at the
 * database level, ahead of any write UI — the same sequencing migration
 * 006 used ahead of screen 6a's own build.
 */
export default async function ProcurementLinePage({
  params,
}: PageProps<'/projects/[projectId]/procurement'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, so_number, pic_id, clients(name), sites(name)')
    .eq('id', projectId)
    .maybeSingle()

  // Same "not found or not visible" convention as /projects/[projectId]
  // and /projects/[projectId]/update — RLS and a genuinely missing row are
  // not distinguishable from here, and none of these screens try to.
  if (!project) {
    notFound()
  }

  const [{ data: procurementLines }, { count: floorCount }] = await Promise.all([
    supabase
      .from('procurement_lines')
      .select(
        'id, sourcing_started_at, mr_submitted_at, mr_approved_at, po_issued_at, delivery_received, delivery_total, customs_status, created_at, raised_before_approval, override_accepted_at, override_package_id, override_accepted_by',
      )
      .eq('project_id', project.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('project_floors')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id),
  ])

  // §23.8 names whoever accepted a PO-before-approval override, so their
  // profile is resolved with the PIC's in the same round trip.
  const overrideUserIds = (procurementLines ?? [])
    .map((l) => l.override_accepted_by)
    .filter((id): id is string => Boolean(id))
  const profiles = await getUserProfilesByIds(supabase, [project.pic_id, ...overrideUserIds])
  const teamLabels = await getTeamLabelsByUserIds(supabase, [project.pic_id])
  const picLabel = project.pic_id
    ? formatMemberName(profiles.get(project.pic_id), t('membersNoProfile'))
    : null
  const picTeam = project.pic_id ? teamLabels.get(project.pic_id) : undefined

  const client = Array.isArray(project.clients) ? project.clients[0] : project.clients
  const site = Array.isArray(project.sites) ? project.sites[0] : project.sites
  const lines = procurementLines ?? []
  const tracksFloors = (floorCount ?? 0) > 0

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
        ]}
        current={t('procurementLineKicker')}
      />
      <div className="procurement-line">
      <div className="procurement-line__header">
        <div className="procurement-line__identity">
          <div className="procurement-line__kicker-row">
            {project.so_number ? (
              <span className="so-record__so-badge">{project.so_number}</span>
            ) : (
              <span className="so-number so-number--pending">{t('soRecordNoSoYet')}</span>
            )}
            <span className="procurement-line__kicker">{t('procurementLineKicker')}</span>
          </div>
          <h1 className="procurement-line__title">{project.name}</h1>
          <div className="procurement-line__subline">
            {[client?.name, site?.name].filter(Boolean).join(' · ')}
          </div>
          {/* Brief 070 §3 — procurementLineBackLink ('Back to SO record')
              removed: the breadcrumb's own "<SO#>" ancestor above links
              to the exact same /projects/{id} destination. */}
        </div>
        <div className="procurement-line__owner-block">
          <span className="so-record__owner-label">{t('soRecordPicLabel')}</span>
          <span className={picLabel ? 'exception-card__pic' : 'exception-card__pic board-card__pic--unassigned'}>
            {(picLabel ?? t('dashboardUnassigned')).toUpperCase()}
          </span>
          {picTeam && <span className="so-record__owner-team">{picTeam}</span>}
        </div>
      </div>

      {tracksFloors && (
        <p className="procurement-line__gap-note">{t('procurementLineFloorGapNote')}</p>
      )}

      <div className="procurement-line__section-head">
        <h2 className="so-record__section-title">{t('procurementLineSectionTitle')}</h2>
        <span className="so-record__variations-count">{lines.length}</span>
      </div>

      {lines.length === 0 ? (
        <p className="empty-state">{t('procurementLineEmpty')}</p>
      ) : (
        <div className="procurement-line__list">
          {lines.map((line, i) => (
            <ProcurementLineCard
              key={line.id}
              index={i}
              line={line}
              t={t}
              overrideName={
                line.override_accepted_by
                  ? formatMemberName(profiles.get(line.override_accepted_by), t('membersNoProfile'))
                  : null
              }
            />
          ))}
        </div>
      )}

      <p className="procurement-line__write-note">{t('procurementLineWriteNote')}</p>
    </div>
    </>
  )
}

function ProcurementLineCard({
  index,
  line,
  t,
  overrideName,
}: {
  index: number
  line: ProcurementLine
  t: (key: import('@/lib/i18n/dictionary').DictionaryKey) => string
  /** §23.8 — the person who accepted raising this PO before approval. */
  overrideName: string | null
}) {
  const sourcingDays = line.sourcing_started_at ? daysSinceICT(line.sourcing_started_at) : null
  const poDays = line.mr_approved_at ? daysSinceICT(line.mr_approved_at) : null
  const mrWaitDays =
    line.mr_submitted_at && !line.mr_approved_at ? daysSinceICT(line.mr_submitted_at) : null
  const mrWaitedDays =
    line.mr_submitted_at && line.mr_approved_at
      ? daysSinceICT(line.mr_submitted_at, line.mr_approved_at)
      : null

  const deliveryKnown = line.delivery_total != null && line.delivery_total > 0

  return (
    <div className="procurement-line-card">
      <div className="procurement-line-card__label">
        {t('procurementLineOrdinalPrefix')} {index + 1}
        <span className="procurement-line-card__opened">{formatDateICT(line.created_at)}</span>
      </div>

      <div className="procurement-line-card__band">
        <span className="procurement-line-card__band-title procurement-line-card__band-title--sourcing">
          {t('procurementLineSourcingBand')}
        </span>
        {sourcingDays !== null ? (
          <AgeLadder days={sourcingDays} label={`${sourcingDays}d ${t('procurementLineSinceSourcingStarted')}`} full />
        ) : (
          <span className="procurement-line-card__empty">{t('procurementLineSourcingNotStarted')}</span>
        )}
      </div>

      <div className="procurement-line-card__band-rule" />

      <div className="procurement-line-card__band">
        <span className="procurement-line-card__band-title procurement-line-card__band-title--po">
          {t('procurementLinePoBand')}
        </span>
        {!line.mr_submitted_at && (
          <span className="procurement-line-card__empty">{t('procurementLineMrNotSubmitted')}</span>
        )}
        {mrWaitDays !== null && (
          <span className="procurement-line-card__mr-waiting">
            {t('procurementLineMrAwaitingApproval')} — {mrWaitDays}d
          </span>
        )}
        {line.mr_approved_at && poDays !== null && (
          <>
            {mrWaitedDays !== null && (
              <span className="procurement-line-card__mr-waited">
                {t('procurementLineMrApprovedAfter')} {mrWaitedDays}d
              </span>
            )}
            <AgeLadder days={poDays} label={`${poDays}d ${t('procurementLineSinceMrApproved')}`} full />
            <span className="procurement-line-card__po-status">
              {line.po_issued_at
                ? `${t('procurementLinePoIssued')} ${formatDateICT(line.po_issued_at)}`
                : t('procurementLinePoNotYetIssued')}
            </span>
          </>
        )}
        {/* §23.8 / §5.4 — the override record. Written only when the
            warning was overridden, never edited, and it stays on the line
            for good: a PO raised before its approval is a fact about how
            this line was ordered, not a transient warning state. */}
        {line.raised_before_approval && (
          <span className="procurement-line-card__override">
            <span className="procurement-line-card__override-title">
              {t('materialApprovalRaisedBeforeApproval')}
            </span>
            <span className="procurement-line-card__override-by">
              {t('materialApprovalAcceptedByPrefix')}{' '}
              <span className="procurement-line-card__override-name">
                {overrideName ?? t('dashboardUnassigned')}
              </span>
              {line.override_accepted_at
                ? ` · ${formatDateICT(line.override_accepted_at)}, ${formatTimeICT(line.override_accepted_at)}`
                : ''}
            </span>
          </span>
        )}
      </div>

      <div className="procurement-line-card__footer">
        <div className="procurement-line-card__delivery">
          <span className="procurement-line-card__footer-label">{t('procurementLineDeliveryLabel')}</span>
          <span className="procurement-line-card__footer-value">
            {deliveryKnown
              ? `${line.delivery_received}/${line.delivery_total} ${t('procurementLineDeliveredCount')}`
              : t('procurementLineDeliveryNotTracked')}
          </span>
        </div>
        <div className="procurement-line-card__customs">
          <span className="procurement-line-card__footer-label">{t('procurementLineCustomsLabel')}</span>
          <span className="procurement-line-card__hatched">
            {line.customs_status ?? t('procurementLineCustomsNone')}
          </span>
        </div>
      </div>
    </div>
  )
}
