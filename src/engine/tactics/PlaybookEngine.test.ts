import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { GameWorldValidationError } from '@/domain/world'
import { deleteDesignerPlay, deleteDesignerPlaybook, saveDesignerPlay, saveDesignerPlaybook } from './PlaybookEngine'

describe('PlaybookEngine', () => {
  it('saves a designer play into the canonical GameWorld collection', () => {
    const world = saveDesignerPlay(createNewGame(), { id: 'play-1', name: 'Horns Set', createdAt: '2026-01-01', frames: [] })
    expect(world.savedPlaysById['play-1']).toMatchObject({ name: 'Horns Set' })
  })

  it('updates an existing play in place when saved again with the same id', () => {
    const first = saveDesignerPlay(createNewGame(), { id: 'play-1', name: 'Horns Set', createdAt: '2026-01-01', frames: [] })
    const updated = saveDesignerPlay(first, { id: 'play-1', name: 'Renamed', createdAt: '2026-01-01', frames: [] })
    expect(Object.keys(updated.savedPlaysById)).toHaveLength(1)
    expect(updated.savedPlaysById['play-1']!.name).toBe('Renamed')
  })

  it('deleting a play also removes it from every playbook that referenced it', () => {
    let world = saveDesignerPlay(createNewGame(), { id: 'play-1', name: 'Horns Set', createdAt: '2026-01-01', frames: [] })
    world = saveDesignerPlaybook(world, { id: 'pb-1', name: 'Ataque Base', playIds: ['play-1'] })

    const afterDelete = deleteDesignerPlay(world, 'play-1')
    expect(afterDelete.savedPlaysById['play-1']).toBeUndefined()
    expect(afterDelete.playbooksById['pb-1']!.playIds).toEqual([])
  })

  it('saves and deletes a playbook', () => {
    let world = saveDesignerPlaybook(createNewGame(), { id: 'pb-1', name: 'Ataque Base', playIds: [] })
    expect(world.playbooksById['pb-1']).toMatchObject({ name: 'Ataque Base' })

    world = deleteDesignerPlaybook(world, 'pb-1')
    expect(world.playbooksById['pb-1']).toBeUndefined()
  })

  it('rejects a playbook that references a play that does not exist in this GameWorld', () => {
    const world = createNewGame()
    expect(() => saveDesignerPlaybook(world, { id: 'pb-1', name: 'Ataque Base', playIds: ['missing-play'] })).toThrow(GameWorldValidationError)
  })

  it('round-trips saved plays/playbooks through save/load', async () => {
    const { serializeGameWorldV1, deserializeGameWorldV1 } = await import('@/save/GameWorldSaveV1')
    let world = saveDesignerPlay(createNewGame(), { id: 'play-1', name: 'Horns Set', createdAt: '2026-01-01', frames: [{ nested: 'payload' }] })
    world = saveDesignerPlaybook(world, { id: 'pb-1', name: 'Ataque Base', playIds: ['play-1'] })

    const envelope = serializeGameWorldV1(world, '2026-01-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(envelope)

    expect(loaded.savedPlaysById).toEqual(world.savedPlaysById)
    expect(loaded.playbooksById).toEqual(world.playbooksById)
  })
})
