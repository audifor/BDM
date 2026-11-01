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
import { NCAA_D1_2026_MEN_UNIVERSE_ID, NCAA_D1_2026_WOMEN_UNIVERSE_ID } from './NewGameUniverseCatalog'
import { createNcaaD1Real2026Universe } from './NcaaD1Real2026Universe'
import { ncaaD1Real2026GameplayPolicy } from './NcaaD1Real2026GeneratedPolicy'
import { buildNcaaD1Real2026ConferenceSnapshot } from './NcaaD1Real2026Conferences'
import type { NcaaD1Real2026FixtureSource } from './NcaaD1Real2026Fixtures'
import officialNcaa2026 from '@/data/worlddb-v2/ncaa-d1-2026-27-official-fixtures-sample.json'

export function createConfiguredGame(options: NewGameConfiguration = {}): GameWorld {
  const universeId = options.universeId ?? 'prototype'
  if (universeId === NCAA_D1_2026_MEN_UNIVERSE_ID || universeId === NCAA_D1_2026_WOMEN_UNIVERSE_ID) {
    const managedGender = universeId === NCAA_D1_2026_MEN_UNIVERSE_ID ? 'men' : 'women'
    const seed = options.ncaaSeed ?? 202627
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new RangeError('NCAA 2026-27 universe needs a valid 32-bit seed')
    const programs = buildNcaaD1Real2026ConferenceSnapshot(managedGender)
    const userTeamKey = options.userTeamKey
    if (!userTeamKey || !programs.teams.some(team => team.id === userTeamKey)) {
      throw new RangeError('Select one of the real NCAA 2026-27 programs in the chosen gender')
    }
    const schedules = { men: ncaaD1Real2026GameplayPolicy('men', seed), women: ncaaD1Real2026GameplayPolicy('women', seed) }
    const original = createNcaaD1Real2026Universe({
      seed, managedGender, managedProgramId: userTeamKey,
      sourcedFixtures: officialNcaa2026.fixtures as readonly NcaaD1Real2026FixtureSource[],
      generatedSchedules: schedules,
    }).world
    return options.userCoachCreation === undefined ? original : applyUserCoachCreation(original, options.userCoachCreation)
  }
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
