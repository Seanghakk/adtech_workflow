import { describe, it, expect } from 'vitest'
import { deriveNotifyOutcome } from './notify'

describe('§12.7 — the QC-fail notify line is earned, never assumed', () => {
  it('says nobody is recorded when the sub-stage was marked done before tracking', () => {
    expect(deriveNotifyOutcome({ markedDoneByName: null, telegramDelivered: false })).toEqual({
      kind: 'nobody',
    })
  })

  it('claims "has been told" ONLY when a send actually succeeded', () => {
    expect(deriveNotifyOutcome({ markedDoneByName: 'Sok Dara', telegramDelivered: true })).toEqual({
      kind: 'told',
      name: 'Sok Dara',
    })
  })

  it('makes no Telegram claim when nothing was sent', () => {
    // This is the state every QC fail lands in today: Telegram is inert
    // in this app. The screen must not say a person was told when no
    // message left the building.
    const outcome = deriveNotifyOutcome({ markedDoneByName: 'Sok Dara', telegramDelivered: false })
    expect(outcome.kind).toBe('not_wired')
    expect(outcome).not.toHaveProperty('told')
  })

  it('prefers "no one to notify" over a name when there is genuinely no one', () => {
    // A missing name is not a delivery failure — the two are different
    // sentences, and §12.7 writes only the first of them.
    expect(deriveNotifyOutcome({ markedDoneByName: null, telegramDelivered: true }).kind).toBe(
      'nobody',
    )
  })
})
