import { getAgeLabelBand, getAgeLadderSegments } from '@/lib/age'

/**
 * The four-segment age ladder, shared across every screen that draws age
 * (design handoff README, "The age ladder"). Segments are 15px×8px with
 * 2px gaps, per the design tokens. Server Component — purely presentational.
 */
export function AgeLadder({
  days,
  label,
}: {
  days: number
  /** e.g. "7 days since last movement" — screen 6a's specific caption. */
  label: string
}) {
  const segments = getAgeLadderSegments(days)
  const labelBand = getAgeLabelBand(days)

  return (
    <div className="age-ladder">
      <span className="age-ladder__bar" aria-hidden="true">
        {segments.map((segment, i) => (
          <span
            key={i}
            className={
              segment.filled
                ? `age-ladder__segment age-ladder__segment--${segment.color}`
                : 'age-ladder__segment age-ladder__segment--empty'
            }
          />
        ))}
      </span>
      <span className={`age-ladder__label age-ladder__label--${labelBand}`}>{label}</span>
    </div>
  )
}
