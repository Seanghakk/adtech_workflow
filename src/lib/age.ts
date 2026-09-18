/**
 * Shared age-ladder computation.
 *
 * Design handoff README, "The age ladder": a four-segment bar in day-bands
 * so a list sorts itself visually without reading. This is the ONE shared
 * helper every screen must go through — "Compute these once in one shared
 * helper; every screen depends on them agreeing" (README, Design Tokens).
 *
 * Visual Round Restyle (15 Sep 2026), Design Note Rev 3 §2.3, "Two
 * ladders, collapsed into one set of bands": card weight (getCardWeight,
 * below) and this bar used to run different boundaries (roughly 1/7/14
 * vs. 1/6/11/16), so a card could show an amber segment on day 6 while
 * its border stayed hairline until day 7. DECIDED: both now key off the
 * SAME four bands, and both are derived from the single SEGMENT_THRESHOLDS
 * array below so they cannot re-diverge — change the thresholds once,
 * both follow.
 *
 * BAND TABLE (authoritative — Design Note Rev 3 §2.3 / Handoff v1 §4,
 * matching the live, confirmed src/lib/age.ts thresholds [1, 6, 11, 16] —
 * unchanged by this round; only what each band RETURNS changed):
 *   Days 1–5   -> moving   (segment colour #0a4767)
 *   Days 6–10  -> waiting  (segment colour = --warning #b26100)
 *   Days 11–15 -> late     (segment colour = --danger #c62430)
 *   Days 16+   -> stalled  (segment colour #8e1620)
 *   Unreached  -> grey #d7d3d3, never left empty (bar length is never the
 *                 signal — see AgeLadder.tsx)
 */

export type AgeBand = 'moving' | 'waiting' | 'late' | 'stalled'

/** One band per fixed bar position — position i lights up once
 *  SEGMENT_THRESHOLDS[i] is reached, independent of the overall day count,
 *  so a long-stalled item shows a visible gradient across all four
 *  segments rather than four same-colour blocks. */
const BANDS: readonly AgeBand[] = ['moving', 'waiting', 'late', 'stalled']

/** Day count at which each of the 4 segments lights up. */
const SEGMENT_THRESHOLDS: readonly number[] = [1, 6, 11, 16]

/** Hour count at which each of triage's 4 segments lights up (Brief 021
 *  §2.2: "0-2 / 2-4 / 4-8 / 8+", screen 1c's own hours-scale clock, kept
 *  in this SAME shared helper so it cannot drift from the day bands —
 *  the brief's own instruction). Starts at 0, not 1 like SEGMENT_THRESHOLDS
 *  above: triage's clock is continuous from the moment of posting (hour 0
 *  is a real, immediate state), unlike daysSinceICT's calendar-day
 *  boundary, where day 0 is "not yet a full day old." JUDGMENT CALL, cheap
 *  to change here alone if discovery disagrees. */
const HOUR_SEGMENT_THRESHOLDS: readonly number[] = [0, 2, 4, 8]

export interface AgeLadderSegment {
  filled: boolean
  band: AgeBand
}

/** The one place every band lookup in this file reads from — walks a
 *  thresholds array from the most severe end so no two callers using the
 *  same thresholds can ever disagree (Design Note Rev 3 §2.3 / Brief 021
 *  §2.2, both of which require exactly this "one place" property). */
function bandForValue(value: number, thresholds: readonly number[]): AgeBand {
  const safeValue = Math.max(0, Math.floor(value))
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (safeValue >= thresholds[i]) return BANDS[i]
  }
  return BANDS[0]
}

function bandForDays(days: number): AgeBand {
  return bandForValue(days, SEGMENT_THRESHOLDS)
}

function bandForHours(hours: number): AgeBand {
  return bandForValue(Math.floor(hours), HOUR_SEGMENT_THRESHOLDS)
}

/** Text-label colour/weight band for the age-ladder's caption — extended
 *  from 3 states to 4 to match the single collapsed band system above
 *  (JUDGMENT CALL: no doc specifies label-text colour separately from
 *  segment-fill colour; this keeps them in lockstep, same as before). */
export function getAgeLabelBand(days: number): AgeBand {
  return bandForDays(days)
}

/** Days must be a non-negative integer; callers should clamp/round via
 *  daysSinceICT() before calling this. */
export function getAgeLadderSegments(days: number): AgeLadderSegment[] {
  const safeDays = Math.max(0, Math.floor(days))
  return SEGMENT_THRESHOLDS.map((threshold, i) => ({
    filled: safeDays >= threshold,
    band: BANDS[i],
  }))
}

/** Hours version of getAgeLabelBand, for screen 1c only (Brief 021 §2.2) —
 *  every other screen in this app uses the day version above. */
export function getHourLabelBand(hours: number): AgeBand {
  return bandForHours(hours)
}

/** Hours version of getAgeLadderSegments, for screen 1c only (Brief 021
 *  §2.2). Hours need not be an integer; callers pass the raw elapsed value
 *  from hoursSinceICT(). */
export function getHourLadderSegments(hours: number): AgeLadderSegment[] {
  const safeHours = Math.max(0, Math.floor(hours))
  return HOUR_SEGMENT_THRESHOLDS.map((threshold, i) => ({
    filled: safeHours >= threshold,
    band: BANDS[i],
  }))
}

/** CardWeight is now literally the same four states as the age ladder's
 *  own bands (Design Note Rev 3 §2.3) — aliased under its historical name
 *  since exceptions/page.tsx (its only caller) already imports it by
 *  this name and nothing about that call site needs to change. */
export type CardWeight = AgeBand

/** Design Note Rev 3 §2.3 / this brief §3.2: card weight now keys off the
 *  SAME bands as the age ladder above, not its own separate 1/7/14
 *  boundaries. Only ONE caller exists (exceptions/page.tsx, screen 6b) —
 *  confirmed by grepping every .ts/.tsx file in src/ for getCardWeight
 *  and CardWeight before this change; nothing else assumed the old
 *  1/7/14 boundaries. */
export function getCardWeight(days: number): CardWeight {
  return bandForDays(days)
}
