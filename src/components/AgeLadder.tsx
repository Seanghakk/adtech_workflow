import { getAgeLabelBand, getAgeLadderSegments } from '@/lib/age'

/**
 * The four-segment age ladder, shared across every screen that draws age
 * (design handoff README, "The age ladder"; redrawn per Visual Round
 * Restyle §3.3). Segments are 20px×9px with 2px gaps. Unreached segments
 * always render grey (--grey), never empty — bar LENGTH must never be the
 * signal, colour always is. Server Component — purely presentational.
 */
export function AgeLadder({
  days,
  label,
  full = false,
}: {
  days: number
  /** e.g. "7 days since last movement" — screen 6a's specific caption. */
  label: string
  /** Stretch the bar to the full width of its container (§3.3: "Inside
   *  cards the segments stretch to card width so the bar is a full-width
   *  band") — set by callers that render inside a card (screen 6b). */
  full?: boolean
}) {
  const segments = getAgeLadderSegments(days)
  const labelBand = getAgeLabelBand(days)

  return (
    <div className={full ? 'age-ladder age-ladder--full' : 'age-ladder'}>
      <span className="age-ladder__bar" aria-hidden="true">
        {segments.map((segment, i) => (
          <span
            key={i}
            className={
              segment.filled
                ? `age-ladder__segment age-ladder__segment--filled age-ladder__segment--${segment.band}`
                : 'age-ladder__segment'
            }
          />
        ))}
      </span>
      <span className={`age-ladder__label age-ladder__label--${labelBand}`}>{label}</span>
    </div>
  )
}
