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
export default async function SoRecordPage({ params }: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()
  const lang = await getServerLang()

  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, name, stream, scope_type, so_number, status, pic_id, opened_at, current_stage_id, clients(name), sites(name), so_registers(label_en, label_km)',
    )
    .eq('id', projectId)
    .maybeSingle()

  // Same "not found or not visible" convention as /projects/[projectId]/update
  // (Brief 002) — RLS (workflow.can_view_project for a sales-restricted
  // member) and a genuinely missing row are not distinguishable from here,
  // and neither this screen nor that one tries to.
  if (!project) {
    notFound()
  }

  const [
    { data: variations },
    { data: scopeTypes },
    { data: stages },
    { data: linkedRequests },
    { data: procurementLines },
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

  return (
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

      <div className="so-record__panels">
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
      </div>
    </div>
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
