import { describe, it, expect } from 'vitest'
import { computeShopDrawingCounts } from './shopDrawingCounts'

describe('computeShopDrawingCounts — Brief 082 §4 (interim plain-status tally)', () => {
  it('counts each status independently', () => {
    const counts = computeShopDrawingCounts([
      { status: 'not_started' },
      { status: 'not_started' },
      { status: 'in_progress' },
      { status: 'done' },
      { status: 'done' },
      { status: 'done' },
    ])
    expect(counts).toEqual({ not_started: 2, in_progress: 1, done: 3 })
  })

  it('an empty list counts zero everywhere', () => {
    expect(computeShopDrawingCounts([])).toEqual({ not_started: 0, in_progress: 0, done: 0 })
  })

  it('counts sum to the total item count', () => {
    const items = [{ status: 'not_started' as const }, { status: 'in_progress' as const }, { status: 'done' as const }]
    const counts = computeShopDrawingCounts(items)
    const sum = counts.not_started + counts.in_progress + counts.done
    expect(sum).toBe(items.length)
  })
})
