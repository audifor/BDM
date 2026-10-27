import type { GameWorld } from '@/domain/world'
import { ACB_CAREER_START_DATE, ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import { parseGameDate } from '@/domain/date'
import { createAcbTestGame } from './createAcbTestGame'
import { createNewGame } from './createNewGame'
import { BDM_GAME_BALANCE_V1 } from '@/app/gameBalance/BdmGameBalanceV1'
import { NCAA_SIMULATED_UNIVERSE_ID, WORLD_DB_SPAIN_UNIVERSE_ID, type NewGameConfiguration } from './NewGameUniverseCatalog'
import { createWorldDbSpainGame, type WorldDbSpainGameAccess } from './WorldDbSpainGame'
import { createNcaaSimulatedGame } from './createNcaaSimulatedGame'
import { applyUserCoachCreation } from './UserCoachCreator'
import { WORLD_DB_V2_UNIVERSE_ID } from './NewGameUniverseCatalog'

export function createConfiguredGame(options: NewGameConfiguration = {}): GameWorld {
  const universeId = options.universeId ?? 'prototype'
  if (universeId === WORLD_DB_SPAIN_UNIVERSE_ID || universeId === WORLD_DB_V2_UNIVERSE_ID) throw new RangeError('World DB requires async new-game bootstrap')
  const world = universeId === ACB_TEST_UNIVERSE_ID
    ? createAcbTestGame({ userTeamKey: options.userTeamKey, careerStartDate: parseGameDate(ACB_CAREER_START_DATE), ...(options.userCoachCreation === undefined ? { coachRpgPreset: options.coachRpgPreset } : {}), gameBalance: BDM_GAME_BALANCE_V1, playableMarket: true })
    : universeId === NCAA_SIMULATED_UNIVERSE_ID
      ? createNcaaSimulatedGame({ gameBalance: BDM_GAME_BALANCE_V1 })
      : createNewGame({ ...(options.userCoachCreation === undefined ? { coachRpgPreset: options.coachRpgPreset } : {}), gameBalance: BDM_GAME_BALANCE_V1 })
  return options.userCoachCreation === undefined ? world : applyUserCoachCreation(world, options.userCoachCreation)
}

export async function createConfiguredGameAsync(
  options: NewGameConfiguration = {},
  access?: WorldDbSpainGameAccess,
): Promise<GameWorld> {
  if (options.universeId === WORLD_DB_V2_UNIVERSE_ID) {
    if(!options.worldDbV2)throw new Error('WorldDB V2 source, date and seed are required')
    if(options.worldDbV2.activeCompetitionIds){
      const { createWorldDbV2Universe } = await import('./WorldDbV2Universe')
      return createWorldDbV2Universe(options.worldDbV2.sourceRoot,options.worldDbV2.startDate,options.worldDbV2.seed,options.userTeamKey??'',options.worldDbV2.activeCompetitionIds,options.userCoachCreation)
    }
    const { createWorldDbV2Game } = await import('./WorldDbV2Game')
    return createWorldDbV2Game(options.worldDbV2.sourceRoot,options.worldDbV2.startDate,options.worldDbV2.seed,options.userTeamKey??'',options.userCoachCreation,options.worldDbV2.competitionId)
  }
  if (options.universeId === WORLD_DB_SPAIN_UNIVERSE_ID) {
    return createWorldDbSpainGame(options.userTeamKey ?? '', access, BDM_GAME_BALANCE_V1, options.userCoachCreation)
  }
  return createConfiguredGame(options)
}
