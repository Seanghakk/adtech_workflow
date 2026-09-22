import { describe, it, expect } from 'vitest'
import { computeProcurementCounts, type ProcurementLine } from './procurementCounts'

function line(overrides: Partial<ProcurementLine>): ProcurementLine {
  return { poIssuedAt: null, deliveryReceived: 0, deliveryTotal: null, ...overrides }
}

describe('computeProcurementCounts — Brief 082 §3', () => {
  it('an ordered line with 0 received is neither partly nor fully delivered', () => {
    const counts = computeProcurementCounts([
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 0, deliveryTotal: 10 }),
    ])
    expect(counts).toEqual({ total: 1, ordered: 1, partlyDelivered: 0, fullyDelivered: 0 })
  })

  it('some received (0 < received < total) counts as partly delivered', () => {
    const counts = computeProcurementCounts([
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 4, deliveryTotal: 10 }),
    ])
    expect(counts).toEqual({ total: 1, ordered: 1, partlyDelivered: 1, fullyDelivered: 0 })
  })

  it('all received (received >= total) counts as fully delivered', () => {
    const counts = computeProcurementCounts([
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 10, deliveryTotal: 10 }),
    ])
    expect(counts).toEqual({ total: 1, ordered: 1, partlyDelivered: 0, fullyDelivered: 1 })
  })

  it('received > total (over-delivery) still counts as fully delivered, not partly', () => {
    const counts = computeProcurementCounts([
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 12, deliveryTotal: 10 }),
    ])
    expect(counts).toEqual({ total: 1, ordered: 1, partlyDelivered: 0, fullyDelivered: 1 })
  })

  it('delivery_total NULL is never guessed into partly or fully delivered, even with received > 0', () => {
    const counts = computeProcurementCounts([
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 5, deliveryTotal: null }),
    ])
    expect(counts).toEqual({ total: 1, ordered: 1, partlyDelivered: 0, fullyDelivered: 0 })
  })

  it('a line with no PO issued counts only in total, not ordered/partly/fully', () => {
    const counts = computeProcurementCounts([line({ poIssuedAt: null, deliveryReceived: 0, deliveryTotal: 10 })])
    expect(counts).toEqual({ total: 1, ordered: 0, partlyDelivered: 0, fullyDelivered: 0 })
  })

  it('a mixed set of lines counts each bucket independently', () => {
    const counts = computeProcurementCounts([
      line({ poIssuedAt: null }), // not ordered
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 0, deliveryTotal: 10 }), // ordered, undelivered
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 3, deliveryTotal: 10 }), // partly
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 10, deliveryTotal: 10 }), // fully
      line({ poIssuedAt: '2026-09-01', deliveryReceived: 2, deliveryTotal: null }), // ordered, total unknown
    ])
    expect(counts).toEqual({ total: 5, ordered: 4, partlyDelivered: 1, fullyDelivered: 1 })
  })
})
