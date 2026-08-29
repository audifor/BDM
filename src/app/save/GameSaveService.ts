import type { GameWorld } from '@/domain/world'
import { deserializeGameWorldSave, deserializeGameWorldV2, serializeGameWorldV2 } from '@/save/GameWorldSaveV2'
import type { GameSaveRepository } from './GameSaveRepository'

export async function saveCurrentGame(world: GameWorld, repository: GameSaveRepository, savedAt: string): Promise<void> {
  const envelope = serializeGameWorldV2(world, savedAt)
  deserializeGameWorldV2(envelope)
  await repository.save(JSON.stringify(envelope))
}

export async function loadSavedGame(repository: GameSaveRepository): Promise<GameWorld> {
  let parsed: unknown
  try { parsed = JSON.parse(await repository.load()) } catch { throw new Error('Saved game contains malformed JSON') }
  return deserializeGameWorldSave(parsed)
}
