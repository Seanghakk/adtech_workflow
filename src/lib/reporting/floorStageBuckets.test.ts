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

  it('a floor with every relevant sub-stage done falls into no bucket', () => {
    const rows = [
      row('f1', 'first_fix', 'done', '2026-09-01'),
      row('f1', 'second_fix', 'done', '2026-09-01'),
      row('f1', 'third_fix', 'done', '2026-09-01'),
    ]
    expect(bucketFloorsByStage(rows, ['f1'], INSTALLATION_ORDER)).toEqual([])
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
