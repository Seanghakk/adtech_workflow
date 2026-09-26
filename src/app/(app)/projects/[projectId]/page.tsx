import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { getTeamLabelsByUserIds } from '@/lib/auth/member-teams'
import { formatDateICT, daysSinceICT } from '@/lib/format/datetime'
import { formatUsd0 } from '@/lib/format/money'
import { getServerTranslator, getServerLang } from '@/lib/i18n/server'
import { localizedLabel } from '@/lib/i18n/localized-label'
import { computeDependencyChain } from '@/lib/reporting/dependency-chain'
import { getAgeLabelBand } from '@/lib/age'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import { buildSystemMatrixRows, orderFloors, systemCoverageCaption } from './floor-matrix'
import { resolveLatestInspection, type LatestInspection } from '@/lib/subStageDisplayState'
import { FloorMatrix } from './FloorMatrix'
import { getSetupSectionsStatus } from './setup/setup-status'

export const metadata: Metadata = {
  title: 'SO record — ADTECH Workflow Tracker',
}

/**
 * Screen 2a — SO record (Brief 018 §2). Record/detail archetype, Design
 * Note Rev 3 §4.3. READ-ONLY this round (§2.1) — no editing, no
 * approving, no status changes anywhere on this page; the approval
 * model (workflow.approval_steps) does not exist yet.
 *
 * DEPARTURES FROM THE REV 2 MOCKUP, all because the column does not
 * exist in the live schema (§1's own instruction: report rather than
 * invent) — see ADTECH_WF_Result_018 for the full list:
 *   - No "Contract value" / "+ Variations" value figures: workflow.projects
 *     has no contract-value column and workflow.variations has no
 *     line-value column distinct from committed_amount.
 *   - No per-variation "raised by" name: workflow.variations carries no
 *     author column. The screen's owner mark is the project's own PIC
 *     in the header instead.
 *   - No "Linked drawings" panel or QS panel: no drawings/submittals
 *     table exists in this schema (workflow.shop_drawing_items is a
 *     different concept — Brief 007's own production-stage tracking,
 *     not a consultant-approval workflow — and building the mockup's
 *     panel against it would misrepresent that data).
 *   - The stage strip renders LIVE from workflow.stages (filtered to
 *     this project's scope_type), not hatched as provisional the way
 *     the Rev 2 mockup drew it — Design Note Rev 3 §8's own "still
 *     hatched" list (stream capacity/approval chain/logistics statuses)
 *     no longer includes the per-scope-type stage list, since Brief 017
 *     shipped the admin screen that fills it.
 */
export default async function SoRecordPage({
  params,
  searchParams,
}: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await params
  const sp = await searchParams
  const supabase = await createClient()
  const t = await getServerTranslator()
  const lang = await getServerLang()

  // Brief 056 §7 — same plain ?view= URL-param pattern as shop-drawing-
  // boq's own grouped views (Brief 049), not client state. An unrecognized
  // or missing value falls back to this page's normal, unchanged content.
  const viewParam = Array.isArray(sp.view) ? sp.view[0] : sp.view
  const isMatrixView = viewParam === 'matrix'

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, name, stream, scope_type, so_number, status, pic_id, opened_at, so_assigned_at, current_stage_id, cad_owner_name, cad_consultant_name, clients(name), sites(name), so_registers(label_en, label_km)',
    )
    .eq('id', projectId)
    .maybeSingle()

  // Brief 100 Part C / v7.2 §21.0 — a read that FAILED is not the same as
  // a row that is not there. The second is notFound() below; the first
  // gets the failed state, never a blank page.
  if (projectError) {
    return <SoRecordLoadFailed t={t} />
  }

  // Same "not found or not visible" convention as /projects/[projectId]/update
  // (Brief 002) — RLS (workflow.can_view_project for a sales-restricted
  // member) and a genuinely missing row are not distinguishable from here,
  // and neither this screen nor that one tries to.
  if (!project) {
    notFound()
  }

  // Brief 056 §7 — a focused, single-purpose "glance" screen: none of the
  // SO record's own variation/request/procurement/dependency/BOQ queries
  // below are needed here, so the matrix view returns early rather than
  // running (and discarding) all of them first.
  if (isMatrixView) {
    const [{ data: towerRows }, { data: floorRows }] = await Promise.all([
      supabase.from('project_towers').select('id, label, sort_order').eq('project_id', project.id).order('sort_order'),
      supabase.from('project_floors').select('id, label, sort_order, tower_id').eq('project_id', project.id).order('sort_order'),
    ])

    const floorIds = (floorRows ?? []).map((f) => f.id)
    const [{ data: subStageRows }, { data: inspectionRows }] = await Promise.all([
      // Brief 106b — cells carry their system now, so the matrix can put
      // each system's five columns side by side (§11.5).
      floorIds.length > 0
        ? supabase
            .from('progress_cells')
            .select('id, project_system_id, floor_id, stage, sub_stage, status, updated_at')
            .in('floor_id', floorIds)
        : Promise.resolve({ data: [] }),
      floorIds.length > 0
        ? supabase
            .from('qc_inspections')
            .select('progress_cell_id, status, inspected_at, created_at')
            .eq('project_id', project.id)
            .in('status', ['pass', 'fail'])
        : Promise.resolve({ data: [] }),
    ])

    // Brief 078 / v6 §7.1 — LATEST inspection per sub-stage, not "any pass
    // ever" (the prior rule here: a fail after an old pass used to stay
    // green forever, since passedSubStageIds only ever recorded whether a
    // pass had EVER happened, ignoring order). inspected_at falls back to
    // created_at since the column is nullable (migration 008) — see
    // src/lib/subStageDisplayState.ts's own header.
    const inspectionsBySubStage = new Map<string, { result: 'pass' | 'fail'; date: string }[]>()
    for (const r of inspectionRows ?? []) {
      if (r.progress_cell_id === null || (r.status !== 'pass' && r.status !== 'fail')) continue
      const list = inspectionsBySubStage.get(r.progress_cell_id) ?? []
      list.push({ result: r.status, date: r.inspected_at ?? r.created_at })
      inspectionsBySubStage.set(r.progress_cell_id, list)
    }
    const latestInspectionBySubStageId = new Map<string, LatestInspection | null>(
      [...inspectionsBySubStage.entries()].map(([id, rows]) => [id, resolveLatestInspection(rows)]),
    )

    // Brief 106b / §11.5 — systems side by side, in Project setup order, the
    // same order §22.6a groups its blocks by.
    const { data: matrixSystemRows } = await supabase
      .from('project_systems')
      .select('id, name')
      .eq('project_id', project.id)
      .order('name')

    const { data: matrixCoverage } = (matrixSystemRows ?? []).length
      ? await supabase
          .from('project_system_floors')
          .select('project_system_id, floor_id')
          .in('project_system_id', (matrixSystemRows ?? []).map((r) => r.id))
          .is('removed_at', null)
      : { data: [] }

    const matrixSystems = (matrixSystemRows ?? []).map((sys) => ({
      id: sys.id,
      name: sys.name,
      coveredFloorIds: new Set(
        (matrixCoverage ?? []).filter((c) => c.project_system_id === sys.id).map((c) => c.floor_id),
      ),
    }))

    const orderedForCaption = orderFloors(
      (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order })),
      (floorRows ?? []).map((f) => ({ id: f.id, label: f.label, sortOrder: f.sort_order, towerId: f.tower_id })),
    )
    const systemCaptions: Record<string, { count: number; range: string | null }> = {}
    for (const sys of matrixSystems) {
      systemCaptions[sys.id] = systemCoverageCaption(
        orderedForCaption.map((f) => f.id),
        orderedForCaption.map((f) => f.label),
        sys.coveredFloorIds,
      )
    }

    // §11.5 — a system covering NO floors is kept out of the grid entirely
    // and named in a sentence beneath it. A column of dashed cells would be
    // wrong twice over: "not applicable" means a floor outside coverage, and
    // a system covering nothing has no floors to be outside of.
    const systemsWithCoverage = matrixSystems.filter((sys) => sys.coveredFloorIds.size > 0)
    const systemsWithoutCoverage = matrixSystems
      .filter((sys) => sys.coveredFloorIds.size === 0)
      .map((sys) => ({ id: sys.id, name: sys.name }))

    const matrixRows = buildSystemMatrixRows({
      towers: (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order })),
      floors: (floorRows ?? []).map((f) => ({ id: f.id, label: f.label, sortOrder: f.sort_order, towerId: f.tower_id })),
      systems: systemsWithCoverage,
      cells: (subStageRows ?? []).map((s) => ({
        id: s.id,
        systemId: s.project_system_id,
        floorId: s.floor_id,
        stage: s.stage,
        subStage: s.sub_stage,
        status: s.status,
        updatedAt: s.updated_at,
      })),
      latestInspectionBySubStageId,
      // Brief 056 §4: the SAME src/lib/age.ts thresholds every other
      // staleness read in this app uses — not a second definition. Now
      // generic over which date to clock (v6 §7.3 — a QC-failed cell
      // clocks from its failed inspection's date, not its status date;
      // see floor-matrix.ts's own computeCellState).
      daysSince: (isoDate) => daysSinceICT(isoDate),
      isStale: (days) => getAgeLabelBand(days) === 'stalled',
    })

    return (
      <>
        {/* Brief 070 §2.3/§3 — same "Board / <SO#>" breadcrumb as the
            plain (non-matrix) view below: this is the SAME route/page,
            just a different view of it (?view=matrix), not a distinct
            hierarchy node — so its breadcrumb does not reach a "Floor
            progress" crumb, and does NOT cover floorMatrixBackToSoRecord's
            own destination (switching back to the non-matrix view of
            this exact page). That back link is kept, not removed — see
            Brief 070's own Result doc §3. */}
        <Breadcrumbs
          ancestors={[{ label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href }]}
          current={project.so_number ?? t('soRecordNoSoYet')}
        />
        <div className="so-record">
        <div className="so-record__header">
          <div className="so-record__identity">
            <div className="so-record__kicker-row">
              {project.so_number ? (
                <span className="so-record__so-badge">{project.so_number}</span>
              ) : (
                <span className="so-number so-number--pending">{t('soRecordNoSoYet')}</span>
              )}
            </div>
            <h1 className="so-record__title">{project.name}</h1>
          </div>
        </div>

        <div className="floor-matrix__page-head">
          <span className="floor-matrix__kicker">{t('floorMatrixKicker')}</span>
          <Link href={`/projects/${project.id}`}>{t('floorMatrixBackToSoRecord')}</Link>
        </div>

        <FloorMatrix projectId={project.id} rows={matrixRows} t={t} systemCaptions={systemCaptions} systemsWithoutCoverage={systemsWithoutCoverage}
          selectedSystemId={typeof sp.system === 'string' ? sp.system : null} />
        </div>
      </>
    )
  }

  const [
    { data: variations },
    { data: scopeTypes },
    { data: stages },
    { data: linkedRequests, error: requestsError },
    { data: procurementLines, error: procurementError },
    { data: dependencyLinks, error: dependencyError },
  ] = await Promise.all([
    supabase
      .from('variations')
      .select('id, description, is_approved, committed_amount, raised_at, approved_at')
      .eq('project_id', project.id)
      .order('raised_at'),
    supabase.from('scope_types').select('code, label_en, label_km'),
    project.scope_type
      ? supabase
          .from('stages')
          .select('id, label_en, label_km, sequence')
          .eq('scope_type', project.scope_type)
          .eq('is_active', true)
          .order('sequence')
      : Promise.resolve({ data: [] as { id: string; label_en: string; label_km: string | null; sequence: number }[] }),
    supabase
      .from('requests')
      .select('id, body, current_owner_id, opened_at')
      .eq('project_id', project.id)
      .is('closed_at', null),
    supabase
      .from('procurement_lines')
      .select('id, sourcing_started_at, po_issued_at, delivery_received, delivery_total')
      .eq('project_id', project.id),
    supabase
      .from('dependency_links')
      .select('id, sequence, name, days_allowed, started_at, ended_at, created_at')
      .eq('project_id', project.id)
      .order('sequence', { ascending: true }),
  ])

  const profiles = await getUserProfilesByIds(supabase, [
    project.pic_id,
    ...(linkedRequests ?? []).map((r) => r.current_owner_id),
  ])
  const teamLabels = await getTeamLabelsByUserIds(supabase, [project.pic_id])

  const picLabel = project.pic_id
    ? formatMemberName(profiles.get(project.pic_id), t('membersNoProfile'))
    : null
  const picTeam = project.pic_id ? teamLabels.get(project.pic_id) : undefined

  const scopeTypeMap = new Map((scopeTypes ?? []).map((s) => [s.code, s]))
  const scopeTypeLabel = project.scope_type
    ? localizedLabel(
        scopeTypeMap.get(project.scope_type)?.label_en ?? project.scope_type,
        scopeTypeMap.get(project.scope_type)?.label_km ?? null,
        lang,
      )
    : null

  const client = Array.isArray(project.clients) ? project.clients[0] : project.clients
  const site = Array.isArray(project.sites) ? project.sites[0] : project.sites
  const soRegister = Array.isArray(project.so_registers) ? project.so_registers[0] : project.so_registers
  const soRegisterLabel = soRegister ? localizedLabel(soRegister.label_en, soRegister.label_km, lang) : null

  // Brief 097 §2 — the single "Project setup — n of 6 sections done" link
  // replaces the three stacked panels (Contract BOQ / Floors / Shop
  // drawing BOQ) below. Same shared computation the setup page itself
  // uses (setup/setup-status.ts) so the two can never disagree.
  const setupStatus = await getSetupSectionsStatus(supabase, project.id, project, client?.name)

  // Brief 105 / v7.4 §23.3 — the material approval register tile. §23.3 is
  // explicit that this is NOT an eighth journey item and NOT an Execution
  // subtree item (every subtree item is a cross-project list, and this one
  // would be empty on every project for months), so the SO record is the
  // one place the route is reachable from by browsing.
  const { data: maRows } = await supabase
    .from('material_approval_packages')
    .select(`id, source, material_approval_revisions ( material_approval_submissions ( returned_on, code ) )`)
    .eq('project_id', project.id)

  const maPackages = maRows?.length ?? 0
  const maApproved = (maRows ?? []).filter((p) =>
    p.source === 'paper' ||
    (p.material_approval_revisions ?? []).some((r) =>
      (r.material_approval_submissions ?? []).some((x) => x.code === 'A' || x.code === 'B'),
    ),
  ).length

  // Brief 100 Part C — §21.5's "recent" strand. progress_updates is this
  // app's own record of who moved what and when; the SO record had no
  // recent list before.
  const { data: recentRows, error: recentError } = await supabase
    .from('progress_updates')
    .select('id, author_id, recorded_at, old_percent, new_percent')
    .eq('subject_type', 'project')
    .eq('subject_id', project.id)
    .order('recorded_at', { ascending: false })
    .limit(4)

  const recentAuthorIds = [...new Set((recentRows ?? []).map((r) => r.author_id).filter(Boolean))] as string[]
  const recentProfiles = recentAuthorIds.length
    ? await getUserProfilesByIds(supabase, recentAuthorIds)
    : new Map()
  const recent = (recentRows ?? []).map((r) => ({
    id: r.id,
    at: r.recorded_at,
    by: r.author_id ? formatMemberName(recentProfiles.get(r.author_id), t('membersNoProfile')) : null,
    newPercent: r.new_percent,
  }))

  const approvedVariations = (variations ?? []).filter((v) => v.is_approved)
  const unapprovedVariations = (variations ?? []).filter((v) => !v.is_approved)
  const atRiskTotal = unapprovedVariations.reduce((sum, v) => sum + (v.committed_amount ?? 0), 0)

  const stageList = stages ?? []
  const currentStageIndex = stageList.findIndex((s) => s.id === project.current_stage_id)

  const requestRows = (linkedRequests ?? [])
    .map((r) => ({
      id: r.id,
      body: r.body,
      ownerLabel: r.current_owner_id
        ? formatMemberName(profiles.get(r.current_owner_id), t('membersNoProfile'))
        : t('dashboardUnassigned'),
      ageDays: daysSinceICT(r.opened_at),
    }))
    .sort((a, b) => b.ageDays - a.ageDays)

  const procurementRows = procurementLines ?? []
  const procurementSummary = {
    total: procurementRows.length,
    poIssued: procurementRows.filter((p) => p.po_issued_at).length,
    deliveredInFull: procurementRows.filter(
      (p) => p.delivery_total != null && p.delivery_total > 0 && p.delivery_received === p.delivery_total,
    ).length,
    sourcingNoPoYet: procurementRows.filter((p) => !p.po_issued_at && p.sourcing_started_at).length,
  }

  const { rows: dependencyRows, totalSlip: dependencySlip } = computeDependencyChain(dependencyLinks ?? [])

  // Brief 100 Part C review item 1 / Brief 100 §4: "Every failed read shows
  // the 21.0 failed state, never an empty table." Wiring only the project
  // read was not enough — every source behind this page is checked, because
  // a failed read that falls back to an empty list or a zero count is
  // indistinguishable on screen from a project that genuinely has nothing.
  if (setupStatus.readFailed || recentError || requestsError || procurementError || dependencyError) {
    return <SoRecordLoadFailed t={t} />
  }

  // §21.5 "Nothing in any tile" — the live column's empty state fires when
  // there is genuinely nothing moving, not merely when one strand is bare.
  const nothingMoving =
    requestRows.length === 0 && procurementSummary.total === 0 && dependencyRows.length === 0

  // §21.5 — the register's subline names the section that comes next.
  const NEXT_SECTION_KEYS = [
    'soHubNextIdentity',
    'soHubNextFloors',
    'soHubNextSystems',
    'soHubNextBoq',
    'soHubNextDrawings',
    'soHubNextExports',
  ] as const
  // Zero towers is a valid project shape (v7.2 §6.2 item 2), so the tile
  // has to read properly at 0 and 1, not just at "many".
  const towerDetail =
    setupStatus.towerCount === 0
      ? t('soHubTowersNone')
      : setupStatus.towerCount === 1
        ? `1 ${t('soHubTowerSingular')}`
        : `${setupStatus.towerCount} ${t('soHubTowersSuffix')}`

  const nextSectionLabel = setupStatus.nextSection
    ? t(NEXT_SECTION_KEYS[setupStatus.nextSection - 1])
    : t('soHubAllSectionsDone')

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href }]}
        current={project.so_number ?? t('soRecordNoSoYet')}
      />
      <div className="so-record">
      <div className="so-record__header">
        <div className="so-record__identity">
          <div className="so-record__kicker-row">
            {project.so_number ? (
              <span className="so-record__so-badge">{project.so_number}</span>
            ) : (
              <span className="so-number so-number--pending">{t('soRecordNoSoYet')}</span>
            )}
            {soRegisterLabel && <span className="stream-tag">{soRegisterLabel}</span>}
            {scopeTypeLabel && (
              <span className="so-record__scope-badge">{scopeTypeLabel}</span>
            )}
          </div>
          <h1 className="so-record__title">{project.name}</h1>
          <div className="so-record__subline">
            {[client?.name, site?.name].filter(Boolean).join(' · ')}
          </div>
          {!project.so_number && (
            <p className="so-record__awaiting-note">
              {t('soRecordAwaitingSoNote')}{' '}
              <Link href="/awaiting-so">{t('navAwaitingSo')}</Link> {t('soRecordAwaitingSoNoteSuffix')}
            </p>
          )}
        </div>
        <div className="so-record__owner-block">
          <span className="so-record__owner-label">{t('soRecordPicLabel')}</span>
          <span className={picLabel ? 'exception-card__pic' : 'exception-card__pic board-card__pic--unassigned'}>
            {(picLabel ?? t('dashboardUnassigned')).toUpperCase()}
          </span>
          {picTeam && <span className="so-record__owner-team">{picTeam}</span>}
        </div>
      </div>

      <div className="so-record__stage-section">
        <div className="so-record__section-title">{t('soRecordStageStripTitle')}</div>
        {!project.scope_type ? (
          <p className="empty-state">{t('soRecordStageStripNoScopeType')}</p>
        ) : stageList.length === 0 ? (
          <p className="empty-state">{t('soRecordStageStripEmpty')}</p>
        ) : (
          <div className="so-record__stage-strip">
            {stageList.map((stage, i) => {
              const state =
                currentStageIndex === -1
                  ? 'upcoming'
                  : i < currentStageIndex
                    ? 'done'
                    : i === currentStageIndex
                      ? 'current'
                      : 'upcoming'
              return (
                <span key={stage.id} className={`so-record__stage so-record__stage--${state}`}>
                  {localizedLabel(stage.label_en, stage.label_km, lang)}
                </span>
              )
            })}
          </div>
        )}
      </div>

      <div className="so-record__variations">
        <div className="so-record__variations-head">
          <h2 className="so-record__section-title">{t('soRecordVariationsTitle')}</h2>
          <span className="so-record__variations-count">{(variations ?? []).length}</span>
          <span className="so-record__variations-caption">{t('soRecordVariationsCaption')}</span>
        </div>

        {(variations ?? []).length === 0 ? (
          <p className="empty-state">{t('soRecordVariationsEmpty')}</p>
        ) : (
          <>
            <div className="so-record__variation-grid so-record__variation-grid--head">
              <span>{t('soRecordColDescription')}</span>
              <span>{t('soRecordColCommitted')}</span>
              <span>{t('soRecordColApproval')}</span>
            </div>

            {approvedVariations.map((v) => (
              <VariationRow key={v.id} variation={v} t={t} />
            ))}

            {unapprovedVariations.length > 0 && (
              <>
                {approvedVariations.length > 0 && <div className="so-record__variations-rule" />}
                {atRiskTotal > 0 && (
                  <div className="so-record__at-risk-banner">
                    <span className="so-record__at-risk-kicker">{t('soRecordAtRiskBannerKicker')}</span>
                    <span className="so-record__at-risk-body">
                      {t('soRecordAtRiskBannerBody')} <strong>{formatUsd0(atRiskTotal)}</strong>
                    </span>
                  </div>
                )}
                {unapprovedVariations.map((v) => (
                  <VariationRow key={v.id} variation={v} t={t} unapproved />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Brief 100 Part C — v7.2 §21.5 / mockup 6f. Two columns on the
          2px rule: the live work on the left, the register on the right.
          The register replaces the Floors & zones, Contract BOQ, Shop
          drawing BOQ and Tender BOQ panels; Brief 097's "Project setup —
          n of 6 sections done" link stays exactly as it is, now with the
          strip's own mark and a subline naming what comes next. */}
      <div className="so-hub">
        <div className="so-hub__live">
          <h2 className="so-record__section-title">{t('soHubLiveTitle')}</h2>

          {nothingMoving ? (
            /* §21.5 "Nothing in any tile" — the 4.5 empty part. */
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('soHubNothingMovingHeadline')}</p>
              <p className="wf-empty-state-card__body">{t('soHubNothingMovingBody')}</p>
              <div className="wf-empty-state-card__actions">
                <Link href={`/projects/${project.id}/setup`} className="btn btn--primary">
                  {t('soHubOpenProjectSetup')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="so-record__panel">
                <div className="so-record__panel-head">
                  <span className="so-record__panel-title">{t('soRecordLinkedRequestsTitle')}</span>
                  <span className="so-record__panel-count">{requestRows.length}</span>
                </div>
                {requestRows.length === 0 ? (
                  <p className="empty-state">{t('soRecordLinkedRequestsEmpty')}</p>
                ) : (
                  <div className="so-record__panel-list">
                    {requestRows.map((r) => (
                      <div key={r.id} className="so-record__panel-row">
                        <span className="so-record__panel-row-body">{r.body}</span>
                        <span className="so-record__panel-row-owner">{r.ownerLabel}</span>
                        <span className="so-record__panel-row-age">{r.ageDays}d</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="so-record__panel">
                <div className="so-record__panel-head">
                  <span className="so-record__panel-title">{t('soRecordLinkedProcurementTitle')}</span>
                  <span className="so-record__panel-count">{procurementSummary.total}</span>
                </div>
                {procurementSummary.total === 0 ? (
                  <p className="empty-state">{t('soRecordLinkedProcurementEmpty')}</p>
                ) : (
                  <div className="so-record__panel-list">
                    <div className="so-record__panel-row">
                      <span className="so-record__panel-row-body">{t('soRecordProcurementPoIssued')}</span>
                      <span className="so-record__panel-row-age">{procurementSummary.poIssued}</span>
                    </div>
                    <div className="so-record__panel-row">
                      <span className="so-record__panel-row-body">{t('soRecordProcurementDelivered')}</span>
                      <span className="so-record__panel-row-age">{procurementSummary.deliveredInFull}</span>
                    </div>
                    <div className="so-record__panel-row">
                      <span className="so-record__panel-row-body">{t('soRecordProcurementSourcing')}</span>
                      <span className="so-record__panel-row-age">{procurementSummary.sourcingNoPoYet}</span>
                    </div>
                  </div>
                )}
                <Link href={`/projects/${project.id}/procurement`} className="awaiting-so-card__link">
                  {t('soRecordViewProcurement')}
                </Link>
              </div>

              <div className="so-record__panel">
                <div className="so-record__panel-head">
                  <span className="so-record__panel-title">{t('soRecordLinkedDependencyChainTitle')}</span>
                  <span className="so-record__panel-count">{dependencyRows.length}</span>
                </div>
                {dependencyRows.length === 0 ? (
                  <p className="empty-state">{t('soRecordLinkedDependencyChainEmpty')}</p>
                ) : (
                  <div className="so-record__panel-list">
                    <div className="so-record__panel-row">
                      <span className="so-record__panel-row-body">
                        {dependencySlip > 0 ? t('soRecordDependencyChainSlipped') : t('soRecordDependencyChainOnTrack')}
                      </span>
                      <span
                        className={
                          dependencySlip > 0
                            ? 'so-record__panel-row-age so-record__panel-row-age--danger'
                            : 'so-record__panel-row-age'
                        }
                      >
                        {dependencySlip > 0 ? `+${dependencySlip}d` : '—'}
                      </span>
                    </div>
                  </div>
                )}
                <Link href={`/projects/${project.id}/dependencies`} className="awaiting-so-card__link">
                  {t('soRecordViewDependencyChain')}
                </Link>
              </div>
            </>
          )}

          {/* §21.5 — Recent. */}
          <div className="so-record__panel">
            <div className="so-record__panel-head">
              <span className="so-record__panel-title">{t('soHubRecentTitle')}</span>
            </div>
            {recent.length === 0 ? (
              <p className="empty-state">
                {project.so_assigned_at
                  ? `${t('soHubSoAssignedPrefix')} ${formatDateICT(project.so_assigned_at)}. `
                  : ''}
                {t('soHubNothingRecordedSince')}
              </p>
            ) : (
              <div className="so-record__panel-list">
                {recent.map((r) => (
                  <div key={r.id} className="so-record__panel-row">
                    <span className="so-record__panel-row-body">
                      {t('soHubRecentPercentPrefix')} {r.newPercent}%
                      {r.by ? ` ${t('soHubRecentBy')} ${r.by}` : ''}
                    </span>
                    <span className="so-record__panel-row-age">{formatDateICT(r.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="so-hub__register">
          <h2 className="so-record__section-title">{t('soHubRegisterTitle')}</h2>

          {/* §21.5 — ONE link row, with the strip's mark for the overall
              state and a subline naming the next section. */}
          <Link href={`/projects/${project.id}/setup`} className="so-hub__setup-row">
            <span
              className={
                setupStatus.doneCount === 6
                  ? 'wf-setup-strip__mark wf-setup-strip__mark--done'
                  : setupStatus.doneCount > 0
                    ? 'wf-setup-strip__mark wf-setup-strip__mark--partly'
                    : 'wf-setup-strip__mark'
              }
              aria-hidden="true"
            />
            <span className="so-hub__setup-text">
              <span className="so-hub__setup-title">
                {t('setupKicker')} — {setupStatus.doneCount} {t('soRecordSetupSectionsDoneSuffix')}
              </span>
              <span className="so-hub__setup-subline">{nextSectionLabel}</span>
            </span>
          </Link>

          {/* §21.5 — four read-out tiles. Counts, not results; links,
              never edit controls. */}
          <div className="so-hub__tiles">
            <HubTile
              label={t('soHubTileFloors')}
              value={String(setupStatus.floorCount)}
              detail={towerDetail}
              href={`/projects/${project.id}/setup#structure`}
              linkText={setupStatus.floorCount === 0 ? t('soHubSetUpFloors') : t('soHubOpen')}
            />
            <HubTile
              label={t('soHubTileBoq')}
              value={String(setupStatus.boqLineCount)}
              detail={`${setupStatus.boqTiersFilled} ${t('soHubTiersImportedSuffix')}`}
              href={`/projects/${project.id}/setup#boq`}
              linkText={setupStatus.boqLineCount === 0 ? t('soHubImportABoq') : t('soHubOpen')}
            />
            {/* The DRAWINGS tile goes to the REGISTER, not to Project
                setup's summary of it. It used to land on
                /setup#drawings, which shows a count and — once any
                drawing exists — carries no onward link at all, so the
                one tile in this hub that says "drawings" dead-ended on a
                number. The register is on the update screen. */}
            <HubTile
              label={t('soHubTileDrawings')}
              value={String(setupStatus.drawingCount)}
              detail={t('soHubRegisteredSuffix')}
              href={`/projects/${project.id}/update`}
              linkText={setupStatus.drawingCount === 0 ? t('soHubOpenShopDrawings') : t('soHubOpen')}
            />
            {/* §23.3 — "Material approval — n packages · n approved", or
                "nothing recorded" when there is none. */}
            <HubTile
              label={t('materialApprovalHeading')}
              value={maPackages === 0 ? '\u2014' : String(maPackages)}
              detail={
                maPackages === 0
                  ? t('materialApprovalTileNothing')
                  : `${maPackages} ${t('materialApprovalTilePackagesSuffix')} \u00b7 ${maApproved} ${t('materialApprovalTileApprovedSuffix')}`
              }
              href={`/projects/${project.id}/material-approval`}
              linkText={t('soHubOpen')}
            />
            <HubTile
              label={t('soHubTileLastExport')}
              value={setupStatus.lastExportAt ? formatDateICT(setupStatus.lastExportAt) : '\u2014'}
              detail={setupStatus.lastExportAt ? '' : t('soHubNeverExported')}
              href={`/projects/${project.id}/export`}
              linkText={setupStatus.lastExportAt ? t('soHubOpen') : t('soHubOpenExportPanel')}
            />
          </div>

          {/* Brief 100 Part D — the per-project entry to the execution
              overview. Ungated on purpose: the overview's own §21.6 empty
              states are written for the no-floors and no-readings cases,
              so it is worth reaching before there is anything to draw.
              The global rail's 'Overview' item is a separate, still-absent
              CROSS-project screen and stays case (C) in src/lib/nav.ts. */}
          <Link href={`/projects/${project.id}/overview`} className="awaiting-so-card__link">
            {t('soRecordViewOverview')}
          </Link>

          {/* Brief 056 §7 — the matrix's second entry point. Only once
              floors exist; a matrix over zero floors is an empty grid.
              Not one of the six setup sections, so it keeps its own row. */}
          {setupStatus.structureDone && (
            <Link href={`/projects/${project.id}?view=matrix`} className="awaiting-so-card__link">
              {t('soRecordViewMatrix')}
            </Link>
          )}
        </div>
      </div>
    </div>
    </>
  )
}

function VariationRow({
  variation,
  t,
  unapproved = false,
}: {
  variation: {
    id: string
    description: string
    is_approved: boolean
    committed_amount: number | null
    raised_at: string
    approved_at: string | null
  }
  t: (key: import('@/lib/i18n/dictionary').DictionaryKey) => string
  unapproved?: boolean
}) {
  const atRisk = unapproved && variation.committed_amount != null
  return (
    <div
      className={
        atRisk
          ? 'so-record__variation-grid so-record__variation-grid--at-risk'
          : 'so-record__variation-grid'
      }
    >
      <div className="so-record__variation-description">
        <div>{variation.description}</div>
        <div className="so-record__variation-date">{formatDateICT(variation.raised_at)}</div>
      </div>
      <div className={atRisk ? 'so-record__variation-committed so-record__variation-committed--at-risk' : 'so-record__variation-committed'}>
        {variation.committed_amount != null ? formatUsd0(variation.committed_amount) : '—'}
        {atRisk && <div className="so-record__variation-at-risk-tag">{t('soRecordAtRisk')}</div>}
      </div>
      <div>
        {variation.is_approved ? (
          <span className="so-record__approval-badge so-record__approval-badge--approved">
            {t('soRecordApproved')}
            {variation.approved_at ? ` ${formatDateICT(variation.approved_at)}` : ''}
          </span>
        ) : (
          <span className="so-record__approval-badge so-record__approval-badge--unapproved">
            {t('soRecordNotApproved')}
          </span>
        )}
      </div>
    </div>
  )
}

/** v7.2 §21.5 — a read-out tile: a count, what it counts, and a link to
 *  its own section of the setup page. Page chrome, not a new shared part,
 *  and never an edit control. */
function HubTile({
  label,
  value,
  detail,
  href,
  linkText,
}: {
  label: string
  value: string
  detail: string
  href: string
  linkText: string
}) {
  return (
    <div className="so-hub__tile">
      <span className="so-hub__tile-label">{label}</span>
      <span className="so-hub__tile-value">{value}</span>
      {detail && <span className="so-hub__tile-detail">{detail}</span>}
      <Link href={href} className="so-hub__tile-link">
        {linkText}
      </Link>
    </div>
  )
}

/** v7.2 §21.0 — the failed state, for any read this page depends on.
 *  Shared so the project row and the hub's own sources cannot drift into
 *  showing different things for the same kind of failure. */
function SoRecordLoadFailed({ t }: { t: (key: import('@/lib/i18n/dictionary').DictionaryKey) => string }) {
  return (
    <div className="so-record">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('soHubLoadFailedHeadline')}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
