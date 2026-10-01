import type { GameWorld } from '@/domain/world'
import { deserializeGameWorldSaveV4, deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { repairRosterContractIntegrity } from '@/engine/market/RosterContractIntegrity'
import type { GameSaveRepository } from './GameSaveRepository'

export async function saveCurrentGame(world: GameWorld, repository: GameSaveRepository, savedAt: string): Promise<void> {
  assertNoUnresolvedRosterContractIntegrity(world)
  const envelope = serializeGameWorldV4(world, savedAt)
  deserializeGameWorldV4(envelope)
  await repository.save(JSON.stringify(envelope))
}

export async function loadSavedGame(repository: GameSaveRepository): Promise<GameWorld> {
  let parsed: unknown
  try { parsed = JSON.parse(await repository.load()) } catch { throw new Error('Saved game contains malformed JSON') }
  const restored = deserializeGameWorldSaveV4(parsed)
  const integrity = repairRosterContractIntegrity(restored)
  if (integrity.reports.some((report) => report.classification === 'UNRECOVERABLE')) throw new Error('Saved game has unresolved roster/contract integrity; no authority was selected')
  return integrity.world
}

function assertNoUnresolvedRosterContractIntegrity(world: GameWorld): void {
  const integrity = repairRosterContractIntegrity(world)
  if (integrity.world !== world || integrity.reports.some((report) => report.classification === 'UNRECOVERABLE')) throw new Error('Game must pass roster/contract integrity repair before it can be saved')
}
