import type { GameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import type { GameSaveRepository } from './GameSaveRepository'

export async function saveCurrentGame(world: GameWorld, repository: GameSaveRepository, savedAt: string): Promise<void> {
  const envelope = serializeGameWorldV4(world, savedAt)
  deserializeGameWorldV4(envelope)
  await repository.save(JSON.stringify(envelope))
}

export async function loadSavedGame(repository: GameSaveRepository): Promise<GameWorld> {
  let parsed: unknown
  try { parsed = JSON.parse(await repository.load()) } catch { throw new Error('Saved game contains malformed JSON') }
  return deserializeGameWorldSaveV4(parsed)
}
