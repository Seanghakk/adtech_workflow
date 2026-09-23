/**
 * Brief 098 §3.3–§3.5, §3.7 — pure parsing and row validation for a BOQ
 * import file, all three tiers. No I/O: everything needed (the already-read
 * sheet, the tier's shape, the project's current floor columns) is passed
 * in, so this is unit-testable without a database or a session — the same
 * split Brief 055's own parse-sheet.ts used, and the reason that file could
 * be tested at all.
 *
 * Two behaviours here differ deliberately from the importers this replaces:
 *
 *  1. A file whose fixed header row is wrong is refused WHOLE, before any
 *     row is read (v7.2 §7.3) — and the refusal carries what was expected
 *     and what the file actually starts with, because that is the only
 *     thing that tells someone which file they grabbed.
 *
 *  2. Row errors no longer reject the whole file. v7.2 §7.5: "Two real
 *     actions: commit the rows that pass, or cancel the whole file — the
 *     user chooses, and neither path is the hidden safe default." So this
 *     returns the good rows AND the failures together, and the screen
 *     offers both actions.
 */
import type { BoqTierConfig } from './tiers'

export interface ParsedBoqLocation {
  /** The column header as it appears in the file — doubles as
   *  shop_drawing_boq_line_locations.location_label. */
  locationLabel: string
  floorLabel: string
  towerLabel: string | null
  quantity: number
}

export interface ParsedBoqLine {
  /** 1-based row number in the sheet, header being row 1 — quoted back to
   *  the user verbatim in every row error (v7.2 §7.5). */
  rowNumber: number
  itemNumber: string
  sectionLabel: string | null
  systemType: string | null
  description: string
  brand: string | null
  model: string | null
  partNumber: string | null
  unit: string
  quantity: number
  remarks: string | null
  locations: ParsedBoqLocation[]
}

export interface BoqRowError {
  rowNumber: number
  /** A whole plain sentence, already naming the row — v7.2 §7.5's own
   *  'Row 42 — quantity "TBC" is not a number'. */
  message: string
}

/**
 * A floor column header is "<Tower> - <Floor>" for a floor under a tower,
 * or the bare floor label otherwise (floor-columns.ts). Shared by the
 * parser and the proposal builder so that a column the file is PROPOSING
 * is split into tower and floor identically in both — otherwise a quantity
 * for a proposed tower floor is recorded against the whole header string
 * and never resolves to the floor the commit just created.
 */
export function splitFloorColumnHeader(header: string): { floorLabel: string; towerLabel: string | null } {
  const parts = header.split(' - ')
  if (parts.length > 1) {
    return { towerLabel: parts[0].trim(), floorLabel: parts.slice(1).join(' - ').trim() }
  }
  return { towerLabel: null, floorLabel: header.trim() }
}

export type ParseBoqResult =
  | { kind: 'not-template'; expectedHeaders: string[]; foundHeaders: string[] }
  | { kind: 'no-data-rows' }
  | { kind: 'ok'; lines: ParsedBoqLine[]; rowErrors: BoqRowError[]; fileFloorHeaders: string[] }

/**
 * @param rows2d Array-of-arrays from XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }).
 * @param config The tier being imported.
 * @param floorColumnByHeader The project's CURRENT floor columns keyed by
 *   header text (../../app/(app)/projects/[projectId]/shop-drawing-boq/
 *   floor-columns.ts). Built fresh from live rows, never trusted from the
 *   file. A header NOT in this map is not an error any more — under v7.2
 *   §7.6 it is a floor the file is PROPOSING, which the preview offers to
 *   create.
 */
export function parseBoqSheet(
  rows2d: unknown[][],
  config: BoqTierConfig,
  floorColumnByHeader: Map<string, { floorLabel: string; towerLabel: string | null }>,
): ParseBoqResult {
  const headerRow = (rows2d[0] ?? []).map((cell) => String(cell ?? '').trim())

  // §7.3 — the file-level answer, before any row is read.
  const missing = config.fixedHeaders.filter((h) => !headerRow.includes(h))
  if (missing.length > 0) {
    return {
      kind: 'not-template',
      expectedHeaders: [...config.fixedHeaders],
      foundHeaders: headerRow.filter((h) => h !== ''),
    }
  }

  const fixedHeaderSet = new Set<string>(config.fixedHeaders)
  const extraHeaders = headerRow.filter((h) => h !== '' && !fixedHeaderSet.has(h))
  const floorHeaders = config.hasFloorColumns ? extraHeaders : []

  const col = (name: string) => headerRow.indexOf(name)
  const colIndex = {
    itemNumber: col('Item Number'),
    section: col('Section'),
    systemType: col('System Type'),
    description: col('Description'),
    brand: col('Brand'),
    modelPartNumber: col('Model / Part Number'),
    unit: col('Unit'),
    quantity: col('Total Quantity'),
    remarks: col('Remarks'),
  }

  const floorCols = floorHeaders.map((h) => ({
    header: h,
    index: headerRow.indexOf(h),
    known: floorColumnByHeader.get(h) ?? null,
  }))

  const dataRows = rows2d.slice(1).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
  if (dataRows.length === 0) {
    return { kind: 'no-data-rows' }
  }

  const lines: ParsedBoqLine[] = []
  const rowErrors: BoqRowError[] = []
  const seenItemNumbers = new Map<string, number>()

  const cell = (row: unknown[], i: number) => (i < 0 ? '' : String(row[i] ?? '').trim())

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2 // +1 for 0-index, +1 for the header row itself
    const itemNumber = cell(row, colIndex.itemNumber)
    const description = cell(row, colIndex.description)
    const unit = cell(row, colIndex.unit)
    const quantityRaw = cell(row, colIndex.quantity)
    const systemType = cell(row, colIndex.systemType)
    const quantity = Number(quantityRaw)

    const problems: string[] = []

    // §3.5 — "A file row with no item number is a row error, not a silent
    // insert." Without it there is no stable key, so a re-import could not
    // match the row and would duplicate it instead.
    if (!itemNumber) {
      problems.push('no item number. Every line needs one, because it is what a re-import matches on')
    } else {
      const firstSeenAt = seenItemNumbers.get(itemNumber)
      if (firstSeenAt !== undefined) {
        problems.push(`item number "${itemNumber}" is already used on row ${firstSeenAt}. Item numbers must be unique within a file`)
      } else {
        seenItemNumbers.set(itemNumber, rowNumber)
      }
    }

    if (!description) problems.push('no item description. Every line needs one')
    if (!unit) problems.push('no unit')
    if (quantityRaw === '') {
      problems.push('no quantity')
    } else if (!Number.isFinite(quantity) || quantity < 0) {
      problems.push(`quantity "${quantityRaw}" is not a number`)
    }
    if (config.hasSystemType && !systemType) problems.push('no system type')

    const locations: ParsedBoqLocation[] = []
    for (const fc of floorCols) {
      const raw = cell(row, fc.index)
      if (raw === '') continue // blank means "not recorded for this floor", the same convention every other optional cell uses
      const qty = Number(raw)
      if (!Number.isFinite(qty) || qty < 0) {
        problems.push(`"${fc.header}" is "${raw}", which is not a number`)
        continue
      }
      // A known column resolves to the live floor's own label/tower. An
      // unknown one is a floor the file is proposing, so the header is
      // split the same way buildProposedFloors will split it — that is
      // what lets the committed quantity find the floor the same commit
      // is about to create.
      const resolved = fc.known ?? splitFloorColumnHeader(fc.header)
      locations.push({
        locationLabel: fc.header,
        floorLabel: resolved.floorLabel,
        towerLabel: resolved.towerLabel,
        quantity: qty,
      })
    }

    if (problems.length > 0) {
      rowErrors.push({ rowNumber, message: `Row ${rowNumber} — ${problems.join('; ')}` })
      return
    }

    lines.push({
      rowNumber,
      itemNumber,
      sectionLabel: config.hasSectionLabel ? cell(row, colIndex.section) || null : null,
      systemType: config.hasSystemType ? systemType : null,
      description,
      brand: cell(row, colIndex.brand) || null,
      // One input column written into both model and part_number, the same
      // decision Brief 055 confirmed rather than guessed for this template.
      model: config.hasModelPartNumber ? cell(row, colIndex.modelPartNumber) || null : null,
      partNumber: config.hasModelPartNumber ? cell(row, colIndex.modelPartNumber) || null : null,
      unit,
      quantity,
      remarks: config.hasRemarks ? cell(row, colIndex.remarks) || null : null,
      locations,
    })
  })

  return { kind: 'ok', lines, rowErrors, fileFloorHeaders: floorHeaders }
}
