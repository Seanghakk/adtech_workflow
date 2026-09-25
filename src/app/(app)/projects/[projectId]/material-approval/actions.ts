'use server'

/**
 * Brief 105 — §23.6's five recordings.
 *
 * Every write goes through Brief 094's verified-write helper: an UPDATE or
 * DELETE that RLS refuses returns zero rows and NO error, so "no error" is
 * not proof anything happened. Each action below therefore asks the database
 * what it actually did rather than assuming.
 *
 * The app-layer gates here are belt-and-braces in this codebase's usual
 * shape — migration 043's policies are the real enforcement, and a refusal
 * from either surfaces as a sentence naming who can (§23.6), never as a
 * disabled control.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { getServerTranslator } from '@/lib/i18n/server'
import { existsByColumn, verifyWriteAffectedRow, writeFailureMessage } from '@/lib/supabase/verified-write'
import { canRecord, type ApprovalActor } from '@/lib/materialApproval/permissions'

export interface ActionResult {
  error?: string
  ok?: boolean
}

/**
 * §23.6 — the same two may do all five. Resolved here once rather than
 * re-derived per action, so the five cannot drift apart.
 */
async function requireRecorder(projectId: string): Promise<{ actor: ApprovalActor; userId: string } | { error: string }> {
  const { member } = await getCurrentMember()
  const t = await getServerTranslator()
  if (!member) return { error: t('writeRefusedForbidden') }

  const supabase = await createClient()
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, pic_id')
    .eq('id', projectId)
    .maybeSingle()

  // A read that fails is not the same as a project with no PIC. Saying
  // "you may not" when we simply could not look is the dishonest branch.
  if (error) return { error: t('writeRefusedForbidden') }
  if (!project) return { error: t('writeRefusedNotFound') }

  const actor: ApprovalActor = {
    isPic: project.pic_id === member.userId,
    isSuperadmin: Boolean(member.isSuperadmin),
    teamCode: member.teamCode,
    displayName: member.fullName,
  }
  if (!canRecord(actor)) return { error: t('materialApprovalRefusedHeadline') }
  return { actor, userId: member.userId }
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/material-approval`)
  revalidatePath(`/projects/${projectId}`)
}

// ---------------------------------------------------------------------------
// 1. Add a package (§23.6). Creates Rev 0, not started.
// ---------------------------------------------------------------------------

export async function addPackage(
  projectId: string,
  input: {
    title: string
    systemId: string | null
    contractLineIds: string[]
    manufacturer: string | null
    product: string | null
    model: string | null
    outsideBoqReason: string | null
  },
): Promise<ActionResult & { ref?: string }> {
  const gate = await requireRecorder(projectId)
  if ('error' in gate) return { error: gate.error }

  const supabase = await createClient()
  const t = await getServerTranslator()

  // §23.4 / §5.1 — the reason is required only when there is no line. The
  // database enforces this too (a deferred constraint trigger); checking here
  // as well means the person gets the sentence rather than a raised exception.
  if (input.contractLineIds.length === 0 && !input.outsideBoqReason?.trim()) {
    return { error: t('materialApprovalNotInBoqToggle') }
  }

  const { data: ref, error: refError } = await supabase.rpc('next_material_approval_ref', {
    p_project_id: projectId,
  })
  if (refError || !ref) return { error: t('drawerCouldNotSave') }

  const { data: created, error: createError } = await supabase
    .from('material_approval_packages')
    .insert({
      project_id: projectId,
      ref,
      title: input.title,
      system_id: input.systemId,
      outside_boq_reason: input.contractLineIds.length === 0 ? input.outsideBoqReason : null,
      source: 'tracked',
      created_by: gate.userId,
    })
    .select('id, ref')

  // An INSERT refused by RLS THROWS rather than returning zero rows, so this
  // one is checked on the error, not on the row count (Brief 094).
  if (createError || !created?.[0]) return { error: t('drawerCouldNotSave') }
  const packageId = created[0].id

  if (input.contractLineIds.length > 0) {
    const { error: linesError } = await supabase
      .from('material_approval_package_lines')
      .insert(input.contractLineIds.map((id) => ({ package_id: packageId, contract_boq_line_id: id })))
    if (linesError) {
      // The unique constraint is the one that bites here: a line already in
      // another package. Say that, rather than "could not save".
      return { error: t('materialApprovalLineAlreadyInPackage') }
    }
  }

  const { error: revError } = await supabase.from('material_approval_revisions').insert({
    package_id: packageId,
    rev: 0,
    manufacturer: input.manufacturer,
    product: input.product,
    model: input.model,
    // Deliberately NULL — §23.6 says "Creates Rev 0, not started". The clock
    // starts at "Start preparing", not here, and the database writes it.
    started_at: null,
  })
  if (revError) return { error: t('drawerCouldNotSave') }

  revalidate(projectId)
  return { ok: true, ref: created[0].ref }
}

// ---------------------------------------------------------------------------
// 2. Start preparing (§23.6). preparing_started_at is written by the DATABASE.
// ---------------------------------------------------------------------------

export async function startPreparing(projectId: string, revisionId: string): Promise<ActionResult> {
  const gate = await requireRecorder(projectId)
  if ('error' in gate) return { error: gate.error }

  const supabase = await createClient()
  const t = await getServerTranslator()

  // This sets the REVISION's own start. Migration 043's trigger is what then
  // writes the package's preparing_started_at, once, and nothing here passes
  // that value — §23.2's rule is that the database owns it.
  const write = await supabase
    .from('material_approval_revisions')
    .update({ started_at: new Date().toISOString() })
    .eq('id', revisionId)
    .is('started_at', null)
    .select('id')

  const verdict = await verifyWriteAffectedRow(
    write,
    existsByColumn(supabase, 'material_approval_revisions', 'id', revisionId),
  )
  if (!verdict.ok) return { error: writeFailureMessage(verdict, t, t('drawerCouldNotSave')) }

  revalidate(projectId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 3. Submit (§23.6). Once sent, written and never edited.
// ---------------------------------------------------------------------------

export async function submitRevision(
  projectId: string,
  input: { revisionId: string; party: string; org: string | null; sentOn: string },
): Promise<ActionResult> {
  const gate = await requireRecorder(projectId)
  if ('error' in gate) return { error: gate.error }

  const supabase = await createClient()
  const t = await getServerTranslator()

  const { error } = await supabase.from('material_approval_submissions').insert({
    revision_id: input.revisionId,
    party: input.party,
    org: input.org,
    sent_on: input.sentOn,
    recorded_by: gate.userId,
  })
  if (error) return { error: t('drawerCouldNotSave') }

  revalidate(projectId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 4. Record a return (§23.6). A/B close it; C opens the next revision.
// ---------------------------------------------------------------------------

export async function recordReturn(
  projectId: string,
  input: {
    submissionId: string
    packageId: string
    returnedOn: string
    code: 'A' | 'B' | 'C'
    comments: string | null
    /** Only read for a C — §23.6: the next revision "may propose another
     *  product", so the form offers it and it travels with the return. */
    nextProduct?: { manufacturer: string | null; product: string | null; model: string | null }
  },
): Promise<ActionResult> {
  const gate = await requireRecorder(projectId)
  if ('error' in gate) return { error: gate.error }

  const supabase = await createClient()
  const t = await getServerTranslator()

  const write = await supabase
    .from('material_approval_submissions')
    .update({ returned_on: input.returnedOn, code: input.code, comments: input.comments })
    .eq('id', input.submissionId)
    .is('returned_on', null)
    .select('id')

  const verdict = await verifyWriteAffectedRow(
    write,
    existsByColumn(supabase, 'material_approval_submissions', 'id', input.submissionId),
  )
  if (!verdict.ok) return { error: writeFailureMessage(verdict, t, t('drawerCouldNotSave')) }

  if (input.code === 'C') {
    // §23.6 — a C opens Rev n+1 AT PREPARING. It starts immediately, because
    // the work came back to us the day it was returned; that is also what
    // §9.4's with-us clock measures from for later revisions.
    const { data: revs } = await supabase
      .from('material_approval_revisions')
      .select('rev')
      .eq('package_id', input.packageId)
      .order('rev', { ascending: false })
      .limit(1)

    const nextRev = (revs?.[0]?.rev ?? 0) + 1
    const { error: nextError } = await supabase.from('material_approval_revisions').insert({
      package_id: input.packageId,
      rev: nextRev,
      manufacturer: input.nextProduct?.manufacturer ?? null,
      product: input.nextProduct?.product ?? null,
      model: input.nextProduct?.model ?? null,
      started_at: input.returnedOn,
    })
    if (nextError) return { error: t('drawerCouldNotSave') }

    await supabase
      .from('material_approval_packages')
      .update({ current_rev: nextRev })
      .eq('id', input.packageId)
  }

  revalidate(projectId)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 5. Record an approval made on paper (§23.6). No clocks, A or B only.
// ---------------------------------------------------------------------------

export async function recordPaperApproval(
  projectId: string,
  input: {
    title: string
    systemId: string | null
    contractLineIds: string[]
    outsideBoqReason: string | null
    manufacturer: string | null
    product: string | null
    model: string | null
    party: string
    org: string | null
    stampDate: string
    code: 'A' | 'B'
    scanPath: string
  },
): Promise<ActionResult & { ref?: string }> {
  const gate = await requireRecorder(projectId)
  if ('error' in gate) return { error: gate.error }

  const supabase = await createClient()
  const t = await getServerTranslator()

  // §23.6 — the scan is REQUIRED for a paper approval. It is the only
  // evidence the approval happened at all, since no clock recorded it.
  if (!input.scanPath) return { error: t('materialApprovalPaperScan') }
  if (input.contractLineIds.length === 0 && !input.outsideBoqReason?.trim()) {
    return { error: t('materialApprovalNotInBoqToggle') }
  }

  const { data: ref, error: refError } = await supabase.rpc('next_material_approval_ref', {
    p_project_id: projectId,
  })
  if (refError || !ref) return { error: t('drawerCouldNotSave') }

  const { data: created, error: createError } = await supabase
    .from('material_approval_packages')
    .insert({
      project_id: projectId,
      ref,
      title: input.title,
      system_id: input.systemId,
      outside_boq_reason: input.contractLineIds.length === 0 ? input.outsideBoqReason : null,
      source: 'paper',
      // Never set, and migration 043 refuses it for a paper package anyway.
      preparing_started_at: null,
      created_by: gate.userId,
    })
    .select('id, ref')
  if (createError || !created?.[0]) return { error: t('drawerCouldNotSave') }
  const packageId = created[0].id

  if (input.contractLineIds.length > 0) {
    const { error: linesError } = await supabase
      .from('material_approval_package_lines')
      .insert(input.contractLineIds.map((id) => ({ package_id: packageId, contract_boq_line_id: id })))
    if (linesError) return { error: t('materialApprovalLineAlreadyInPackage') }
  }

  const { data: rev, error: revError } = await supabase
    .from('material_approval_revisions')
    .insert({
      package_id: packageId,
      rev: 0,
      manufacturer: input.manufacturer,
      product: input.product,
      model: input.model,
      // No start: §5.3. The package is 'paper', so 043's trigger ignores it.
      started_at: null,
    })
    .select('id')
  if (revError || !rev?.[0]) return { error: t('drawerCouldNotSave') }

  const { error: subError } = await supabase.from('material_approval_submissions').insert({
    revision_id: rev[0].id,
    party: input.party,
    org: input.org,
    sent_on: null,
    returned_on: input.stampDate,
    code: input.code,
    recorded_by: gate.userId,
  })
  if (subError) return { error: t('drawerCouldNotSave') }

  const { error: docError } = await supabase.from('material_approval_documents').insert({
    revision_id: rev[0].id,
    kind: 'paper_scan',
    file: input.scanPath,
    uploaded_by: gate.userId,
  })
  if (docError) return { error: t('drawerCouldNotSave') }

  revalidate(projectId)
  return { ok: true, ref: created[0].ref }
}
