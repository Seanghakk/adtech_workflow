import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { CRUMB_BOARD } from '@/lib/breadcrumbs'
import { daysSinceICT } from '@/lib/format/datetime'
import { derivePackage, summarise, type PackageState } from '@/lib/materialApproval/lifecycle'
import { canRecord, type ApprovalActor } from '@/lib/materialApproval/permissions'
import { MaterialApprovalRegister, type RegisterRow } from './MaterialApprovalRegister'

export const metadata: Metadata = {
  title: 'Material approval — ADTECH Workflow Tracker',
}

/**
 * Brief 105 — the material approval register (v7.4 §23.5, mockups 16a/16b).
 *
 * §23.3: this is NOT an eighth journey item and NOT an Execution subtree
 * item — every subtree item is a cross-project list, and this one would be
 * empty on every project for months. It is reached from the SO record's
 * register tile, from a procurement line, and from the QC material
 * inspection. A cross-project list is open item 25, deliberately not built.
 *
 * Desktop records; the phone reads (§23.10).
 */
export default async function MaterialApprovalPage({
  params,
}: PageProps<'/projects/[projectId]/material-approval'>) {
  const { projectId } = await params
  const supabase = await createClient()
  const t = await getServerTranslator()
  const { member } = await getCurrentMember()

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, so_number, pic_id')
    .eq('id', projectId)
    .maybeSingle()

  if (!project) notFound()

  const [
    { data: packages, error: packagesError },
    { data: systems },
    { count: contractLineCount, error: boqError },
  ] = await Promise.all([
    supabase
      .from('material_approval_packages')
      .select(
        `id, ref, title, system_id, outside_boq_reason, preparing_started_at, source, current_rev,
         material_approval_package_lines ( id, contract_boq_line_id, removed_from_boq_at ),
         material_approval_revisions (
           id, rev, manufacturer, product, model, started_at,
           material_approval_submissions ( id, party, org, sent_on, returned_on, code, comments ),
           material_approval_documents ( id, kind, file, uploaded_at )
         )`,
      )
      .eq('project_id', projectId),
    supabase.from('project_systems').select('id, name, cad_code').eq('project_id', projectId),
    supabase
      .from('contract_boq_lines')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId),
  ])

  // §21.0 / Brief 094 — a read that FAILED must say so rather than render as
  // "nothing here". For the head-only count the failure signal is the count
  // itself coming back null, which PostgREST does with a 204 and no error at
  // all; treating that as zero would quietly report a project with no
  // contract BOQ when in fact we could not look.
  if (packagesError || boqError || contractLineCount === null) {
    return (
      <>
        <Breadcrumbs ancestors={[{ label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href }]}
          current={t('materialApprovalBreadcrumb')} />
        <div className="wf-empty-state-card">
          <div className="wf-empty-state-card__headline">{t('materialApprovalLoadFailed')}</div>
        </div>
      </>
    )
  }

  const now = new Date()
  const rows: RegisterRow[] = (packages ?? []).map((p) => {
    const revisions = (p.material_approval_revisions ?? []).map((r) => ({
      id: r.id,
      rev: r.rev,
      manufacturer: r.manufacturer,
      product: r.product,
      model: r.model,
      startedAt: r.started_at,
    }))
    const submissions = (p.material_approval_revisions ?? []).flatMap((r) =>
      (r.material_approval_submissions ?? []).map((s) => ({
        id: s.id,
        revisionId: r.id,
        rev: r.rev,
        party: s.party as 'client' | 'consultant' | 'main_contractor' | 'other',
        org: s.org,
        sentOn: s.sent_on,
        returnedOn: s.returned_on,
        code: s.code as 'A' | 'B' | 'C' | null,
        comments: s.comments,
      })),
    )

    const state = derivePackage({
      source: p.source as 'tracked' | 'paper',
      preparingStartedAt: p.preparing_started_at,
      revisions,
      submissions,
      now,
    })

    return {
      id: p.id,
      ref: p.ref,
      title: p.title,
      systemName: systems?.find((s) => s.id === p.system_id)?.name ?? null,
      outsideBoqReason: p.outside_boq_reason,
      lineCount: (p.material_approval_package_lines ?? []).length,
      linesNoLongerInBoq: (p.material_approval_package_lines ?? []).filter(
        (l) => l.removed_from_boq_at !== null,
      ).length,
      state,
      revisions,
      submissions,
      documents: (p.material_approval_revisions ?? []).flatMap((r) =>
        (r.material_approval_documents ?? []).map((d) => ({
          id: d.id,
          revisionId: r.id,
          kind: d.kind,
          file: d.file,
          uploadedAt: d.uploaded_at,
        })),
      ),
      /** §23.5's sort key — the age of whoever is holding it. */
      holderAgeDays: holderAge(state, now),
    }
  })

  const summary = summarise(
    rows.map((r) => ({ state: r.state, lineCount: r.lineCount })),
    contractLineCount,
  )

  const actor: ApprovalActor = {
    isPic: project.pic_id === member?.userId,
    isSuperadmin: Boolean(member?.isSuperadmin),
    teamCode: member?.teamCode ?? '',
    displayName: member?.fullName ?? null,
  }

  return (
    <>
      <Breadcrumbs
        ancestors={[{ label: t(CRUMB_BOARD.label), href: CRUMB_BOARD.href }]}
        current={t('materialApprovalBreadcrumb')}
      />
      <MaterialApprovalRegister
        projectId={projectId}
        projectName={project.name}
        soNumber={project.so_number}
        rows={rows}
        summary={summary}
        systems={(systems ?? []).map((s) => ({ id: s.id, name: s.name }))}
        canRecord={canRecord(actor)}
        actorName={actor.displayName}
        picName={null}
        hasContractBoq={contractLineCount > 0}
      />
    </>
  )
}

/**
 * §23.5 — "5px left rule by §1.2 on the side holding it", and the sort key.
 * Measured from when the current holder took it: the send date while a
 * reviewer has it, the current revision's start while we do. A package
 * nobody is holding has no age, and gets 0 so it sorts last among open rows
 * without pretending to be old.
 */
function holderAge(state: PackageState, now: Date): number {
  if (state.possession === 'reviewer' && state.openSubmission?.sentOn) {
    return daysSinceICT(state.openSubmission.sentOn, now)
  }
  if (state.possession === 'adtech' && state.currentRevision?.startedAt) {
    return daysSinceICT(state.currentRevision.startedAt, now)
  }
  return 0
}
