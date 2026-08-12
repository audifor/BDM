import type { GameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import type { GameSaveRepository } from './GameSaveRepository'

export async function saveCurrentGame(world: GameWorld, repository: GameSaveRepository, savedAt: string): Promise<void> {
  const envelope = serializeGameWorldV1(world, savedAt)
  deserializeGameWorldV1(envelope)
  await repository.save(JSON.stringify(envelope))
}

export async function loadSavedGame(repository: GameSaveRepository): Promise<GameWorld> {
  let parsed: unknown
  try { parsed = JSON.parse(await repository.load()) } catch { throw new Error('Saved game contains malformed JSON') }
  return deserializeGameWorldV1(parsed)
}
