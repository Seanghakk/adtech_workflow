import { describe, it, expect, vi } from 'vitest'
import { verifyWriteAffectedRow, writeFailureMessage, type VerifiedWriteFailure } from './verified-write'

describe('verifyWriteAffectedRow — Brief 094', () => {
  it('a real PostgrestError is reported as reason "error", existsCheck never runs', async () => {
    const existsCheck = vi.fn().mockResolvedValue(true)
    const result = await verifyWriteAffectedRow(
      { data: null, error: { message: 'unique violation', code: '23505' } },
      existsCheck,
    )
    expect(result).toEqual({ ok: false, reason: 'error', error: { message: 'unique violation', code: '23505' } })
    expect(existsCheck).not.toHaveBeenCalled()
  })

  it('rows came back affected -> ok, existsCheck never runs', async () => {
    const existsCheck = vi.fn().mockResolvedValue(true)
    const result = await verifyWriteAffectedRow({ data: [{ id: '1' }], error: null }, existsCheck)
    expect(result).toEqual({ ok: true })
    expect(existsCheck).not.toHaveBeenCalled()
  })

  it('zero rows, no error, row still exists -> forbidden (RLS silently refused)', async () => {
    const result = await verifyWriteAffectedRow({ data: [], error: null }, async () => true)
    expect(result).toEqual({ ok: false, reason: 'forbidden' })
  })

  it('zero rows, no error, row is gone -> not_found', async () => {
    const result = await verifyWriteAffectedRow({ data: [], error: null }, async () => false)
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('null data (no .select() chained) is treated the same as zero rows', async () => {
    const result = await verifyWriteAffectedRow({ data: null, error: null }, async () => false)
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('writeFailureMessage — Brief 094 §3.3', () => {
  const t = (key: 'writeRefusedNotFound' | 'writeRefusedForbidden') =>
    key === 'writeRefusedNotFound' ? 'NOT FOUND TEXT' : 'FORBIDDEN TEXT'

  it('reason "error" uses the caller-supplied fallback, not a dictionary key', () => {
    const verdict: VerifiedWriteFailure = { ok: false, reason: 'error', error: { message: 'boom' } }
    expect(writeFailureMessage(verdict, t, 'Could not save. Try again.')).toBe('Could not save. Try again.')
  })

  it('reason "not_found" uses the shared dictionary key', () => {
    const verdict: VerifiedWriteFailure = { ok: false, reason: 'not_found' }
    expect(writeFailureMessage(verdict, t, 'fallback')).toBe('NOT FOUND TEXT')
  })

  it('reason "forbidden" uses the shared dictionary key', () => {
    const verdict: VerifiedWriteFailure = { ok: false, reason: 'forbidden' }
    expect(writeFailureMessage(verdict, t, 'fallback')).toBe('FORBIDDEN TEXT')
  })
})
