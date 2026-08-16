import { describe, expect, it } from 'vitest'

import { createNewGame, simulateAndApplyGame } from '@/app/game'
import { createGameWorld } from '@/domain/world'
import { calculateStandings } from '@/engine/competition/standings'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import { advanceGameDay } from '@/app/game/advanceGameDay'
import { getCurrentSeason } from '@/app/game/selectors'
import { finalizeSeason, getSeasonHistoryRecord, isSeasonComplete } from './SeasonProgression'

describe('season progression', () => {
  it('does not use the calendar date as the completion criterion', () => {
    const world = createNewGame()
    const season = getCurrentSeason(world)
    const atSeasonEnd = createGameWorld({ currentDate: season.endDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), seasons: Object.values(world.seasons), games: Object.values(world.games), matchStatLogs: Object.values(world.matchStatLogsByGameId) })
    expect(isSeasonComplete(atSeasonEnd, season.id)).toBe(false)
  })

  it('finalizes exactly once after the final scheduled game and preserves its final table', () => {
    let world = createNewGame()
    const season = getCurrentSeason(world)
    const games = Object.values(world.games).filter((game) => game.seasonId === season.id)
    for (const game of games.filter((game) => game.id !== games.at(-1)!.id)) world = simulateAndApplyGame(world, game)

    expect(isSeasonComplete(world, season.id)).toBe(false)
    expect(getSeasonHistoryRecord(world, season.id)).toBeUndefined()
    expect(() => finalizeSeason(world, season.id)).toThrow('is not complete')

    world = simulateAndApplyGame(world, games.at(-1)!)
    const history = getSeasonHistoryRecord(world, season.id)!
    const finalStandings = calculateStandings(world, season.id)

    expect(games).toHaveLength(56)
    expect(isSeasonComplete(world, season.id)).toBe(true)
    expect(Object.values(world.seasonHistoryBySeasonId)).toHaveLength(1)
    expect(Object.values(world.matchStatLogsByGameId)).toHaveLength(games.length)
    expect(history.championTeamId).toBe(finalStandings[0]!.teamId)
    expect(history.finalStandings).toEqual(finalStandings)
    expect(history.completedOn).toBe(games.reduce((latest, game) => game.date > latest ? game.date : latest, games[0]!.date))
    expect(finalStandings.every((line) => line.played === 14)).toBe(true)
    expect(finalStandings.reduce((sum, line) => sum + line.wins, 0)).toBe(56)
    expect(finalStandings.reduce((sum, line) => sum + line.losses, 0)).toBe(56)
    expect(() => finalizeSeason(world, season.id)).toThrow('already finalized')
    expect(() => advanceGameDay(world)).toThrow('Season is complete')
  })

  it('rejects invalid history snapshots through GameWorld validation', () => {
    let world = createNewGame()
    for (const game of Object.values(world.games)) world = simulateAndApplyGame(world, game)
    const history = Object.values(world.seasonHistoryBySeasonId)[0]!
    const second = history.finalStandings[1]!

    expect(() => rebuildWithHistory(world, [{ ...history, championTeamId: second.teamId }])).toThrow('champion must be first')
    expect(() => rebuildWithHistory(world, [{ ...history, finalStandings: [{ ...history.finalStandings[0]!, position: 2 }, second, ...history.finalStandings.slice(2)] }])).toThrow('invalid standings positions')
  })

  it('round-trips completed season history and accepts old active V1 payloads without it', () => {
    let world = createNewGame()
    for (const game of Object.values(world.games)) world = simulateAndApplyGame(world, game)
    const envelope = serializeGameWorldV1(world, '2032-12-31T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(envelope)
    const oldActivePayload = serializeGameWorldV1(createNewGame(), '2032-10-01T00:00:00.000Z')
    const { seasonHistoryBySeasonId: _history, ...oldPayload } = oldActivePayload.payload

    expect(loaded.seasonHistoryBySeasonId).toEqual(world.seasonHistoryBySeasonId)
    expect(deserializeGameWorldV1({ ...oldActivePayload, payload: oldPayload }).seasonHistoryBySeasonId).toEqual({})
    expect(() => deserializeGameWorldV1({ ...envelope, payload: { ...envelope.payload, seasonHistoryBySeasonId: [] } })).toThrow('Completed season is missing season history')
  })
})

function rebuildWithHistory(world: ReturnType<typeof createNewGame>, seasonHistory: Parameters<typeof createGameWorld>[0]['seasonHistory']) {
  return createGameWorld({ currentDate: world.currentDate, currentSeasonId: world.currentSeasonId, userCoachId: world.userCoachId, countries: Object.values(world.countries), coaches: Object.values(world.coaches), players: Object.values(world.players), teams: Object.values(world.teams), competitions: Object.values(world.competitions), seasons: Object.values(world.seasons), games: Object.values(world.games), matchStatLogs: Object.values(world.matchStatLogsByGameId), seasonHistory })
}
