'use server'

/**
 * Brief 017 §3 — Lookup Table Admin's write paths, across three tables:
 * workflow.reason_codes (write policies already existed, migration 001),
 * workflow.scope_types and workflow.stages (write policies added by
 * migration 012). isManagerOrAdmin() here is the same "don't trust the UI
 * alone" belt-and-suspenders every other Server Function in this app
 * already applies (see users/actions.ts's own comment) — RLS's
 * is_manager()-gated policies are the real enforcement.
 *
 * §3.4 — CODE IS IMMUTABLE. Every update* function below takes the row's
 * existing code (or id, for stages) to locate it and never accepts a new
 * value for it — there is no code input on any edit form at all, not just
 * a disabled one, per the brief's own "make that visible in the UI rather
 * than merely refusing."
 *
 * §3.6 — BOTH LABELS REQUIRED BEFORE ACTIVE. Enforced here, app-layer
 * only — no CHECK constraint does this at the database level (not asked
 * for), so this check is the actual enforcement, not a belt-and-suspenders
 * copy of one. isRealLabelKm() treats null, blank, and the reason_codes/
 * scope_types placeholder convention ("[provisional — km TBD: ...]") all
 * as "not really translated yet," matching localizedLabel()'s own rule
 * (src/lib/i18n/localized-label.ts) exactly, on purpose — a row this
 * screen refuses to activate is a row that screen would silently fall
 * back to English for anyway.
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import { isManagerOrAdmin } from '@/lib/auth/roles'
import type { LookupFormState } from './lookup-shared'

// Next.js rule: a 'use server' file may only export async functions —
// LookupFormState (type) and lookupInitialState (a plain object) both
// live in ./lookup-shared instead; re-exporting the type here so every
// existing `from './actions'` type import keeps working.
export type { LookupFormState }

function isRealLabelKm(labelKm: string | null): boolean {
  if (!labelKm) return false
  const trimmed = labelKm.trim()
  return trimmed !== '' && !trimmed.startsWith('[provisional')
}

/** reason_codes.label_km and scope_types.label_km are both NOT NULL
 *  (matching migration 001's reason_codes shape) — a blank Khmer field on
 *  the Add form is stored using the exact seed convention those tables
 *  already carry, not an empty string, so a freshly-created row's
 *  "needs attention" state looks identical to the 8 existing reason_codes
 *  rather than inventing a second "untranslated" representation. */
function placeholderLabelKm(code: string): string {
  return `[provisional — km TBD: ${code}]`
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

// -----------------------------------------------------------------------------
// workflow.reason_codes
// -----------------------------------------------------------------------------

export async function createReasonCode(
  _prevState: LookupFormState,
  formData: FormData,
): Promise<LookupFormState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to add reason codes.', savedAt: null }
  }

  const code = String(formData.get('code') ?? '').trim()
  const labelEn = String(formData.get('labelEn') ?? '').trim()
  const labelKmInput = String(formData.get('labelKm') ?? '').trim()
  const sortOrder = Number(formData.get('sortOrder') ?? 0)

  if (!code || !labelEn) {
    return { error: 'A code and a Label (English) are required.', savedAt: null }
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: 'Sort order must be a number.', savedAt: null }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('reason_codes').insert({
    code,
    label_en: labelEn,
    label_km: labelKmInput || placeholderLabelKm(code),
    sort_order: sortOrder,
    is_active: false,
  })

  if (error) {
    if (isUniqueViolation(error)) {
      return { error: 'This code is already in use.', savedAt: null }
    }
    return { error: 'Could not add this reason code. Nothing was saved — try again.', savedAt: null }
  }

  revalidatePath('/lookups')
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function updateReasonCode(
  _prevState: LookupFormState,
  formData: FormData,
): Promise<LookupFormState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to edit reason codes.', savedAt: null }
  }

  const code = String(formData.get('code') ?? '')
  const labelEn = String(formData.get('labelEn') ?? '').trim()
  const labelKmInput = String(formData.get('labelKm') ?? '').trim()
  const sortOrder = Number(formData.get('sortOrder') ?? 0)
  const isActive = formData.get('isActive') === 'true'

  if (!code || !labelEn) {
    return { error: 'A Label (English) is required.', savedAt: null }
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: 'Sort order must be a number.', savedAt: null }
  }
  const labelKm = labelKmInput || placeholderLabelKm(code)
  if (isActive && !isRealLabelKm(labelKm)) {
    return { error: 'Both a Label (English) and a real Label (Khmer) are required before this row can go active.', savedAt: null }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('reason_codes')
    .update({ label_en: labelEn, label_km: labelKm, sort_order: sortOrder, is_active: isActive })
    .eq('code', code)

  if (error) {
    return { error: 'Could not save this reason code. Nothing was changed — try again.', savedAt: null }
  }

  revalidatePath('/lookups')
  return { error: null, savedAt: crypto.randomUUID() }
}

// -----------------------------------------------------------------------------
// workflow.scope_types
// -----------------------------------------------------------------------------

export async function createScopeType(
  _prevState: LookupFormState,
  formData: FormData,
): Promise<LookupFormState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to add scope types.', savedAt: null }
  }

  const code = String(formData.get('code') ?? '').trim()
  const labelEn = String(formData.get('labelEn') ?? '').trim()
  const labelKmInput = String(formData.get('labelKm') ?? '').trim()
  const sortOrder = Number(formData.get('sortOrder') ?? 0)

  if (!code || !labelEn) {
    return { error: 'A code and a Label (English) are required.', savedAt: null }
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: 'Sort order must be a number.', savedAt: null }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('scope_types').insert({
    code,
    label_en: labelEn,
    label_km: labelKmInput || placeholderLabelKm(code),
    sort_order: sortOrder,
    is_active: false,
  })

  if (error) {
    if (isUniqueViolation(error)) {
      return { error: 'This code is already in use.', savedAt: null }
    }
    return { error: 'Could not add this scope type. Nothing was saved — try again.', savedAt: null }
  }

  revalidatePath('/lookups')
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function updateScopeType(
  _prevState: LookupFormState,
  formData: FormData,
): Promise<LookupFormState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to edit scope types.', savedAt: null }
  }

  const code = String(formData.get('code') ?? '')
  const labelEn = String(formData.get('labelEn') ?? '').trim()
  const labelKmInput = String(formData.get('labelKm') ?? '').trim()
  const sortOrder = Number(formData.get('sortOrder') ?? 0)
  const isActive = formData.get('isActive') === 'true'

  if (!code || !labelEn) {
    return { error: 'A Label (English) is required.', savedAt: null }
  }
  if (!Number.isFinite(sortOrder)) {
    return { error: 'Sort order must be a number.', savedAt: null }
  }
  const labelKm = labelKmInput || placeholderLabelKm(code)
  if (isActive && !isRealLabelKm(labelKm)) {
    return { error: 'Both a Label (English) and a real Label (Khmer) are required before this row can go active.', savedAt: null }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('scope_types')
    .update({ label_en: labelEn, label_km: labelKm, sort_order: sortOrder, is_active: isActive })
    .eq('code', code)

  if (error) {
    return { error: 'Could not save this scope type. Nothing was changed — try again.', savedAt: null }
  }

  revalidatePath('/lookups')
  return { error: null, savedAt: crypto.randomUUID() }
}

// -----------------------------------------------------------------------------
// workflow.stages — §3.7's five-field creation (scope_type, code, label_en,
// sequence, owner_team_id); label_km stays optional (nullable column,
// unlike reason_codes/scope_types) until the activation gate needs it.
// -----------------------------------------------------------------------------

export async function createStage(
  _prevState: LookupFormState,
  formData: FormData,
): Promise<LookupFormState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to add stages.', savedAt: null }
  }

  const scopeType = String(formData.get('scopeType') ?? '').trim()
  const code = String(formData.get('code') ?? '').trim()
  const labelEn = String(formData.get('labelEn') ?? '').trim()
  const labelKmInput = String(formData.get('labelKm') ?? '').trim()
  const sequence = Number(formData.get('sequence') ?? NaN)
  const ownerTeamId = String(formData.get('ownerTeamId') ?? '').trim()
  const isTerminal = formData.get('isTerminal') === 'true'

  if (!scopeType || !code || !labelEn || !ownerTeamId) {
    return { error: 'Scope type, code, Label (English), and owner team are all required.', savedAt: null }
  }
  if (!Number.isFinite(sequence)) {
    return { error: 'Sequence must be a number.', savedAt: null }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('stages').insert({
    scope_type: scopeType,
    code,
    label_en: labelEn,
    label_km: labelKmInput || null,
    sequence,
    owner_team_id: ownerTeamId,
    is_terminal: isTerminal,
    is_active: false,
  })

  if (error) {
    if (isUniqueViolation(error)) {
      return { error: 'This code already exists for this scope type.', savedAt: null }
    }
    return { error: 'Could not add this stage. Nothing was saved — try again.', savedAt: null }
  }

  revalidatePath('/lookups')
  return { error: null, savedAt: crypto.randomUUID() }
}

export async function updateStage(
  _prevState: LookupFormState,
  formData: FormData,
): Promise<LookupFormState> {
  const { member } = await getCurrentMember()
  if (!member || !isManagerOrAdmin(member)) {
    return { error: 'You do not have permission to edit stages.', savedAt: null }
  }

  const id = String(formData.get('id') ?? '')
  const labelEn = String(formData.get('labelEn') ?? '').trim()
  const labelKmInput = String(formData.get('labelKm') ?? '').trim()
  const sequence = Number(formData.get('sequence') ?? NaN)
  const ownerTeamId = String(formData.get('ownerTeamId') ?? '').trim()
  const isTerminal = formData.get('isTerminal') === 'true'
  const isActive = formData.get('isActive') === 'true'

  if (!id || !labelEn || !ownerTeamId) {
    return { error: 'Label (English) and owner team are required.', savedAt: null }
  }
  if (!Number.isFinite(sequence)) {
    return { error: 'Sequence must be a number.', savedAt: null }
  }
  const labelKm = labelKmInput || null
  if (isActive && !isRealLabelKm(labelKm)) {
    return { error: 'Both a Label (English) and a real Label (Khmer) are required before this row can go active.', savedAt: null }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('stages')
    .update({
      label_en: labelEn,
      label_km: labelKm,
      sequence,
      owner_team_id: ownerTeamId,
      is_terminal: isTerminal,
      is_active: isActive,
    })
    .eq('id', id)

  if (error) {
    return { error: 'Could not save this stage. Nothing was changed — try again.', savedAt: null }
  }

  revalidatePath('/lookups')
  return { error: null, savedAt: crypto.randomUUID() }
}
