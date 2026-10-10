import type { GameWorld } from '@/domain/world'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { createAcbTestGame } from './createAcbTestGame'
import { createNewGame } from './createNewGame'
import { BDM_GAME_BALANCE_V1 } from '@/app/gameBalance/BdmGameBalanceV1'
import { NCAA_SIMULATED_UNIVERSE_ID, WORLD_DB_SPAIN_UNIVERSE_ID, type NewGameConfiguration } from './NewGameUniverseCatalog'
import { createWorldDbSpainGame, type WorldDbSpainGameAccess } from './WorldDbSpainGame'
import { createNcaaSimulatedGame } from './createNcaaSimulatedGame'

export function createConfiguredGame(options: NewGameConfiguration = {}): GameWorld {
  const universeId = options.universeId ?? 'prototype'
  if (universeId === ACB_TEST_UNIVERSE_ID) {
    return createAcbTestGame({ userTeamKey: options.userTeamKey, coachRpgPreset: options.coachRpgPreset, gameBalance: BDM_GAME_BALANCE_V1 })
  }
  if (universeId === NCAA_SIMULATED_UNIVERSE_ID) return createNcaaSimulatedGame({ gameBalance: BDM_GAME_BALANCE_V1 })
  return createNewGame({ coachRpgPreset: options.coachRpgPreset, gameBalance: BDM_GAME_BALANCE_V1 })
}

export async function createConfiguredGameAsync(
  options: NewGameConfiguration = {},
  access?: WorldDbSpainGameAccess,
): Promise<GameWorld> {
  if (options.universeId === WORLD_DB_SPAIN_UNIVERSE_ID) {
    return createWorldDbSpainGame(options.userTeamKey ?? '', access, BDM_GAME_BALANCE_V1)
  }
  return createConfiguredGame(options)
}
