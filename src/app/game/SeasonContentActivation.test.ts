import { describe, expect, it } from 'vitest'
import { updateGameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { simulateRemainingGamesToday } from './advanceGameDay'
import { advanceDay } from '@/engine/calendar'
import { createNewGame } from './createNewGame'

describe('season content activation', () => {
  it('creates only configured recruiting content and preserves its capability through save/load', () => {
    const world = createNewGame()
    const ncaaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.recruitingRules !== undefined)!
    const started = advanceDay(updateGameWorld(world, { currentDate: ncaaSeason.startDate }))
    const cycle = Object.values(started.recruitingCyclesById).find((item) => item.sourceSeasonId === ncaaSeason.id)!
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(started, '2032-10-01T00:00:00.000Z'))

    expect(Object.values(started.recruitProfilesById).filter((item) => item.cycleId === cycle.id)).not.toHaveLength(0)
    expect(Object.values(started.recruitingCyclesById).filter((item) => item.ecosystemId === cycle.ecosystemId)).toHaveLength(1)
    expect(loaded.ecosystems[cycle.ecosystemId]!.recruitingRules).toEqual(started.ecosystems[cycle.ecosystemId]!.recruitingRules)
    expect(Object.values(loaded.recruitProfilesById).filter((item) => item.cycleId === cycle.id)).toEqual(Object.values(started.recruitProfilesById).filter((item) => item.cycleId === cycle.id))
  })

  it('creates one two-round NBA draft only when its own competition completes while another remains active', () => {
    const world = createNewGame()
    const nbaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]!.draftRules !== undefined)!
    const otherSeason = Object.values(world.seasons).find((season) => season.id !== nbaSeason.id)!
    const nbaGames = Object.values(world.games).filter((game) => game.seasonId === nbaSeason.id)
    const lastGame = nbaGames[nbaGames.length - 1]!
    const staged = updateGameWorld(world, { currentDate: lastGame.date, games: Object.values(world.games).map((game) => game.seasonId !== nbaSeason.id ? game : game.id === lastGame.id ? game : { ...game, status: 'completed' as const, result: { homeScore: 100, awayScore: 90 } }) })
    const advanced = simulateRemainingGamesToday(staged)
    const draft = Object.values(advanced.draftsById).find((item) => item.sourceSeasonId === nbaSeason.id)!

    expect(advanced.seasonHistoryBySeasonId[otherSeason.id]).toBeUndefined()
    expect(draft.rules).toMatchObject({ rounds: 2, scheduledAfterDays: 7 })
    expect(Object.values(advanced.draftPicksById).filter((item) => item.draftId === draft.id)).toHaveLength(8)
    expect(Object.values(advanced.draftsById).filter((item) => item.sourceSeasonId === nbaSeason.id)).toHaveLength(1)
    expect(Object.values(simulateRemainingGamesToday(advanced).draftsById).filter((item) => item.sourceSeasonId === nbaSeason.id)).toHaveLength(1)
  })
})
