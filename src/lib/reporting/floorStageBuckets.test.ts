import { describe, it, expect } from 'vitest'
import { bucketFloorsByStage } from './floorStageBuckets'
import type { FloorSubStageRow } from './floorTrackData'

const INSTALLATION_ORDER = ['first_fix', 'second_fix', 'third_fix']

function row(floorId: string, subStage: string, status: 'not_started' | 'in_progress' | 'done', updatedAt: string): FloorSubStageRow {
  return { id: `${floorId}-${subStage}`, floorId, stage: 'installation', subStage, status, updatedAt }
}

describe('bucketFloorsByStage — Brief 080 judgment call', () => {
  it('a floor with every relevant sub-stage not_started buckets as not_started', () => {
    const rows = [
      row('f1', 'first_fix', 'not_started', '2026-09-01'),
      row('f1', 'second_fix', 'not_started', '2026-09-01'),
      row('f1', 'third_fix', 'not_started', '2026-09-01'),
    ]
    const buckets = bucketFloorsByStage(rows, ['f1'], INSTALLATION_ORDER)
    expect(buckets).toEqual([{ floorId: 'f1', bucket: 'not_started', stuckSince: '2026-09-01' }])
  })

  it('a floor stuck on the first incomplete sub-stage buckets there, not on a later done one', () => {
    const rows = [
      row('f1', 'first_fix', 'done', '2026-09-01'),
      row('f1', 'second_fix', 'in_progress', '2026-09-05'),
      row('f1', 'third_fix', 'not_started', '2026-09-01'),
    ]
    const buckets = bucketFloorsByStage(rows, ['f1'], INSTALLATION_ORDER)
    expect(buckets).toEqual([{ floorId: 'f1', bucket: 'second_fix', stuckSince: '2026-09-05' }])
  })

  it('Brief 082 §2 — a floor with every relevant sub-stage done buckets as complete, not dropped', () => {
    const rows = [
      row('f1', 'first_fix', 'done', '2026-09-01'),
      row('f1', 'second_fix', 'done', '2026-09-02'),
      row('f1', 'third_fix', 'done', '2026-09-03'),
    ]
    const buckets = bucketFloorsByStage(rows, ['f1'], INSTALLATION_ORDER)
    expect(buckets).toEqual([{ floorId: 'f1', bucket: 'complete', stuckSince: '2026-09-03' }])
  })

  it('Brief 082 §2 — bucket counts for a project sum to its total floor count (the regression test for the AD9001-26S bug: 5 counted of 6, Tower GF dropped entirely)', () => {
    const rows = [
      // f1: not started
      row('f1', 'first_fix', 'not_started', '2026-09-01'),
      row('f1', 'second_fix', 'not_started', '2026-09-01'),
      row('f1', 'third_fix', 'not_started', '2026-09-01'),
      // f2: stuck at second_fix
      row('f2', 'first_fix', 'done', '2026-09-01'),
      row('f2', 'second_fix', 'in_progress', '2026-09-05'),
      row('f2', 'third_fix', 'not_started', '2026-09-01'),
      // f3, f4, f5: not started
      row('f3', 'first_fix', 'not_started', '2026-09-01'),
      row('f4', 'first_fix', 'not_started', '2026-09-01'),
      row('f5', 'first_fix', 'not_started', '2026-09-01'),
      // f6 (Tower GF): every sub-stage done — must now be counted
      row('f6', 'first_fix', 'done', '2026-08-01'),
      row('f6', 'second_fix', 'done', '2026-08-10'),
      row('f6', 'third_fix', 'done', '2026-08-20'),
    ]
    const floorIds = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6']
    const buckets = bucketFloorsByStage(rows, floorIds, INSTALLATION_ORDER)
    expect(buckets).toHaveLength(floorIds.length)
    const total = buckets.reduce((sum) => sum + 1, 0)
    expect(total).toBe(6)
    expect(buckets.find((b) => b.floorId === 'f6')?.bucket).toBe('complete')
  })

  it('multiple floors are bucketed independently', () => {
    const rows = [
      row('f1', 'first_fix', 'not_started', '2026-09-01'),
      row('f1', 'second_fix', 'not_started', '2026-09-01'),
      row('f1', 'third_fix', 'not_started', '2026-09-01'),
      row('f2', 'first_fix', 'done', '2026-08-01'),
      row('f2', 'second_fix', 'done', '2026-08-10'),
      row('f2', 'third_fix', 'in_progress', '2026-09-10'),
    ]
    const buckets = bucketFloorsByStage(rows, ['f1', 'f2'], INSTALLATION_ORDER)
    expect(buckets.find((b) => b.floorId === 'f1')?.bucket).toBe('not_started')
    expect(buckets.find((b) => b.floorId === 'f2')?.bucket).toBe('third_fix')
  })
})
