import { describe, it, expect } from 'vitest'
import {
  collapseToDailyPoints,
  deriveLineState,
  plotLine,
  buildDonut,
  donutArcs,
  buildConcurrencyBars,
  type ProgressPoint,
  type SubStageInput,
} from './overview'

const pt = (at: string, percent: number): ProgressPoint => ({ at, percent })

describe('the line is actual only (v7.2 §13)', () => {
  it('collapses many readings in one day to that day’s last figure', () => {
    // The history table gets a row per floor rollup, so one day can carry
    // a dozen intermediate readings that never stood on their own.
    const points = collapseToDailyPoints([
      pt('2026-09-22T01:00:00Z', 23),
      pt('2026-09-22T09:00:00Z', 31),
      pt('2026-09-22T18:00:00Z', 46),
      pt('2026-09-23T10:00:00Z', 48),
    ])
    expect(points).toEqual([pt('2026-09-22T18:00:00Z', 46), pt('2026-09-23T10:00:00Z', 48)])
  })

  it('sorts before collapsing, so out-of-order rows still give the day’s last', () => {
    const points = collapseToDailyPoints([
      pt('2026-09-22T18:00:00Z', 46),
      pt('2026-09-22T01:00:00Z', 23),
    ])
    expect(points).toEqual([pt('2026-09-22T18:00:00Z', 46)])
  })
})

describe('§21.6 line states', () => {
  it('no readings at all is "no points", and remembers whether floors exist', () => {
    // The copy differs: with floors it is "nobody has updated one yet";
    // without, it sends you to Project setup first.
    expect(deriveLineState([], true)).toEqual({ kind: 'no-points', hasFloors: true })
    expect(deriveLineState([], false)).toEqual({ kind: 'no-points', hasFloors: false })
  })

  it('one reading draws a terminal mark, not a line', () => {
    const s = deriveLineState([pt('2026-09-22T01:00:00Z', 29)], true)
    expect(s.kind).toBe('one-point')
  })

  it('many readings inside one day are still ONE point — no line yet', () => {
    // The trap: three rollups on the same afternoon are not three updates.
    const s = deriveLineState(
      [pt('2026-09-22T01:00:00Z', 23), pt('2026-09-22T09:00:00Z', 31), pt('2026-09-22T18:00:00Z', 46)],
      true,
    )
    expect(s.kind).toBe('one-point')
  })

  it('two days of readings draw the line', () => {
    const s = deriveLineState([pt('2026-09-21T01:00:00Z', 29), pt('2026-09-22T01:00:00Z', 46)], true)
    expect(s.kind).toBe('line')
    if (s.kind === 'line') expect(s.points).toHaveLength(2)
  })
})

describe('plotting the line', () => {
  const box = { width: 600, height: 240, padLeft: 40, padBottom: 30, padTop: 10, padRight: 10 }

  it('pins the y axis to 0–100 so a small move looks small', () => {
    const flat = plotLine([pt('a', 31), pt('b', 33)], box)
    const [y1, y2] = flat.path.split(' ').map((p) => Number(p.split(',')[1]))
    // 2 percentage points across a 200px plot area is a couple of pixels,
    // not half the chart — which is what scaling to the data would do.
    expect(Math.abs(y1 - y2)).toBeLessThan(6)
  })

  it('puts 0% on the baseline and 100% at the top', () => {
    const p = plotLine([pt('a', 0), pt('b', 100)], box)
    const ys = p.path.split(' ').map((q) => Number(q.split(',')[1]))
    expect(ys[0]).toBeCloseTo(box.height - box.padBottom, 1)
    expect(ys[1]).toBeCloseTo(box.padTop, 1)
  })

  it('clamps a reading outside 0–100 rather than drawing off the chart', () => {
    const p = plotLine([pt('a', -5), pt('b', 140)], box)
    const ys = p.path.split(' ').map((q) => Number(q.split(',')[1]))
    expect(ys[0]).toBeCloseTo(box.height - box.padBottom, 1)
    expect(ys[1]).toBeCloseTo(box.padTop, 1)
  })

  it('gives the terminal dot the last point, and four gridlines', () => {
    const p = plotLine([pt('a', 10), pt('b', 20), pt('c', 60)], box)
    const last = p.path.split(' ').pop()!.split(',').map(Number)
    expect(p.terminal.x).toBeCloseTo(last[0], 1)
    expect(p.terminal.y).toBeCloseTo(last[1], 1)
    expect(p.gridlines).toHaveLength(4)
  })
})

describe('the donut is the split of work that has STARTED (§13, §21.6)', () => {
  const sub = (status: SubStageInput['status'], inspections: SubStageInput['inspections'] = []): SubStageInput => ({
    status,
    inspections,
  })

  it('draws nothing when nothing has started', () => {
    expect(buildDonut([sub('not_started'), sub('not_started')])).toEqual([])
  })

  it('leaves not_started out of the split entirely', () => {
    const d = buildDonut([sub('not_started'), sub('in_progress')])
    expect(d).toHaveLength(1)
    expect(d[0]).toEqual({ key: 'in_progress', count: 1, fraction: 1 })
  })

  it('maps the five display states onto the four segments', () => {
    const d = buildDonut([
      sub('in_progress'),
      sub('done'), // no inspection -> waiting
      sub('done', [{ result: 'pass', date: '2026-09-20' }]), // -> done
      sub('done', [{ result: 'fail', date: '2026-09-21' }]), // -> delayed
    ])
    expect(d.map((s) => [s.key, s.count])).toEqual([
      ['done', 1],
      ['in_progress', 1],
      ['waiting', 1],
      ['delayed', 1],
    ])
  })

  it('takes the LATEST inspection, so a pass after a fail is done again', () => {
    const d = buildDonut([
      sub('done', [
        { result: 'fail', date: '2026-09-20' },
        { result: 'pass', date: '2026-09-22' },
      ]),
    ])
    expect(d).toEqual([{ key: 'done', count: 1, fraction: 1 }])
  })

  it('omits a segment with no members rather than drawing a zero wedge', () => {
    const d = buildDonut([sub('in_progress'), sub('in_progress')])
    expect(d.map((s) => s.key)).toEqual(['in_progress'])
  })

  it('lays the arcs end to end around one circle', () => {
    const segments = buildDonut([sub('in_progress'), sub('done', [{ result: 'pass', date: '2026-09-20' }])])
    const arcs = donutArcs(segments, 57)
    expect(arcs).toHaveLength(2)
    expect(arcs[0].dashOffset).toBe(0)
    // the second starts exactly where the first ended
    const firstLength = Number(arcs[0].dashArray.split(' ')[0])
    expect(arcs[1].dashOffset).toBeCloseTo(-firstLength, 2)
  })
})

describe('the concurrency bars (§13)', () => {
  it('measures every stage against the same floor total, not as a funnel', () => {
    const bars = buildConcurrencyBars(
      [
        { stage: 'installation', reached: 12 },
        { stage: 'tnc', reached: 3 },
      ],
      30,
    )
    expect(bars.map((b) => [b.reached, b.total])).toEqual([
      [12, 30],
      [3, 30],
    ])
    expect(bars[0].fraction).toBeCloseTo(0.4, 5)
  })

  it('does not divide by zero on a project with no floors', () => {
    const bars = buildConcurrencyBars([{ stage: 'installation', reached: 0 }], 0)
    expect(bars[0].fraction).toBe(0)
  })
})
