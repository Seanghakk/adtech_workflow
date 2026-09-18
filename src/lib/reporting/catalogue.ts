/**
 * Screen 3a — catalogue item (Brief 026). Pure helper, no fetching — same
 * split as the rest of reporting/.
 *
 * workflow.catalogue_items.lifecycle_step is CHECK-constrained to 1-4
 * (migration 001), the schema's own fixed four-step scale — not an
 * open-ended lookup table, so its labels are a hardcoded map here (same
 * treatment as age.ts's own fixed bands), read verbatim from the mockup
 * markup (div id="3a") per the brief's own instruction not to invent
 * wording.
 */
import type { DictionaryKey } from '@/lib/i18n/dictionary'

export const LIFECYCLE_STEPS = [1, 2, 3, 4] as const
export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number]

const LABELS: Record<LifecycleStep, DictionaryKey> = {
  1: 'catalogueLifecycleStep1',
  2: 'catalogueLifecycleStep2',
  3: 'catalogueLifecycleStep3',
  4: 'catalogueLifecycleStep4',
}

export function isLifecycleStep(value: number): value is LifecycleStep {
  return value === 1 || value === 2 || value === 3 || value === 4
}

/** Falls back to step 1's label for a value outside 1-4 — the database
 *  CHECK constraint makes that impossible for a real row, so this only
 *  guards against the untyped Supabase client's own `number` return type. */
export function lifecycleStepLabel(step: number): DictionaryKey {
  return LABELS[isLifecycleStep(step) ? step : 1]
}
