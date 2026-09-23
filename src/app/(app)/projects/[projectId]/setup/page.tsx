import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { getUserProfilesByIds, formatMemberName } from '@/lib/auth/user-profiles'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import { IdentityForm } from './IdentityForm'
import { NumberingModeSwitch } from './NumberingModeSwitch'
import { FloorTableRow, type FloorTableRowData } from './FloorTableRow'
import { AddFloorRow } from './AddFloorRow'
import { AddTowerRow } from './AddTowerRow'
import { SystemsSection, type ProjectSystemRow } from './SystemsSection'
import { canImportTier } from '@/lib/boq/permissions'
import { getCurrentMember } from '@/lib/auth/current-member'

export const metadata: Metadata = {
  title: 'Project setup — ADTECH Workflow Tracker',
}

/**
 * Brief 097 — the Project Setup page (v7.2 §6, §21.1). One page holding
 * everything a project needs configured, in dependency order. Absorbs
 * /floors completely (see the redirect there) and gives Contract/Tender/
 * Shop-drawing BOQ, the drawing register and the AutoCAD export one home
 * — sections 4 and 6 are summaries only here (Briefs 098/099 build their
 * own full screens).
 *
 * Server Component: fetches everything in dependency order, renders the
 * strip and all six sections. isPic gates every write control's render
 * (v7.2 §6.4) — the SECURITY DEFINER function (migration 036) and the
 * existing floors RLS policies are the real enforcement, same
 * belt-and-suspenders convention every other project-scoped screen in
 * this app already uses.
 */
export default async function ProjectSetupPage({ params }: PageProps<'/projects/[projectId]/setup'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const { user, member } = await getCurrentMember()

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select(
      'id, name, pic_id, so_number, scope_type, cad_owner_name, cad_consultant_name, drawing_numbering_mode, clients(name), sites(name)',
    )
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) {
    return <LoadFailedPage t={t} />
  }
  if (!project) {
    notFound()
  }

  const isPic = Boolean(user && project.pic_id && project.pic_id === user.id)
  // Brief 099 §3 — the BOQ section's own "Import a BOQ" links follow each
  // tier's owner, exactly as the import screen itself does.
  const who = { isPic, isSuperadmin: Boolean(member?.isSuperadmin), teamCode: member?.teamCode ?? '' }
  const client = Array.isArray(project.clients) ? project.clients[0] : project.clients
  const site = Array.isArray(project.sites) ? project.sites[0] : project.sites

  const [
    { data: scopeTypeRow },
    { data: towerRows },
    { data: floorRows },
    { data: tenderLines },
    { data: shopDrawingLines },
    { data: contractSummary },
    { data: shopDrawingItemRows },
    { count: exportCount },
  ] = await Promise.all([
    project.scope_type
      ? supabase.from('scope_types').select('label_en').eq('code', project.scope_type).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('project_towers').select('id, label, sort_order').eq('project_id', projectId).order('sort_order'),
    supabase
      .from('project_floors')
      .select('id, label, sort_order, tower_id, drawing_code')
      .eq('project_id', projectId)
      .order('sort_order'),
    supabase.from('tender_boq_lines').select('id, system_type, created_at').eq('project_id', projectId),
    supabase
      .from('shop_drawing_boq_lines')
      .select('id, system_type, created_at, updated_by')
      .eq('project_id', projectId),
    supabase.from('contract_boq_lines').select('id, created_at').eq('project_id', projectId),
    supabase.from('shop_drawing_items').select('id, floor_id').eq('project_id', projectId),
    supabase
      .from('autocad_export_log')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ])

  // Brief 098 §2 — systems are STORED now (migration 037), no longer
  // derived from whatever system_type strings happened to appear in BOQ
  // lines. The CAD system codes come from the migration 031 lookup, never
  // hardcoded (v7.2 §6.2 item 3).
  const [{ data: systemRows }, { data: cadSystemRows }] = await Promise.all([
    supabase
      .from('project_systems')
      .select('id, name, cad_code, source')
      .eq('project_id', projectId)
      .order('name'),
    supabase.from('cad_systems').select('code, label_en').eq('is_active', true).order('sort_order'),
  ])

  const towers = (towerRows ?? []).map((t2) => ({ id: t2.id, label: t2.label, sortOrder: t2.sort_order }))
  const towerLabelById = new Map(towers.map((tw) => [tw.id, tw.label]))

  // "Used by" (v7.2 §6.2 item 2) — same pristine check deleteFloor's own
  // action already performs; read here only to DISPLAY the fact, not to
  // decide anything (the action re-checks for real before it acts).
  const floorIds = (floorRows ?? []).map((f) => f.id)
  const { data: subStageRows } = floorIds.length
    ? await supabase.from('floor_sub_stages').select('floor_id, status').in('floor_id', floorIds)
    : { data: [] }
  const progressByFloor = new Map<string, boolean>()
  for (const s of subStageRows ?? []) {
    if (s.status !== 'not_started') progressByFloor.set(s.floor_id, true)
  }

  const floors: FloorTableRowData[] = (floorRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    drawingCode: f.drawing_code,
    sortOrder: f.sort_order,
    towerId: f.tower_id,
    towerLabel: f.tower_id ? (towerLabelById.get(f.tower_id) ?? null) : null,
    hasProgress: progressByFloor.get(f.id) ?? false,
  }))

  const systems: ProjectSystemRow[] = (systemRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    cadCode: s.cad_code,
    source: s.source as 'imported' | 'manual',
  }))
  const cadSystems = (cadSystemRows ?? []).map((c) => ({ code: c.code, labelEn: c.label_en }))

  // BOQ tier summaries.
  const contractCount = contractSummary?.length ?? 0
  const contractLastImport = contractSummary?.length
    ? contractSummary.reduce((max, l) => (l.created_at > max ? l.created_at : max), contractSummary[0].created_at)
    : null
  const tenderCount = tenderLines?.length ?? 0
  const tenderLastImport = tenderLines?.length
    ? tenderLines.reduce((max, l) => (l.created_at > max ? l.created_at : max), tenderLines[0].created_at)
    : null
  const shopDrawingCount = shopDrawingLines?.length ?? 0
  const shopDrawingLastImport = shopDrawingLines?.length
    ? shopDrawingLines.reduce((max, l) => (l.created_at > max ? l.created_at : max), shopDrawingLines[0].created_at)
    : null
  const shopDrawingLastImportedBy = shopDrawingLines?.length
    ? (shopDrawingLines.find((l) => l.created_at === shopDrawingLastImport)?.updated_by ?? null)
    : null

  const drawingCount = shopDrawingItemRows?.length ?? 0
  const floorsWithLayoutsCount = new Set((shopDrawingItemRows ?? []).map((r) => r.floor_id).filter(Boolean)).size

  const picIds = [project.pic_id, shopDrawingLastImportedBy].filter((id): id is string => Boolean(id))
  const profiles = await getUserProfilesByIds(supabase, picIds)
  const picLabel = project.pic_id ? formatMemberName(profiles.get(project.pic_id), t('membersNoProfile')) : null
  const shopDrawingImporterLabel = shopDrawingLastImportedBy
    ? formatMemberName(profiles.get(shopDrawingLastImportedBy), t('membersNoProfile'))
    : null

  // --- Strip states (v7.2 §6.1) ---------------------------------------
  const identityDone = Boolean(
    project.so_number && project.name && client?.name && project.pic_id && project.cad_owner_name && project.cad_consultant_name,
  )
  const structureDone = floors.length > 0
  const systemsDone = systems.length > 0
  const boqTiersFilled = [contractCount > 0, tenderCount > 0, shopDrawingCount > 0].filter(Boolean).length
  const drawingsNeedsFloors = floors.length === 0
  const exportsNeedsDrawings = drawingCount === 0

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
        ]}
        current={t('setupKicker')}
      />
      <div className="wf-admin">
        <div className="wf-admin__header">
          <div className="wf-admin__kicker">{t('setupKicker')}</div>
          <h1 className="wf-admin__title">{project.name}</h1>
        </div>

        {!structureDone && <p className="wf-admin-row__confirm-text">{t('setupSublineNothingConfigured')}</p>}

        {/* §6.1 The setup strip — shape and fill, never colour. */}
        <nav className="wf-setup-strip" aria-label={t('setupKicker')}>
          <StripItem
            href="#identity"
            name={t('setupSection1Name')}
            state={identityDone ? 'done' : 'partly'}
            stateText={
              identityDone
                ? `${t('setupStateDonePrefix')} ${picLabel ?? '—'}`
                : `${t('setupStatePartlyPrefix')} ${!project.cad_owner_name || !project.cad_consultant_name ? t('setupIdentityNotSet') : '—'}`
            }
          />
          <StripItem
            href="#structure"
            name={t('setupSection2Name')}
            state={structureDone ? 'done' : 'not_started'}
            stateText={
              structureDone
                ? `${t('setupStateDonePrefix')} ${towers.length} ${t('setupStructureTowersWord')}, ${floors.length} ${t('setupStructureFloorsWord')}`
                : t('setupStateNotStarted')
            }
          />
          <StripItem
            href="#systems"
            name={t('setupSection3Name')}
            state={systemsDone ? 'done' : 'not_started'}
            stateText={systemsDone ? `${t('setupStateDonePrefix')} ${systems.length}` : t('setupStateNotStarted')}
          />
          <StripItem
            href="#boq"
            name={t('setupSection4Name')}
            state={boqTiersFilled === 3 ? 'done' : boqTiersFilled > 0 ? 'partly' : 'not_started'}
            stateText={
              boqTiersFilled === 3
                ? `${t('setupStateDonePrefix')} ${contractCount + tenderCount + shopDrawingCount}`
                : boqTiersFilled > 0
                  ? `${t('setupStatePartlyPrefix')} ${tenderCount === 0 ? t('setupBoqTierTender') : contractCount === 0 ? t('setupBoqTierContract') : t('setupBoqTierShopDrawing')}`
                  : t('setupStateNotStarted')
            }
          />
          <StripItem
            href="#drawings"
            name={t('setupSection5Name')}
            state={drawingsNeedsFloors ? 'not_started' : drawingCount > 0 ? 'done' : 'not_started'}
            stateText={drawingsNeedsFloors ? t('setupNeedsFloorsFirst') : drawingCount > 0 ? `${t('setupStateDonePrefix')} ${drawingCount}` : t('setupStateNotStarted')}
            dependency={drawingsNeedsFloors}
          />
          <StripItem
            href="#exports"
            name={t('setupSection6Name')}
            state={exportsNeedsDrawings ? 'not_started' : (exportCount ?? 0) > 0 ? 'done' : 'not_started'}
            stateText={
              exportsNeedsDrawings
                ? t('setupNeedsDrawingsFirst')
                : (exportCount ?? 0) > 0
                  ? `${t('setupStateDonePrefix')} ${exportCount}`
                  : t('setupStateNotStarted')
            }
            dependency={exportsNeedsDrawings}
          />
        </nav>
        <div className="wf-setup-strip__legend">
          <span className="wf-setup-strip__legend-mark" />
          {t('setupLegend')}
        </div>

        {/* §1 Identity */}
        <section id="identity" className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('setupSection1Name')}</h2>
          <div className="wf-data-table">
            <IdentityFact label={t('setupIdentitySoNumber')} value={project.so_number ?? t('soRecordNoSoYet')} />
            <IdentityFact label={t('setupIdentityProjectName')} value={project.name} />
            <IdentityFact label={t('setupIdentityMainContractor')} value={client?.name ?? '—'} />
            <IdentityFact label={t('setupIdentitySite')} value={site?.name ?? '—'} />
            <IdentityFact label={t('setupIdentityScopeType')} value={scopeTypeRow?.label_en ?? '—'} />
            <IdentityFact label={t('setupIdentityPic')} value={picLabel ?? t('dashboardUnassigned')} />
          </div>
          {isPic ? (
            <IdentityForm projectId={project.id} ownerName={project.cad_owner_name} consultantName={project.cad_consultant_name} />
          ) : (
            <RefusedNotice t={t} picLabel={picLabel} sectionKey="setupSection1Name" />
          )}
        </section>

        {/* §2 Building structure */}
        <section id="structure" className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('setupSection2Name')}</h2>
          {floors.length === 0 ? (
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('setupStructureEmptyHeadline')}</p>
              <p className="wf-empty-state-card__body">{t('setupStructureEmptyBody')}</p>
              {/* Brief 097 — the primary action here implies write access
                  (§6.3's own two doors), so it is PIC-gated the same as
                  every other control in this section, even on an empty
                  project: a non-PIC gets the §6.4 sentence, never an
                  inviting button for something they cannot do. */}
              {canImportTier('contract', who) && (
                <div className="wf-empty-state-card__actions">
                  <Link href={`/projects/${project.id}/boq-import/contract`} className="btn btn--primary">
                    {t('setupStructureEmptyImport')}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="wf-data-table">
              <div className="wf-data-table__row wf-data-table__row--head" style={{ gridTemplateColumns: '1fr 1fr 1fr 90px 1fr 140px' }}>
                <span className="wf-data-table__head-cell">{t('setupStructureColTower')}</span>
                <span className="wf-data-table__head-cell">{t('setupStructureColFloor')}</span>
                <span className="wf-data-table__head-cell">{t('setupStructureColDrawingCode')}</span>
                <span className="wf-data-table__head-cell">{t('setupStructureColOrder')}</span>
                <span className="wf-data-table__head-cell">{t('setupStructureColUsedBy')}</span>
                <span aria-hidden="true" />
              </div>
              {floors.map((floor) => (
                <FloorTableRow key={floor.id} projectId={project.id} floor={floor} towers={towers} canEdit={isPic} />
              ))}
            </div>
          )}
          {isPic ? (
            <>
              <AddFloorRow projectId={project.id} towers={towers} />
              <AddTowerRow projectId={project.id} />
            </>
          ) : (
            <RefusedNotice t={t} picLabel={picLabel} sectionKey="setupSection2Name" />
          )}
        </section>

        {/* §3 Systems */}
        <section id="systems" className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('setupSection3Name')}</h2>
          {systems.length === 0 && !isPic ? (
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('setupSystemsEmptyHeadline')}</p>
              <p className="wf-empty-state-card__body">{t('setupSystemsEmptyBody')}</p>
            </div>
          ) : (
            <>
              {systems.length === 0 && (
                <div className="wf-empty-state-card">
                  <p className="wf-empty-state-card__headline">{t('setupSystemsEmptyHeadline')}</p>
                  <p className="wf-empty-state-card__body">{t('setupSystemsEmptyBody')}</p>
                </div>
              )}
              <SystemsSection
                projectId={project.id}
                systems={systems}
                cadSystems={cadSystems}
                canEdit={isPic}
              />
            </>
          )}
          {!isPic && <RefusedNotice t={t} picLabel={picLabel} sectionKey="setupSection3Name" />}
        </section>

        {/* §4 BOQ — summary only (Brief 098 builds the real import preview) */}
        <section id="boq" className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('setupSection4Name')}</h2>
          <p className="wf-setup-desk-work-note">{t('setupDeskWorkNote')}</p>
          {contractCount === 0 && tenderCount === 0 && shopDrawingCount === 0 ? (
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('setupBoqEmptyHeadline')}</p>
              <p className="wf-empty-state-card__body">{t('setupBoqEmptyBody')}</p>
              {canImportTier('contract', who) && (
                <div className="wf-empty-state-card__actions">
                  <Link href={`/projects/${project.id}/boq-import/contract`} className="btn btn--primary">
                    {t('setupBoqEmptyImport')}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <div className="wf-data-table">
              <BoqTierRow
                name={t('setupBoqTierContract')}
                count={contractCount}
                lastImport={contractLastImport}
                importedBy={null}
                href={`/projects/${project.id}/contract-boq`}
                importHref={canImportTier('contract', who) ? `/projects/${project.id}/boq-import/contract` : null}
                t={t}
              />
              <BoqTierRow
                name={t('setupBoqTierTender')}
                count={tenderCount}
                lastImport={tenderLastImport}
                importedBy={null}
                href={`/projects/${project.id}/tender-boq`}
                importHref={canImportTier('tender', who) ? `/projects/${project.id}/boq-import/tender` : null}
                t={t}
              />
              <BoqTierRow
                name={t('setupBoqTierShopDrawing')}
                count={shopDrawingCount}
                lastImport={shopDrawingLastImport}
                importedBy={shopDrawingImporterLabel}
                href={`/projects/${project.id}/shop-drawing-boq`}
                importHref={canImportTier('shop_drawing', who) ? `/projects/${project.id}/boq-import/shop-drawing` : null}
                t={t}
              />
            </div>
          )}
        </section>

        {/* §5 Drawings — summary + numbering switch */}
        <section id="drawings" className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('setupSection5Name')}</h2>
          {drawingCount === 0 ? (
            <div className="wf-empty-state-card">
              <p className="wf-empty-state-card__headline">{t('setupDrawingsEmptyHeadline')}</p>
              <p className="wf-empty-state-card__body">
                {floors.length} {t('setupDrawingsReadyPrefix')} {systems.length} {t('setupDrawingsReadySuffix')}
              </p>
              <div className="wf-empty-state-card__actions">
                <Link href={`/projects/${project.id}/shop-drawing-boq`} className="btn btn--primary">
                  {t('setupDrawingsOpenShopDrawings')}
                </Link>
              </div>
            </div>
          ) : (
            <p>
              {drawingCount} {t('setupDrawingsCount')} · {floorsWithLayoutsCount} {t('setupDrawingsFloorsWithLayouts')}
            </p>
          )}
          <p>
            {t('setupDrawingsNumberingLabel')}{' '}
            {project.drawing_numbering_mode === 'client' ? t('setupDrawingsNumberingClient') : t('setupDrawingsNumberingAdtech')}
          </p>
          {isPic ? (
            <NumberingModeSwitch projectId={project.id} mode={project.drawing_numbering_mode as 'adtech' | 'client' | null} />
          ) : (
            <RefusedNotice t={t} picLabel={picLabel} sectionKey="setupSection5Name" />
          )}
        </section>

        {/* §6 Exports — summary only (Brief 099 builds the real panel) */}
        <section id="exports" className="wf-setup-section">
          <h2 className="wf-setup-section__title">{t('setupSection6Name')}</h2>
          <p className="wf-setup-desk-work-note">{t('setupDeskWorkNote')}</p>
          <div className="wf-empty-state-card">
            <p className="wf-empty-state-card__headline">{t('setupExportsEmptyHeadline')}</p>
            <p className="wf-empty-state-card__body">
              {drawingCount} {t('setupExportsReadyPrefix')}
            </p>
          </div>
        </section>
      </div>
    </>
  )
}

function StripItem({
  href,
  name,
  state,
  stateText,
  dependency,
}: {
  href: string
  name: string
  state: 'not_started' | 'partly' | 'done'
  stateText: string
  dependency?: boolean
}) {
  return (
    <Link href={href} className="wf-setup-strip__item">
      <span
        className={
          state === 'done'
            ? 'wf-setup-strip__mark wf-setup-strip__mark--done'
            : state === 'partly'
              ? 'wf-setup-strip__mark wf-setup-strip__mark--partly'
              : 'wf-setup-strip__mark'
        }
        aria-hidden="true"
      />
      <span className="wf-setup-strip__name">{name}</span>
      <span className={dependency ? 'wf-setup-strip__state wf-setup-strip__state--dependency' : 'wf-setup-strip__state'}>
        {stateText}
      </span>
    </Link>
  )
}

function IdentityFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '200px 1fr' }}>
      <span className="wf-data-table__head-cell">{label}</span>
      <span>{value}</span>
    </div>
  )
}

function BoqTierRow({
  name,
  count,
  lastImport,
  importedBy,
  href,
  importHref,
  t,
}: {
  name: string
  count: number
  lastImport: string | null
  importedBy: string | null
  href: string | null
  importHref: string | null
  t: (key: DictionaryKey) => string
}) {
  return (
    <div className="wf-data-table__row wf-data-table__row--body" style={{ gridTemplateColumns: '1fr 100px 160px 160px 120px 120px' }}>
      <span>{name}</span>
      <span>
        {count} {t('setupBoqLineCount')}
      </span>
      <span>{lastImport ? new Date(lastImport).toLocaleDateString() : '—'}</span>
      <span>{importedBy ?? '—'}</span>
      {href ? (
        <Link href={href} className="wf-data-table__row-actions">
          {t('setupBoqOpenFullList')}
        </Link>
      ) : (
        <span>—</span>
      )}
      {importHref ? (
        <Link href={importHref} className="wf-data-table__row-actions">
          {t('boqImportKicker')}
        </Link>
      ) : (
        <span />
      )}
    </div>
  )
}

function RefusedNotice({
  t,
  picLabel,
  sectionKey,
}: {
  t: (key: DictionaryKey) => string
  picLabel: string | null
  sectionKey: 'setupSection1Name' | 'setupSection2Name' | 'setupSection3Name' | 'setupSection5Name'
}) {
  return (
    <p className="wf-refused-card" role="status">
      {t('setupRefusedPrefix')} {picLabel ?? t('dashboardUnassigned')}
      {t('setupRefusedSuffix')} {t(sectionKey).toLowerCase()} {t('setupRefusedOnThisProject')}
    </p>
  )
}

function LoadFailedPage({ t }: { t: (key: DictionaryKey) => string }) {
  return (
    <div className="wf-admin">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('setupLoadFailedHeadline')}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
