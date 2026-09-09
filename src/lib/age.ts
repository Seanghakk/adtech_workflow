/**
 * Shared age-ladder computation.
 *
 * Design handoff README, "The age ladder": a four-segment bar in day-bands
 * so a list sorts itself visually without reading. This is the ONE shared
 * helper every screen must go through — "Compute these once in one shared
 * helper; every screen depends on them agreeing" (README, Design Tokens).
 * Screen 6a is the first caller; screens 1d/4a/6b will share this same
 * module rather than re-deriving the bands.
 *
 * BAND TABLE (authoritative, from the README):
 *   Days 1–5   -> ink   (#201e1d) "fine"
 *   Days 6–10  -> amber (#b26100) "slipping"
 *   Day 11+    -> red   (#c62430) "gone quiet"
 *   Unreached  -> rule  (#e2dede)
 *
 * SEGMENT-FILL THRESHOLDS — a judgment call, documented here and in
 * Result 002: the README states the band table above as the rule, then
 * gives a few "Example renderings" in prose that are not fully mutually
 * consistent with each other or with the two real fill-counts drawn on
 * the actual 6a mockup (7 days -> 2 filled segments; 31 days -> all 4).
 * These are static, hand-authored mockups ("a specification of the visual
 * result, not an architecture to mirror" — README, About the Design
 * Files), not a live component, so an exact universal formula was never
 * actually run against every day count. The thresholds below were picked
 * to reproduce BOTH real fill-counts drawn in the 6a mockup exactly, and
 * land within the range implied by the README's prose examples for the
 * other two. If a stakeholder review disagrees with the exact day a
 * segment lights up, this is the one function to change — every screen
 * that renders an age ladder will follow.
 */

export type AgeBandColor = 'ink' | 'amber' | 'red'

/** Position 1 and 2 render ink, 3 renders amber, 4 renders red — fixed by
 *  position, never by the overall day count, so a long-stalled item shows
 *  a visible gradient (ink, ink, amber, red) rather than four same-colour
 *  blocks. See the real 6a mockup's 31-day card for exactly this shape. */
const SEGMENT_COLORS: readonly AgeBandColor[] = ['ink', 'ink', 'amber', 'red']

/** Day count at which each of the 4 segments lights up. */
const SEGMENT_THRESHOLDS: readonly number[] = [1, 6, 11, 16]

export interface AgeLadderSegment {
  filled: boolean
  color: AgeBandColor
}

/** Text-label color/weight band — tied to the README's literal "Day 11+"
 *  boundary (the point the table itself calls "gone quiet"), matching the
 *  real mockup: the 7-day label is plain muted grey, the 31-day label is
 *  bold red. No example shows the amber-label state explicitly; 6-10 is
 *  included as the reasonable middle step implied by the color system,
 *  not confirmed pixel-for-pixel against a drawn example. */
export function getAgeLabelBand(days: number): AgeBandColor | 'muted' {
  if (days >= 11) return 'red'
  if (days >= 6) return 'amber'
  return 'muted'
}

/** Days must be a non-negative integer; callers should clamp/round via
 *  daysSinceICT() before calling this. */
export function getAgeLadderSegments(days: number): AgeLadderSegment[] {
  const safeDays = Math.max(0, Math.floor(days))
  return SEGMENT_THRESHOLDS.map((threshold, i) => ({
    filled: safeDays >= threshold,
    color: SEGMENT_COLORS[i],
  }))
}
