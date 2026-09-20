'use server'

/**
 * Brief 055 — Shop Drawing BOQ Excel import. Team-gated (Shop Drawing or
 * A&A team, migration 022 §3), NOT PIC-gated — requireTeam mirrored
 * locally from update/floor-actions.ts's own requireTeam (every actions.ts
 * file in this app keeps its own local copy of its gate helper, per that
 * file's own comment). Team membership is global, not per-project
 * (migration 022's own header — no per-project team roster exists or is
 * needed), so this gate needs no projectId.
 *
 * Reuses Contract BOQ import's (Brief 048, PR #35) parsing/validation
 * shape — header:1 array-of-arrays reading, reject-the-whole-file-on-any-
 * row-error, template-must-match-headers — rather than building a second,
 * differently-shaped importer, per the brief's own instruction. Extended
 * for this tier's two real differences: a required System Type column
 * (confirmed with Seanghakk, added ahead of the brief's own literal list —
 * see import-shared.ts's own comment) and the per-project floor/zone
 * columns from ../floor-columns.ts.
 *
 * All actual header/row validation lives in ./parse-sheet.ts, a pure
 * function with no I/O — split out specifically so it can be unit-tested
 * directly (this file cannot: 'use server' plus @/lib/supabase/server's
 * next/headers dependency means it only runs inside a real Next.js
 * request). This file is now just the I/O shell: read the upload, fetch
 * the project's current floor/tower columns, hand both to parseSheet, then
 * write whatever comes back.
 *
 * WRITES TWO TABLES, NOT ATOMICALLY — this codebase's write layer has no
 * multi-table transaction anywhere (every existing action is a single
 * PostgREST call); a Postgres RPC function would be the real fix but is a
 * new mechanism this brief's scope doesn't call for. Inserts go one line
 * at a time (so which locations belong to which line is never in doubt),
 * and any failure rolls back every line already inserted THIS ROUND —
 * location rows deleted before their parent line
 * (shop_drawing_boq_line_locations is ON DELETE RESTRICT to
 * shop_drawing_boq_lines, migration 018 — deleting the parent first would
 * itself fail).
 */
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentMember } from '@/lib/auth/current-member'
import type { WorkSheet } from 'xlsx'
import { buildFloorColumns, type FloorData, type TowerData } from '../floor-columns'
import type { ShopDrawingBoqImportState } from './import-shared'
import { parseShopDrawingBoqSheet } from './parse-sheet'

const WRITE_TEAM_CODES = ['shop_drawing', 'a_and_a']

async function requireTeam(): Promise<{ userId: string } | { error: string }> {
  const { member } = await getCurrentMember()

  if (!member) {
    return { error: 'You need to be signed in to do this.' }
  }
  if (!WRITE_TEAM_CODES.includes(member.teamCode)) {
    return { error: 'Only the Shop Drawing or A&A team can import lines here. Nothing was recorded.' }
  }

  return { userId: member.userId }
}

export async function importShopDrawingBoqLines(
  _prevState: ShopDrawingBoqImportState,
  formData: FormData,
): Promise<ShopDrawingBoqImportState> {
  const projectId = String(formData.get('projectId') ?? '')
  const file = formData.get('file')

  if (!projectId) {
    return { error: 'Invalid request.', rowErrors: [], importedCount: null }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: 'Choose a file to import.', rowErrors: [], importedCount: null }
  }

  const gate = await requireTeam()
  if ('error' in gate) return { error: gate.error, rowErrors: [], importedCount: null }

  const supabase = await createClient()

  const { data: project } = await supabase.from('projects').select('id').eq('id', projectId).maybeSingle()
  if (!project) {
    return { error: 'Project not found.', rowErrors: [], importedCount: null }
  }

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

  // header: 1 — array-of-arrays, not object-keyed, same reasoning as
  // Contract BOQ import: an entirely-blank column (e.g. a floor with no
  // quantity on any row in this file) must still show up as a real
  // header rather than being silently dropped by sheet_to_json's default
  // object-key inference.
  const rows2d = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })

  const [{ data: towerRows }, { data: floorRows }] = await Promise.all([
    supabase.from('project_towers').select('id, label, sort_order').eq('project_id', projectId).order('sort_order'),
    supabase
      .from('project_floors')
      .select('id, label, sort_order, tower_id')
      .eq('project_id', projectId)
      .order('sort_order'),
  ])

  const towers: TowerData[] = (towerRows ?? []).map((tw) => ({ id: tw.id, label: tw.label, sortOrder: tw.sort_order }))
  const floors: FloorData[] = (floorRows ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    sortOrder: f.sort_order,
    towerId: f.tower_id,
  }))
  const floorColumnByHeader = new Map(buildFloorColumns(towers, floors).map((c) => [c.header, c.floorId]))

  const parsed = parseShopDrawingBoqSheet(rows2d, floorColumnByHeader)

  if (parsed.kind === 'missing-headers') {
    return {
      error: `This file is missing required column(s): ${parsed.missing.join(', ')}. Use the downloaded template and don't rename or remove its columns.`,
      rowErrors: [],
      importedCount: null,
    }
  }
  if (parsed.kind === 'unrecognized-headers') {
    return {
      error: `Unrecognized floor/zone column(s): ${parsed.unrecognized.join(', ')}. Re-download the template — floor/tower configuration may have changed since this file was made.`,
      rowErrors: [],
      importedCount: null,
    }
  }
  if (parsed.kind === 'no-data-rows') {
    return { error: 'This file has no rows to import.', rowErrors: [], importedCount: null }
  }
  if (parsed.kind === 'row-errors') {
    return { error: null, rowErrors: parsed.rowErrors, importedCount: null }
  }

  const insertedLineIds: string[] = []
  let writeFailed = false

  for (const line of parsed.lines) {
    const { data: insertedLine, error: lineError } = await supabase
      .from('shop_drawing_boq_lines')
      .insert({
        project_id: projectId,
        system_type: line.systemType,
        description: line.description,
        brand: line.brand,
        model: line.modelPartNumber,
        part_number: line.modelPartNumber,
        unit: line.unit,
        total_quantity: line.totalQuantity,
        updated_by: gate.userId,
      })
      .select('id')
      .single()

    if (lineError || !insertedLine) {
      writeFailed = true
      break
    }
    insertedLineIds.push(insertedLine.id)

    if (line.locations.length > 0) {
      const { error: locationError } = await supabase.from('shop_drawing_boq_line_locations').insert(
        line.locations.map((loc) => ({
          shop_drawing_boq_line_id: insertedLine.id,
          location_label: loc.locationLabel,
          floor_id: loc.floorId,
          quantity: loc.quantity,
        })),
      )
      if (locationError) {
        writeFailed = true
        break
      }
    }
  }

  if (writeFailed) {
    if (insertedLineIds.length > 0) {
      // Children before parent — shop_drawing_boq_line_locations is ON
      // DELETE RESTRICT to shop_drawing_boq_lines (migration 018).
      await supabase.from('shop_drawing_boq_line_locations').delete().in('shop_drawing_boq_line_id', insertedLineIds)
      await supabase.from('shop_drawing_boq_lines').delete().in('id', insertedLineIds)
    }
    return { error: 'Could not import these lines. Nothing was saved — try again.', rowErrors: [], importedCount: null }
  }

  revalidatePath(`/projects/${projectId}/shop-drawing-boq`)
  return { error: null, rowErrors: [], importedCount: insertedLineIds.length }
}
