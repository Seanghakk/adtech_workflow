/**
 * Brief 082 §3 — Procurement cross-project list's per-project counts,
 * extracted from procurement/page.tsx so the boundary logic (the
 * partly/fully delivered split, and the delivery_total-NULL case) is
 * independently testable. See that page's own header for the full
 * rationale.
 */
export interface ProcurementLine {
  poIssuedAt: string | null
  deliveryReceived: number
  deliveryTotal: number | null
}

export interface ProcurementCounts {
  total: number
  ordered: number
  partlyDelivered: number
  fullyDelivered: number
}

export function computeProcurementCounts(lines: ProcurementLine[]): ProcurementCounts {
  const ordered = lines.filter((l) => l.poIssuedAt !== null)
  // A delivery_total-NULL line is never guessed into partly or fully —
  // it only ever contributes to "ordered" above (if a PO is issued).
  const fullyDelivered = ordered.filter((l) => l.deliveryTotal !== null && l.deliveryReceived >= l.deliveryTotal)
  const partlyDelivered = ordered.filter(
    (l) => l.deliveryTotal !== null && l.deliveryReceived > 0 && l.deliveryReceived < l.deliveryTotal,
  )
  return {
    total: lines.length,
    ordered: ordered.length,
    partlyDelivered: partlyDelivered.length,
    fullyDelivered: fullyDelivered.length,
  }
}
