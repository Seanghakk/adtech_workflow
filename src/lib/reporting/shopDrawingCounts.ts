/**
 * Brief 082 §4 — Shop drawing cross-project list's per-project counts,
 * extracted from shop-drawing/page.tsx so the interim plain-status
 * tally is independently testable. See that page's own header for the
 * full rationale (replaces the removed, wrong drawn/approved/
 * with-client mapping until the real approval lifecycle migration).
 */
export interface ShopDrawingItem {
  status: 'not_started' | 'in_progress' | 'done'
}

export interface ShopDrawingCounts {
  not_started: number
  in_progress: number
  done: number
}

export function computeShopDrawingCounts(items: ShopDrawingItem[]): ShopDrawingCounts {
  const counts: ShopDrawingCounts = { not_started: 0, in_progress: 0, done: 0 }
  for (const item of items) {
    counts[item.status]++
  }
  return counts
}
