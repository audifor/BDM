import type { GameWorld } from '@/domain/world'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { createAcbTestGame } from './createAcbTestGame'
import { createNewGame } from './createNewGame'
import { WORLD_DB_SPAIN_UNIVERSE_ID, type NewGameConfiguration } from './NewGameUniverseCatalog'
import { createWorldDbSpainGame, type WorldDbSpainGameAccess } from './WorldDbSpainGame'

export function createConfiguredGame(options: NewGameConfiguration = {}): GameWorld {
  const universeId = options.universeId ?? 'prototype'
  if (universeId === ACB_TEST_UNIVERSE_ID) {
    return createAcbTestGame({ userTeamKey: options.userTeamKey, coachRpgPreset: options.coachRpgPreset })
  }
  return createNewGame({ coachRpgPreset: options.coachRpgPreset })
}

export async function createConfiguredGameAsync(
  options: NewGameConfiguration = {},
  access?: WorldDbSpainGameAccess,
): Promise<GameWorld> {
  if (options.universeId === WORLD_DB_SPAIN_UNIVERSE_ID) {
    return createWorldDbSpainGame(options.userTeamKey ?? '', access)
  }
  return createConfiguredGame(options)
}
