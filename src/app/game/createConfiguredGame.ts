import type { GameWorld } from '@/domain/world'
import { ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { createAcbTestGame } from './createAcbTestGame'
import { createNewGame } from './createNewGame'
import type { NewGameConfiguration } from './NewGameUniverseCatalog'

export function createConfiguredGame(options: NewGameConfiguration = {}): GameWorld {
  const universeId = options.universeId ?? 'prototype'
  if (universeId === ACB_TEST_UNIVERSE_ID) {
    return createAcbTestGame({ userTeamKey: options.userTeamKey, coachRpgPreset: options.coachRpgPreset })
  }
  return createNewGame({ coachRpgPreset: options.coachRpgPreset })
}
