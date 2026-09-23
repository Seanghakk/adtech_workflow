'use server'

/**
 * Brief 046 / Amendment A §4 — Contract BOQ line entry, PIC-gated. Every
 * write here relies entirely on migration 020's new RLS policies on
 * workflow.contract_boq_lines (edited to OR in the PIC condition alongside
 * migration 019's existing superadmin bypass) and workflow.
 * contract_boq_line_locations (new, PIC-only). requireProjectPic below is
 * this app's usual belt-and-suspenders (see update/floor-actions.ts's own
 * requireProjectPic, mirrored here rather than imported — that file does
 * not export it, and every actions.ts file in this app keeps its own
 * local copy) — RLS is the real enforcement.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getServerTranslator } from '@/lib/i18n/server'
import { existsByColumn, verifyWriteAffectedRow, writeFailureMessage } from '@/lib/supabase/verified-write'
import type { ContractBoqFormState } from './contract-boq-shared'

async function requireProjectPic(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<{ userId: string } | { error: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'You need to be signed in to do this.' }
  }

  const { data: project } = await supabase.from('projects').select('pic_id').eq('id', projectId).maybeSingle()

  if (!project) {
    return { error: 'Project not found.' }
  }
  if (!project.pic_id || project.pic_id !== user.id) {
    return { error: 'Only this project’s PIC can change the Contract BOQ here. Nothing was recorded.' }
  }

  return { userId: user.id }
}

function isForeignKeyViolation(error: { code?: string } | null): boolean {
  return error?.code === '23503'
}

function parseQuantity(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null
  const value = Number(String(raw).trim())
  if (!Number.isFinite(value) || value < 0) return null
  return value
}

// -----------------------------------------------------------------------------
// Contract BOQ lines
// -----------------------------------------------------------------------------

export async function createContractBoqLine(
  _prevState: ContractBoqFormState,
  formData: FormData,
): Promise<ContractBoqFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const sectionLabel = String(formData.get('sectionLabel') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const brand = String(formData.get('brand') ?? '').trim()
  const unit = String(formData.get('unit') ?? '').trim()
  const quantity = parseQuantity(formData.get('quantity'))

  if (!projectId || !description || !unit || quantity === null) {
    return { error: 'A description, unit, and a valid quantity are required.', savedAt: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, savedAt: null }

  const { error } = await supabase.from('contract_boq_lines').insert({
    project_id: projectId,
    section_label: sectionLabel || null,
    description,
    brand: brand || null,
    unit,
    quantity,
  })

  if (error) {
    return { error: 'Could not add this line. Nothing was saved — try again.', savedAt: null }
  }

  revalidatePath(`/projects/${projectId}/contract-boq`)
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function updateContractBoqLine(
  _prevState: ContractBoqFormState,
  formData: FormData,
): Promise<ContractBoqFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const lineId = String(formData.get('lineId') ?? '')
  const sectionLabel = String(formData.get('sectionLabel') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const brand = String(formData.get('brand') ?? '').trim()
  const unit = String(formData.get('unit') ?? '').trim()
  const quantity = parseQuantity(formData.get('quantity'))

  if (!projectId || !lineId || !description || !unit || quantity === null) {
    return { error: 'A description, unit, and a valid quantity are required.', savedAt: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, savedAt: null }

  // Brief 094 — requireProjectPic above only confirmed the caller is PIC
  // of `projectId`; it never confirmed lineId actually belongs to that
  // project. If it doesn't, RLS refuses this UPDATE silently (zero rows,
  // no error) — exactly the bug this brief exists to fix.
  const { data, error } = await supabase
    .from('contract_boq_lines')
    .update({
      section_label: sectionLabel || null,
      description,
      brand: brand || null,
      unit,
      quantity,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lineId)
    .select('id')

  const verdict = await verifyWriteAffectedRow(
    { data, error },
    existsByColumn(supabase, 'contract_boq_lines', 'id', lineId),
  )
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return {
      error: writeFailureMessage(verdict, t, 'Could not save this line. Nothing was changed — try again.'),
      savedAt: null,
    }
  }

  revalidatePath(`/projects/${projectId}/contract-boq`)
  return { error: null, savedAt: crypto.randomUUID() }
}

/** Plain form action (not useActionState) — same shape as floor-actions.ts's
 *  status updates, called via useTransition from a confirm-in-place
 *  control (this app's standing no-modal convention, DeactivateMemberControl).
 *  contract_boq_line_id is ON DELETE RESTRICT on contract_boq_line_locations
 *  (migration 020) — deliberately NOT cascaded here in app code; a line
 *  with location rows still attached refuses to delete and says so, same
 *  as the database's own restriction, rather than silently removing data
 *  the location breakdown UI never asked to delete. Two-arg (prevState,
 *  formData) signature, not floor-actions.ts's one-arg shape — this is
 *  called via useActionState (a confirm-then-submit control, DeactivateMember
 *  Control's own shape), not a bare startTransition call. */
export async function deleteContractBoqLine(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const lineId = String(formData.get('lineId') ?? '')

  if (!projectId || !lineId) {
    return { error: 'Invalid request.' }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error }

  const { data, error } = await supabase.from('contract_boq_lines').delete().eq('id', lineId).select('id')

  if (error && isForeignKeyViolation(error)) {
    return { error: 'Remove this line’s location breakdown first, then delete the line.' }
  }
  const verdict = await verifyWriteAffectedRow(
    { data, error },
    existsByColumn(supabase, 'contract_boq_lines', 'id', lineId),
  )
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return { error: writeFailureMessage(verdict, t, 'Could not delete this line — try again.') }
  }

  revalidatePath(`/projects/${projectId}/contract-boq`)
  return { error: null }
}

// -----------------------------------------------------------------------------
// Contract BOQ line locations — the per-floor/location quantity breakdown
// -----------------------------------------------------------------------------

/** Upsert on (contract_boq_line_id, location_label) — one action handles
 *  both "add a new location" and "change an existing location's quantity",
 *  same reasoning as floor-actions.ts's upsertHandoverItem. */
export async function upsertContractBoqLineLocation(
  _prevState: ContractBoqFormState,
  formData: FormData,
): Promise<ContractBoqFormState> {
  const projectId = String(formData.get('projectId') ?? '')
  const lineId = String(formData.get('lineId') ?? '')
  const locationLabel = String(formData.get('locationLabel') ?? '').trim()
  const quantity = parseQuantity(formData.get('quantity'))

  if (!projectId || !lineId || !locationLabel || quantity === null) {
    return { error: 'A location and a valid quantity are required.', savedAt: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, savedAt: null }

  // Brief 094 — same requireProjectPic gap as updateContractBoqLine above:
  // lineId is never confirmed to belong to projectId before this upsert.
  const { data, error } = await supabase
    .from('contract_boq_line_locations')
    .upsert(
      {
        contract_boq_line_id: lineId,
        location_label: locationLabel,
        quantity,
      },
      { onConflict: 'contract_boq_line_id,location_label' },
    )
    .select('contract_boq_line_id')

  const verdict = await verifyWriteAffectedRow({ data, error }, async () => {
    const { data: line } = await supabase.from('contract_boq_lines').select('id').eq('id', lineId).maybeSingle()
    return Boolean(line)
  })
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return {
      error: writeFailureMessage(verdict, t, 'Could not save this location. Nothing was recorded — try again.'),
      savedAt: null,
    }
  }

  revalidatePath(`/projects/${projectId}/contract-boq`)
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function deleteContractBoqLineLocation(
  _prevState: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const projectId = String(formData.get('projectId') ?? '')
  const lineId = String(formData.get('lineId') ?? '')
  const locationLabel = String(formData.get('locationLabel') ?? '')

  if (!projectId || !lineId || !locationLabel) {
    return { error: 'Invalid request.' }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error }

  const { data, error } = await supabase
    .from('contract_boq_line_locations')
    .delete()
    .eq('contract_boq_line_id', lineId)
    .eq('location_label', locationLabel)
    .select('contract_boq_line_id')

  const verdict = await verifyWriteAffectedRow({ data, error }, async () => {
    const { data: loc } = await supabase
      .from('contract_boq_line_locations')
      .select('contract_boq_line_id')
      .eq('contract_boq_line_id', lineId)
      .eq('location_label', locationLabel)
      .maybeSingle()
    return Boolean(loc)
  })
  if (!verdict.ok) {
    const t = await getServerTranslator()
    return { error: writeFailureMessage(verdict, t, 'Could not remove this location — try again.') }
  }

  revalidatePath(`/projects/${projectId}/contract-boq`)
  return { error: null }
}
