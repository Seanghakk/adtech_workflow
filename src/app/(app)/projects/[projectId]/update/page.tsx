import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { formatMemberName, getUserProfilesByIds } from '@/lib/auth/user-profiles'
import { formatDateICT, daysSinceICT } from '@/lib/format/datetime'
import { getServerTranslator } from '@/lib/i18n/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import { UpdateProgressForm } from './UpdateProgressForm'
import { FloorTrackedProgress } from './FloorTrackedProgress'
import { type DrawingRow, type FloorRow, type SubStageRow } from './FloorBreakdown'
import { UpdateRegisters, type UpdateFloor } from './UpdateRegisters'
import { orderFloors, computeCellState } from '../floor-matrix'
import { getAgeLabelBand } from '@/lib/age'
import type { DictionaryKey } from '@/lib/i18n/dictionary'
import type { DrawerDrawing } from './ShopDrawingDrawer'
import type { DrawingActor } from '@/lib/shopDrawing/permissions'
import { DRAWING_TYPE_KEYS } from '@/lib/shopDrawing/drawingTypes'
import { computeSubStageQcFields } from './subStageQcFields'
import { resolveLatestInspection } from '@/lib/subStageDisplayState'

/**
 * Fable Brief 002 §2.1 — "the unassigned-project state, required not
 * optional": with pic_id nullable and no manager bypass (migration 006),
 * a save that cannot possibly succeed must be legible BEFORE the click,
 * never discovered as a mysterious failed save. This page now fetches
 * pic_id and the signed-in user's id so the form can tell apart three
 * cases: you are the PIC (normal save flow), someone else is the PIC
 * (named, save disabled), or no PIC is set at all (save disabled, distinct
 * message). See UpdateProgressForm's own comment for how each renders.
 */

export const metadata: Metadata = {
  title: 'Update progress — ADTECH Workflow Tracker',
}

/**
 * Screen 6a — build as drawn (Brief 002 §5.3). Server Component: fetches
 * everything the form needs, then hands it to the client form for the
 * interactive parts (reason selection, disabled-Save gating).
 */
export default async function UpdateProgressPage({
  params,
}: PageProps<'/projects/[projectId]/update'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: project } = await supabase
    .from('projects')
    .select(
      'id, name, stream, so_number, percent_complete, percent_calculated, percent_override_at, last_meaningful_movement_at, opened_at, owner_id, pic_id',
    )
    .eq('id', projectId)
    .maybeSingle()

  if (!project) {
    notFound()
  }

  const { member } = await getCurrentMember()
  const isQcMember = member?.teamCode === 'qc'
  // Migration 022 / Brief 050 §C — sub-stage status write access.
  const isProjectTeamMember = member?.teamCode === 'project_management'
  const isTncTeamMember = member?.teamCode === 'tnc'

  const [{ data: reasonCodes }, { data: lastUpdate }, { count: openItemCount }] = await Promise.all([
    supabase
      .from('reason_codes')
      .select('code, label_en, label_km, sort_order')
      .eq('is_active', true)
      .or(`stream.is.null,stream.eq.${project.stream}`)
      .order('sort_order'),
    supabase
      .from('progress_updates')
      .select('author_id, recorded_at, photo_url')
      .eq('subject_type', 'project')
      .eq('subject_id', project.id)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('project_items')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('status', 'open'),
  ])

  const profileIds = [project.owner_id, project.pic_id, lastUpdate?.author_id]
  const profiles = await getUserProfilesByIds(supabase, profileIds)
  const isCurrentUserPic = Boolean(user && project.pic_id && project.pic_id === user.id)

  // Brief 013 §3 — null here must mean ONLY "no id was ever set" (so the
  // form's own `?? unassigned` fallback stays correct); an id that IS set
  // but has no matching profile row resolves to explicit "no profile"
  // text instead of silently falling through to null/Unassigned too.
  const ownerLabel = project.owner_id
    ? formatMemberName(profiles.get(project.owner_id), t('membersNoProfile'))
    : null
  const picLabel = project.pic_id ? formatMemberName(profiles.get(project.pic_id), t('membersNoProfile')) : null
  const lastAuthorLabel = lastUpdate?.author_id
    ? formatMemberName(profiles.get(lastUpdate.author_id), t('membersNoProfile'))
    : null

  const stallAnchor = project.last_meaningful_movement_at ?? project.opened_at
  const daysSinceMovement = daysSinceICT(stallAnchor)

  // Brief 024 §2.1 — floor tracking is optional per project (Amendment
  // §2.1/§2.4 to Brief 007). Only fetch/render the floor breakdown for a
  // project that actually has floor rows; a project with zero stays on
  // exactly today's code path, untouched.
  const { data: floorRows } = await supabase
    .from('project_floors')
    .select('id, label, sort_order, tower_id')
    .eq('project_id', project.id)
    .order('sort_order')

  const floorIds = (floorRows ?? []).map((f) => f.id)
  const tracksFloors = floorIds.length > 0

  const [{ data: shopDrawingRows }, { data: subStageRows }, { data: inspectionRows }, { data: handoverRows }] =
    await Promise.all([
      supabase
        .from('shop_drawing_items')
        .select(
          'id, floor_id, scope, drawing_type, status, created_at, created_by, pre_submission_stage, drafting_started_at, legacy_done_no_lifecycle_history',
        )
        .eq('project_id', project.id),
      floorIds.length > 0
        ? supabase
            .from('floor_sub_stages')
            .select('id, floor_id, stage, sub_stage, sequence, status, photo_url, updated_at, updated_by')
            .in('floor_id', floorIds)
            .order('sequence')
        : Promise.resolve({ data: [] }),
      // qc_inspections.project_id is always set (migration 008), so every
      // inspection against this project — material, installation, or
      // commissioning — comes back from one query keyed on it directly.
      // inspected_at is added (Brief 081) alongside created_at — the same
      // "inspected_at, falling back to created_at" date every other
      // reader of this table now uses (see src/lib/subStageDisplayState.ts
      // and the matrix's own page.tsx, Brief 078) — not a second date
      // convention invented here.
      supabase
        .from('qc_inspections')
        .select('id, floor_sub_stage_id, status, inspected_at, created_at')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false }),
      supabase.from('project_handover_items').select('deliverable, status').eq('project_id', project.id),
    ])

  // Brief 024 §3.3, revised by Brief 081 — group every inspection row by
  // sub-stage first (material inspections have no floor_sub_stage_id and
  // are excluded here, same as before). computeSubStageQcFields()
  // (subStageQcFields.ts, this brief) answers the two genuinely
  // different questions this screen needs from that grouping: the
  // literal "last inspection of any status" caption, and the v6 §7.1
  // shared "is this currently QC-passed" state — the SAME shared
  // functions the floor matrix calls (page.tsx, Brief 078) for the SAME
  // sub-stage, not a second derivation written here. See that file's own
  // header for the full reasoning.
  const inspectionsBySubStage = new Map<string, { status: string; date: string }[]>()
  for (const row of inspectionRows ?? []) {
    if (!row.floor_sub_stage_id) continue // material inspections have none
    const list = inspectionsBySubStage.get(row.floor_sub_stage_id) ?? []
    list.push({ status: row.status, date: row.inspected_at ?? row.created_at })
    inspectionsBySubStage.set(row.floor_sub_stage_id, list)
  }

  // Brief 100 Part B — the drawer's data (v7.2 §9). Loaded here with the
  // rest of the screen rather than on open, because §9.1's whole reason
  // for a drawer instead of a detail page is that the update screen is
  // worked through in one sitting. A project carries roughly two drawings
  // per floor, so this is a small read.
  const itemIds = (shopDrawingRows ?? []).map((r) => r.id)
  const [{ data: submissionRows }, { data: checkRows }] = itemIds.length
    ? await Promise.all([
        supabase
          .from('shop_drawing_submissions')
          .select(
            'id, item_id, revision, reviewer_party, reviewer_org, submitted_at, submitted_by, returned_at, code, comments, checked_by, checked_at',
          )
          .in('item_id', itemIds),
        supabase
          .from('shop_drawing_checks')
          .select('item_id, revision, checked_by, checked_at')
          .in('item_id', itemIds),
      ])
    : [{ data: [] }, { data: [] }]

  // Brief 102 follow-up — the project's systems, for the add form's
  // system field. Error captured per Brief 094: a failed read must not
  // render as "this project has no systems", which would send someone to
  // Project setup to create ones that already exist.
  const { data: systemRows, error: systemsError } = await supabase
    .from('project_systems')
    .select('id, name, cad_code')
    .eq('project_id', project.id)
    .order('name')

  const drawerPeopleIds = new Set<string>()
  for (const r of submissionRows ?? []) {
    if (r.submitted_by) drawerPeopleIds.add(r.submitted_by)
    if (r.checked_by) drawerPeopleIds.add(r.checked_by)
  }
  for (const c of checkRows ?? []) if (c.checked_by) drawerPeopleIds.add(c.checked_by)
  // Brief 102 — whoever added each drawing, for §21.4's "added <date> by <name>".
  for (const r of shopDrawingRows ?? []) if (r.created_by) drawerPeopleIds.add(r.created_by)
  const floorLabelById = new Map((floorRows ?? []).map((f) => [f.id, f.label]))

  // §9.5's gates. isShopDrawingManager is deliberately narrow — the Shop
  // Drawing team's own manager, which is exactly what
  // workflow.record_shop_drawing_check() checks for itself.
  const drawingActor: DrawingActor = {
    isPic: isCurrentUserPic,
    isSuperadmin: Boolean(member?.isSuperadmin),
    teamCode: member?.teamCode ?? '',
    isShopDrawingManager: member?.role === 'manager' && member?.teamCode === 'shop_drawing',
    // From the session, not the profile map above — that map is built from
    // the project's own people (owner, PIC, last author) and the signed-in
    // member need not be any of them.
    displayName: member?.fullName ?? member?.username ?? null,
  }
  const drawerProfiles = await getUserProfilesByIds(supabase, [...drawerPeopleIds])
  const drawerName = (id: string | null): string | null =>
    id ? formatMemberName(drawerProfiles.get(id), t('membersNoProfile')) : null

  type RawDrawingRow = NonNullable<typeof shopDrawingRows>[number]
  const buildDrawing = (r: RawDrawingRow): DrawerDrawing => ({
    id: r.id,
    typeLabel: t(DRAWING_TYPE_KEYS[r.drawing_type] ?? 'drawingTypeSchematic'),
    floorLabel: r.floor_id ? (floorLabelById.get(r.floor_id) ?? null) : null,
    createdAt: r.created_at,
    // Brief 102 — NULL on every row the floor trigger seeded and on
    // everything created before migration 039. The drawer says so in
    // words rather than printing "by unknown".
    createdByName: drawerName(r.created_by),
    status: r.status as 'not_started' | 'in_progress' | 'done',
    preSubmissionStage: r.pre_submission_stage as 'drafting' | 'internal_check' | null,
    draftingStartedAt: r.drafting_started_at,
    legacyDoneNoHistory: Boolean(r.legacy_done_no_lifecycle_history),
    submissions: (submissionRows ?? [])
      .filter((s) => s.item_id === r.id)
      .map((s) => ({
        id: s.id,
        revision: s.revision,
        reviewerParty: s.reviewer_party,
        reviewerOrg: s.reviewer_org,
        submittedAt: s.submitted_at,
        returnedAt: s.returned_at,
        code: s.code as 'A' | 'B' | 'C' | null,
        comments: s.comments,
        submittedByName: drawerName(s.submitted_by),
        checkedByName: drawerName(s.checked_by),
        checkedAt: s.checked_at,
      })),
    checks: (checkRows ?? [])
      .filter((c) => c.item_id === r.id)
      .map((c) => ({
        revision: c.revision,
        checkedBy: c.checked_by,
        checkedAt: c.checked_at,
        checkedByName: drawerName(c.checked_by),
      })),
  })

  const projectShopDrawing: DrawingRow[] = (shopDrawingRows ?? [])
    .filter((r) => r.scope === 'project')
    .map((r) => ({ id: r.id, drawingType: r.drawing_type, status: r.status, drawer: buildDrawing(r) }))

  // Brief 103 §22.2 — towers, for the jump grid's per-tower grouping and
  // §6.2 building order. Error captured per Brief 094.
  const { data: towerRows, error: towersError } = await supabase
    .from('project_towers')
    .select('id, label, sort_order')
    .eq('project_id', project.id)
    .order('sort_order')

  if (towersError) return <UpdateProgressLoadFailed t={t} />

  const towerLabelById = new Map((towerRows ?? []).map((tw) => [tw.id, tw.label]))

  const floors: FloorRow[] = (floorRows ?? []).map((floor) => {
    const subStages: SubStageRow[] = (subStageRows ?? [])
      .filter((s) => s.floor_id === floor.id)
      .map((s) => {
        const { qcDisplayState, lastInspectionStatus } = computeSubStageQcFields(
          s.status as 'not_started' | 'in_progress' | 'done',
          inspectionsBySubStage.get(s.id) ?? [],
        )
        return {
          id: s.id,
          stage: s.stage as 'installation' | 'tnc',
          subStage: s.sub_stage,
          status: s.status,
          qcDisplayState,
          lastInspectionStatus,
          photoUrl: s.photo_url,
        }
      })

    const shopDrawing: DrawingRow[] = (shopDrawingRows ?? [])
      .filter((r) => r.scope === 'floor' && r.floor_id === floor.id)
      .map((r) => ({ id: r.id, drawingType: r.drawing_type, status: r.status, drawer: buildDrawing(r) }))

    return { id: floor.id, label: floor.label, shopDrawing, subStages }
  })

  // ---- Brief 103 §22: the data the two registers derive from --------
  //
  // Cell state comes from the MATRIX's own computeCellState over the
  // shared display-state function (§11.1), not a second derivation —
  // §22.2 says the bar is that function "over every floor × sub-stage
  // cell", and the matrix and this page disagreeing about a cell is the
  // exact failure that helper exists to prevent.
  const subStageById = new Map((subStageRows ?? []).map((r) => [r.id, r]))

  // §6.2 building order, towers included — the same helper the matrix
  // orders its rows with, so the jump grid and the matrix cannot
  // disagree about what "building order" means.
  const orderedFloors = orderFloors(
    (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order })),
    (floorRows ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      sortOrder: f.sort_order,
      towerId: f.tower_id ?? null,
    })),
  )

  // Ages are computed HERE, in ICT, and passed down as a lookup — the
  // client never re-derives a day count in the browser's own timezone.
  // Brief 105 / v7.4 §23.8 — the approved material approval packages the QC
  // material inspection can be checked against. Only approved ones are
  // offered: a package still with a reviewer is not something an inspector
  // can check delivered material against. An empty list is a real state
  // (§5.5) and the block says so rather than disappearing.
  const { data: maRows } = await supabase
    .from('material_approval_packages')
    .select(
      `id, ref, title, source, system_id,
       material_approval_revisions (
         rev, manufacturer, product, model,
         material_approval_submissions ( returned_on, code, org, party, comments ),
         material_approval_documents ( id )
       )`,
    )
    .eq('project_id', project.id)

  const approvedPackages = (maRows ?? []).flatMap((pkg) => {
    const revs = [...(pkg.material_approval_revisions ?? [])].sort((a, b) => a.rev - b.rev)
    const latest = revs[revs.length - 1]
    const ret = revs
      .flatMap((r) => r.material_approval_submissions ?? [])
      .filter((x) => x.code === 'A' || x.code === 'B')
      .slice(-1)[0]
    if (!ret) return []
    return [{
      id: pkg.id,
      ref: pkg.ref,
      title: pkg.title,
      systemName: (systemRows ?? []).find((sx) => sx.id === pkg.system_id)?.name ?? null,
      manufacturer: latest?.manufacturer ?? null,
      product: latest?.product ?? null,
      model: latest?.model ?? null,
      code: ret.code as 'A' | 'B',
      returnedOn: ret.returned_on,
      org: ret.org,
      party: ret.party,
      comments: ret.comments,
      documentCount: revs.reduce((n, r) => n + (r.material_approval_documents ?? []).length, 0),
      fromPaper: pkg.source === 'paper',
    }]
  })

  const ageOfIso: Record<string, number> = {}
  const noteAge = (iso: string | null) => {
    if (iso && !(iso in ageOfIso)) ageOfIso[iso] = daysSinceICT(iso)
  }

  const updateFloors: UpdateFloor[] = orderedFloors.map((of) => {
    const base = floors.find((f) => f.id === of.id)!
    const cellBySubStageId: UpdateFloor['cellBySubStageId'] = {}
    let doneCount = 0
    let applicableCount = 0

    for (const s of base.subStages) {
      const raw = subStageById.get(s.id)
      // The map stores every inspection status including 'pending';
      // resolveLatestInspection only ever considers pass/fail, which is
      // the shared rule's own contract.
      const latest = resolveLatestInspection(
        (inspectionsBySubStage.get(s.id) ?? [])
          .filter((i) => i.status === 'pass' || i.status === 'fail')
          .map((i) => ({ result: i.status as 'pass' | 'fail', date: i.date })),
      )
      const state = computeCellState({
        row: raw
          ? {
              id: raw.id,
              floorId: raw.floor_id,
              stage: raw.stage,
              subStage: raw.sub_stage,
              status: raw.status,
              updatedAt: raw.updated_at,
            }
          : undefined,
        latestInspection: latest,
        daysSince: (isoDate) => daysSinceICT(isoDate),
        isStale: (days) => getAgeLabelBand(days) === 'stalled',
      })
      // §11.4 — a failed cell's clock runs from the failed inspection,
      // not the last status change, which never moves on a fail.
      const clockDate = state === 'qc_failed' && latest ? latest.date : (raw?.updated_at ?? null)
      noteAge(clockDate)
      cellBySubStageId[s.id] = {
        state,
        clockDate,
        holderName: raw?.updated_by ? drawerName(raw.updated_by) : null,
        updatedAt: raw?.updated_at ?? null,
      }
      if (state !== 'not_applicable') applicableCount += 1
      if (raw?.status === 'done') doneCount += 1
    }

    return {
      ...base,
      towerLabel: base.id && orderedFloors.length ? (towerLabelById.get((floorRows ?? []).find((f) => f.id === of.id)?.tower_id ?? '') ?? null) : null,
      cellBySubStageId,
      doneCount,
      applicableCount,
    }
  })

  const handoverItems = (handoverRows ?? []).map((r) => ({ deliverable: r.deliverable, status: r.status }))

  const updateForm = (
      <UpdateProgressForm
        project={{
          id: project.id,
          name: project.name,
          stream: project.stream,
          soNumber: project.so_number,
          percentComplete: project.percent_complete,
          openItemCount: openItemCount ?? 0,
          ownerLabel,
        }}
        lastReported={
          lastUpdate
            ? {
                dateLabel: formatDateICT(lastUpdate.recorded_at),
                byLabel: lastAuthorLabel,
                photoUrl: lastUpdate.photo_url,
              }
            : null
        }
        pic={{
          assigned: Boolean(project.pic_id),
          isCurrentUser: isCurrentUserPic,
          label: picLabel,
        }}
        daysSinceMovement={daysSinceMovement}
        reasonCodes={(reasonCodes ?? []).map((r) => ({
          code: r.code,
          labelEn: r.label_en,
          labelKm: r.label_km,
        }))}
        strings={{
          lastReported: t('updateLastReported'),
          thisWeek: t('updateThisWeek'),
          movement: t('updateMovement'),
          tapToType: t('updateTapToType'),
          clearsThreshold: t('updateClearsThreshold'),
          drawnUnchanged: t('updateDrawnUnchanged'),
          reasonLabel: t('updateReasonLabel'),
          reasonLabelNoMovement: t('updateReasonLabelNoMovement'),
          required: t('updateRequired'),
          noteLabel: t('updateNoteLabel'),
          noteOptional: t('updateNoteOptional'),
          save: t('updateSave'),
          saveNoChange: t('updateSaveNoChange'),
          cancel: t('updateCancel'),
          blockedTitle: t('updateBlockedTitle'),
          blockedBody: t('updateBlockedBody'),
          saveHint: t('updateSaveHint'),
          by: t('updateBy'),
          unreported: t('updateUnreported'),
          unassigned: t('dashboardUnassigned'),
          picUnassignedTitle: t('updatePicUnassignedTitle'),
          picUnassignedBody: t('updatePicUnassignedBody'),
          picRestrictedTitle: t('updatePicRestrictedTitle'),
          picRestrictedBodyPrefix: t('updatePicRestrictedBodyPrefix'),
          picLabel: t('updatePicLabel'),
          picYou: t('updatePicYou'),
          ownerLabel: t('updateOwnerLabel'),
          photoLabel: t('photoLabel'),
          photoOptional: t('photoOptional'),
          photoAdd: t('photoAdd'),
          photoRetake: t('photoRetake'),
          photoRemove: t('photoRemove'),
          photoUploading: t('photoUploading'),
          photoRetry: t('photoRetry'),
          photoRequiredTitle: t('photoRequiredTitle'),
          photoRequiredBody: t('photoRequiredBody'),
          photoEvidenceAlt: t('photoEvidenceAlt'),
        }}
      />
  )

  return (
    <>
      <Breadcrumbs
        ancestors={[
          { label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href },
          { label: project.so_number ?? t('soRecordNoSoYet'), href: `/projects/${project.id}` },
        ]}
        current={t('navUpdateProgress')}
      />
      <h1 className="update-screen__heading">{t('updateHeading')}</h1>
      <div className="update-screen">
        {/* §22.1 REMOVED: the "Calculated" column as built. The figure
            itself is not gone — it moved into the summary register's
            Complete block (§22.2), where it finally states its own basis.
            FloorTrackedProgress' Override path is kept: it is the only
            way a PIC can enter a percent on a floor-tracked project, and
            §22 does not touch it. */}
        {tracksFloors ? (
          <FloorTrackedProgress
            percentCalculated={project.percent_calculated}
            overrideActive={Boolean(project.percent_override_at)}
          >
            {updateForm}
          </FloorTrackedProgress>
        ) : (
          updateForm
        )}

        {floors.length === 0 ? (
          // §22.9 — no floors set up. The work register carries the 4.5
          // empty state; the summary still renders, with "—" and
          // "Nothing to calculate until floors exist".
          <div className="update-registers">
            <UpdateRegisters
              projectId={project.id}
              soLabel={project.so_number ?? t('soRecordNoSoYet')}
              soIsPending={!project.so_number}
              projectName={project.name}
              picName={picLabel}
              stream={project.stream}
              percentCalculated={project.percent_calculated}
              floors={[]}
              projectShopDrawing={projectShopDrawing}
              isPic={isCurrentUserPic}
              isQcMember={isQcMember}
              isProjectTeamMember={isProjectTeamMember}
              isTncTeamMember={isTncTeamMember}
              drawingActor={drawingActor}
              systems={(systemRows ?? []).map((r) => ({ id: r.id, name: r.name, cadCode: r.cad_code }))}
              systemsReadFailed={Boolean(systemsError)}
              ageOfIso={ageOfIso}
              handoverItems={handoverItems}
              approvedPackages={approvedPackages}
            />
            <div className="wf-empty-state-card update-empty">
              <p className="wf-empty-state-card__headline">
                {t('updateEmptyNoFloorsPrefix')} {project.so_number ?? t('soRecordNoSoYet')}
              </p>
              <p className="wf-empty-state-card__body">{t('updateEmptyNoFloorsBody')}</p>
              <div className="wf-empty-state-card__actions">
                <Link href={`/projects/${project.id}/setup#structure`} className="btn btn--primary">
                  {t('updateEmptyNoFloorsAction')}
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <UpdateRegisters
            projectId={project.id}
            soLabel={project.so_number ?? t('soRecordNoSoYet')}
            soIsPending={!project.so_number}
            projectName={project.name}
            picName={picLabel}
            stream={project.stream}
            percentCalculated={project.percent_calculated}
            floors={updateFloors}
            projectShopDrawing={projectShopDrawing}
            isPic={isCurrentUserPic}
            isQcMember={isQcMember}
            isProjectTeamMember={isProjectTeamMember}
            isTncTeamMember={isTncTeamMember}
            drawingActor={drawingActor}
            systems={(systemRows ?? []).map((r) => ({ id: r.id, name: r.name, cadCode: r.cad_code }))}
            systemsReadFailed={Boolean(systemsError)}
            ageOfIso={ageOfIso}
            handoverItems={handoverItems}
            approvedPackages={approvedPackages}
          />
        )}
      </div>
    </>
  )
}

/**
 * §21.0 — a read that failed is never rendered as an empty page. Brief
 * 103 §4 requires this survive the rebuild, alongside Brief 094's
 * verified writes.
 */
function UpdateProgressLoadFailed({ t }: { t: (key: DictionaryKey) => string }) {
  return (
    <div className="update-screen">
      <div className="wf-load-failed-card" role="alert">
        <p style={{ margin: 0, fontWeight: 700 }}>{t('updateLoadFailedHeadline')}</p>
        <p style={{ margin: 'var(--space-2) 0 0' }}>{t('setupLoadFailedBody')}</p>
      </div>
    </div>
  )
}
