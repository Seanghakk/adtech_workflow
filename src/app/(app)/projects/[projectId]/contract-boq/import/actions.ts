'use server'

/**
 * Brief 048 — Contract BOQ Excel import. Writes only to workflow.
 * contract_boq_lines (the flat total quantity), per the brief's own
 * explicit instruction: "Contract BOQ import writes only the flat total
 * quantity to contract_boq_lines" — contract_boq_line_locations (Brief
 * 046 Amendment A) is deliberately left untouched by this importer, not
 * deleted, not populated. Additive only, per the brief's own explicit
 * scope: a second import adds more lines, never merges or replaces.
 *
 * PIC-gated the same way as every write in this app — requireProjectPic
 * mirrored locally (not imported from ../actions.ts, which does not
 * export it — every actions.ts file in this app keeps its own copy).
 *
 * TEMPLATE SHAPE, per the brief's own exact column order — no Section
 * column (contract_boq_lines.section_label exists in the schema but is
 * not part of this brief's template; imported rows get section_label =
 * null, the same as any manual-entry line that leaves it blank):
 *   1. Description (required)
 *   2. Brand (free text, optional — must allow "Siemens or equivalent")
 *   3. Unit (required)
 *   4. Total Quantity (required, numeric)
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import type { WorkSheet } from 'xlsx'
import type { ContractBoqImportState } from './import-shared'

const REQUIRED_HEADERS = ['Description', 'Brand', 'Unit', 'Total Quantity'] as const

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
    return { error: 'Only this project’s PIC can import Contract BOQ lines here. Nothing was recorded.' }
  }

  return { userId: user.id }
}

export async function importContractBoqLines(
  _prevState: ContractBoqImportState,
  formData: FormData,
): Promise<ContractBoqImportState> {
  const projectId = String(formData.get('projectId') ?? '')
  const file = formData.get('file')

  if (!projectId) {
    return { error: 'Invalid request.', rowErrors: [], importedCount: null }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to import.', rowErrors: [], importedCount: null }
  }

  const supabase = await createClient()
  const gate = await requireProjectPic(supabase, projectId)
  if ('error' in gate) return { error: gate.error, rowErrors: [], importedCount: null }

  const XLSX = await import('xlsx')
  let sheet: WorkSheet
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return { error: 'This file has no sheets.', rowErrors: [], importedCount: null }
    }
    sheet = workbook.Sheets[firstSheetName]
  } catch {
    return { error: 'Could not read this file — is it a valid .xlsx file?', rowErrors: [], importedCount: null }
  }

  // header: 1 — array-of-arrays, not object-keyed — so a column that's
  // entirely blank in every data row still shows up as a real header
  // (sheet_to_json's default object mode only infers keys from columns
  // that actually have data, which would silently hide a missing-but-
  // required column like an all-blank Brand).
  const rows2d = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
  const headerRow = (rows2d[0] ?? []).map((cell) => String(cell).trim())

  const missingHeaders = REQUIRED_HEADERS.filter((h) => !headerRow.includes(h))
  if (missingHeaders.length > 0) {
    return {
      error: `This file is missing required column(s): ${missingHeaders.join(', ')}. Use the downloaded template and don't rename or remove its columns.`,
      rowErrors: [],
      importedCount: null,
    }
  }

  const colIndex = {
    description: headerRow.indexOf('Description'),
    brand: headerRow.indexOf('Brand'),
    unit: headerRow.indexOf('Unit'),
    quantity: headerRow.indexOf('Total Quantity'),
  }

  const dataRows = rows2d.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))

  if (dataRows.length === 0) {
    return { error: 'This file has no rows to import.', rowErrors: [], importedCount: null }
  }

  const rowErrors: string[] = []
  const linesToInsert: { project_id: string; description: string; brand: string | null; unit: string; quantity: number }[] = []

  dataRows.forEach((row, i) => {
    const excelRow = i + 2 // +1 for 0-index, +1 for the header row itself
    const description = String(row[colIndex.description] ?? '').trim()
    const brand = String(row[colIndex.brand] ?? '').trim()
    const unit = String(row[colIndex.unit] ?? '').trim()
    const quantityRaw = row[colIndex.quantity]
    const quantity = Number(String(quantityRaw ?? '').trim())

    if (!description) rowErrors.push(`Row ${excelRow}: Description is required.`)
    if (!unit) rowErrors.push(`Row ${excelRow}: Unit is required.`)
    if (String(quantityRaw ?? '').trim() === '' || !Number.isFinite(quantity) || quantity < 0) {
      rowErrors.push(`Row ${excelRow}: Total Quantity must be a non-negative number.`)
    }

    if (description && unit && Number.isFinite(quantity) && quantity >= 0) {
      linesToInsert.push({
        project_id: projectId,
        description,
        brand: brand || null,
        unit,
        quantity,
      })
    }
  })

  // Reject the whole file on ANY row error — "reject with a clear error
  // rather than partially importing on a mismatch" (the brief's own
  // words). Nothing is written if rowErrors is non-empty.
  if (rowErrors.length > 0) {
    return { error: null, rowErrors, importedCount: null }
  }

  const { error } = await supabase.from('contract_boq_lines').insert(linesToInsert)

  if (error) {
    return { error: 'Could not import these lines. Nothing was saved — try again.', rowErrors: [], importedCount: null }
  }

  revalidatePath(`/projects/${projectId}/contract-boq`)
  return { error: null, rowErrors: [], importedCount: linesToInsert.length }
}
