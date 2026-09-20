/**
 * Brief 055 — pure parsing/validation for a Shop Drawing BOQ import sheet,
 * split out of actions.ts specifically so it can be unit-tested directly
 * (actions.ts is 'use server' and pulls in next/headers via
 * @/lib/supabase/server, neither of which runs outside a Next.js request)
 * without a real database or session. No I/O of any kind here — everything
 * needed (the already-parsed sheet, and the project's current floor/tower
 * columns) is passed in.
 */
import { SHOP_DRAWING_BOQ_FIXED_HEADERS as FIXED_HEADERS } from './import-shared'

export interface ParsedShopDrawingBoqLocation {
  locationLabel: string
  floorId: string
  quantity: number
}

export interface ParsedShopDrawingBoqLine {
  systemType: string
  description: string
  brand: string | null
  modelPartNumber: string | null
  unit: string
  totalQuantity: number
  locations: ParsedShopDrawingBoqLocation[]
}

export type ParseSheetResult =
  | { kind: 'missing-headers'; missing: string[] }
  | { kind: 'unrecognized-headers'; unrecognized: string[] }
  | { kind: 'no-data-rows' }
  | { kind: 'row-errors'; rowErrors: string[] }
  | { kind: 'ok'; lines: ParsedShopDrawingBoqLine[] }

/**
 * @param rows2d Array-of-arrays from XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
 * @param floorColumnByHeader The project's CURRENT floor/tower columns
 *   (../floor-columns.ts), keyed by the exact header text a matching
 *   template column would carry. Not trusted from the file itself — this
 *   is always built fresh from the live project_towers/project_floors
 *   rows, so a stale downloaded template with renamed/removed floors is
 *   caught here as `unrecognized-headers`, not silently imported.
 */
export function parseShopDrawingBoqSheet(
  rows2d: unknown[][],
  floorColumnByHeader: Map<string, string>,
): ParseSheetResult {
  const headerRow = (rows2d[0] ?? []).map((cell) => String(cell).trim())

  const missing = FIXED_HEADERS.filter((h) => !headerRow.includes(h))
  if (missing.length > 0) {
    return { kind: 'missing-headers', missing }
  }

  const fixedHeaderSet = new Set<string>(FIXED_HEADERS)
  const extraHeaders = headerRow.filter((h) => h !== '' && !fixedHeaderSet.has(h))
  const unrecognized = extraHeaders.filter((h) => !floorColumnByHeader.has(h))
  if (unrecognized.length > 0) {
    return { kind: 'unrecognized-headers', unrecognized }
  }

  const colIndex = {
    systemType: headerRow.indexOf('System Type'),
    description: headerRow.indexOf('Description'),
    brand: headerRow.indexOf('Brand'),
    modelPartNumber: headerRow.indexOf('Model / Part Number'),
    unit: headerRow.indexOf('Unit'),
    quantity: headerRow.indexOf('Total Quantity'),
  }

  const fileFloorColumns = extraHeaders
    .filter((h) => floorColumnByHeader.has(h))
    .map((h) => ({ header: h, floorId: floorColumnByHeader.get(h)!, index: headerRow.indexOf(h) }))

  const dataRows = rows2d.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
  if (dataRows.length === 0) {
    return { kind: 'no-data-rows' }
  }

  const rowErrors: string[] = []
  const lines: ParsedShopDrawingBoqLine[] = []

  dataRows.forEach((row, i) => {
    const excelRow = i + 2 // +1 for 0-index, +1 for the header row itself
    const systemType = String(row[colIndex.systemType] ?? '').trim()
    const description = String(row[colIndex.description] ?? '').trim()
    const brand = String(row[colIndex.brand] ?? '').trim()
    const modelPartNumber = String(row[colIndex.modelPartNumber] ?? '').trim()
    const unit = String(row[colIndex.unit] ?? '').trim()
    const quantityRaw = row[colIndex.quantity]
    const quantity = Number(String(quantityRaw ?? '').trim())

    if (!systemType) rowErrors.push(`Row ${excelRow}: System Type is required.`)
    if (!description) rowErrors.push(`Row ${excelRow}: Description is required.`)
    if (!unit) rowErrors.push(`Row ${excelRow}: Unit is required.`)
    if (String(quantityRaw ?? '').trim() === '' || !Number.isFinite(quantity) || quantity < 0) {
      rowErrors.push(`Row ${excelRow}: Total Quantity must be a non-negative number.`)
    }

    const locations: ParsedShopDrawingBoqLocation[] = []
    for (const col of fileFloorColumns) {
      const trimmed = String(row[col.index] ?? '').trim()
      if (trimmed === '') continue // no quantity for this floor on this row — not recorded, same convention as every other optional cell
      const qty = Number(trimmed)
      if (!Number.isFinite(qty) || qty < 0) {
        rowErrors.push(`Row ${excelRow}: "${col.header}" must be a non-negative number, or left blank.`)
        continue
      }
      locations.push({ locationLabel: col.header, floorId: col.floorId, quantity: qty })
    }

    if (systemType && description && unit && Number.isFinite(quantity) && quantity >= 0) {
      lines.push({
        systemType,
        description,
        brand: brand || null,
        modelPartNumber: modelPartNumber || null,
        unit,
        totalQuantity: quantity,
        locations,
      })
    }
  })

  // Reject the whole file on ANY row error — nothing is written if
  // rowErrors is non-empty, same standard as Contract BOQ import.
  if (rowErrors.length > 0) {
    return { kind: 'row-errors', rowErrors }
  }

  return { kind: 'ok', lines }
}
