import { describe, expect, it } from 'vitest'
import { createPlaybook, createSavedPlay } from './SavedPlay'

describe('SavedPlay / Playbook', () => {
  it('creates a valid saved play', () => {
    const play = createSavedPlay({ id: 'play-1', name: 'Horns Set', createdAt: '2026-01-01', frames: [{ some: 'opaque data' }] })
    expect(play).toEqual({ id: 'play-1', name: 'Horns Set', createdAt: '2026-01-01', frames: [{ some: 'opaque data' }] })
  })

  it('rejects a play with an empty id or name', () => {
    expect(() => createSavedPlay({ id: '', name: 'X', createdAt: '2026-01-01', frames: [] })).toThrow(RangeError)
    expect(() => createSavedPlay({ id: 'play-1', name: ' ', createdAt: '2026-01-01', frames: [] })).toThrow(RangeError)
  })

  it('creates a valid playbook', () => {
    const playbook = createPlaybook({ id: 'pb-1', name: 'Ataque Base', playIds: ['play-1', 'play-2'] })
    expect(playbook).toEqual({ id: 'pb-1', name: 'Ataque Base', playIds: ['play-1', 'play-2'] })
  })

  it('rejects a playbook with an empty id or name, or a duplicate play reference', () => {
    expect(() => createPlaybook({ id: '', name: 'X', playIds: [] })).toThrow(RangeError)
    expect(() => createPlaybook({ id: 'pb-1', name: ' ', playIds: [] })).toThrow(RangeError)
    expect(() => createPlaybook({ id: 'pb-1', name: 'X', playIds: ['play-1', 'play-1'] })).toThrow(RangeError)
  })
})
