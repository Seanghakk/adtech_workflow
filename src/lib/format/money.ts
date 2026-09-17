/**
 * Whole-dollar USD formatting for the two money figures this schema
 * actually carries (workflow.variations.committed_amount) — Brief 018
 * §2.2. No currency conversion, no cents: every source figure in this
 * app is a plain numeric(14,2) with no currency column, so USD with no
 * decimals (matching the Rev 2 mockup's own "$58,200" style) is the only
 * format applied.
 */
export function formatUsd0(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}
