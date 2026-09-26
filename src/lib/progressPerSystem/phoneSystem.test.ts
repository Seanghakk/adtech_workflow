import { describe, it, expect } from 'vitest'
import { chooseSystem, orderForPicker, type PhoneSystem } from './phoneSystem'

function sys(id: string, covers: boolean, labels: string[] = []): PhoneSystem {
  return { id, name: id.toUpperCase(), coversThisFloor: covers, coversLabels: labels }
}

describe('chooseSystem — §12.2as precedence', () => {
  it('(1) a one-system project has no step at all', () => {
    expect(chooseSystem({ systems: [sys('cctv', true)], fromUrl: null, remembered: null }))
      .toEqual({ kind: 'only', systemId: 'cctv' })
  })

  it('(2) a remembered system that covers this floor goes straight to its rows', () => {
    const systems = [sys('cctv', true), sys('acc', true)]
    expect(chooseSystem({ systems, fromUrl: null, remembered: 'acc' }))
      .toEqual({ kind: 'remembered', systemId: 'acc' })
  })

  it('(3) otherwise, the picker', () => {
    const systems = [sys('cctv', true), sys('acc', true)]
    expect(chooseSystem({ systems, fromUrl: null, remembered: null })).toEqual({ kind: 'picker' })
  })

  it('the URL beats the session, because a shared link is an instruction', () => {
    const systems = [sys('cctv', true), sys('acc', true)]
    expect(chooseSystem({ systems, fromUrl: 'cctv', remembered: 'acc' }))
      .toEqual({ kind: 'remembered', systemId: 'cctv' })
  })

  it('explains itself when the remembered system is not on this floor', () => {
    const systems = [sys('cctv', true), sys('carp', false, ['B3', 'B2', 'B1'])]
    expect(chooseSystem({ systems, fromUrl: null, remembered: 'carp' })).toEqual({
      kind: 'picker_wrong_floor',
      systemId: 'carp',
      systemName: 'CARP',
      coversLabels: ['B3', 'B2', 'B1'],
    })
  })

  it('falls back to the plain picker when the remembered id no longer exists', () => {
    const systems = [sys('cctv', true)]
    // Two systems on the project so it is not the one-system case.
    const withOther = [...systems, sys('acc', true)]
    expect(chooseSystem({ systems: withOther, fromUrl: null, remembered: 'deleted' }))
      .toEqual({ kind: 'picker' })
  })

  it('reports no coverage when no system reaches this floor', () => {
    const systems = [sys('carp', false, ['B1'])]
    expect(chooseSystem({ systems, fromUrl: null, remembered: null })).toEqual({ kind: 'no_coverage' })
  })

  it('still names the system on a multi-system project where only one covers the floor', () => {
    // Not the "only" case: the project has two, so the band must say which.
    const systems = [sys('cctv', true), sys('carp', false, ['B1'])]
    expect(chooseSystem({ systems, fromUrl: null, remembered: null })).toEqual({ kind: 'picker' })
  })
})

describe('orderForPicker — §12.2a', () => {
  const systems = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('puts systems with work awaiting QC first, for a QC member', () => {
    const waiting = new Map([['c', 2]])
    expect(orderForPicker(systems, waiting, true).map((s) => s.id)).toEqual(['c', 'a', 'b'])
  })

  it('leaves Project setup order alone for everyone else', () => {
    const waiting = new Map([['c', 2]])
    expect(orderForPicker(systems, waiting, false).map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})
