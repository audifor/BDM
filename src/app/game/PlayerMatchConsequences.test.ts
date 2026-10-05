import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { applyMatchResult, createMatchPlayerProfile, simulateMatchDetailed } from '@/engine/match'
import { SeededRandomSource } from '@/engine/random'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

import { applyPlayerMatchConsequences } from './PlayerMatchConsequences'

describe('PlayerMatchConsequences stimulus provenance', () => {
  it('records the actual per-player Match stimulus while retaining the aggregate authority', () => {
    const world = createNewGame()
    const game = Object.values(world.games)[0]!
    const home = world.teams[game.homeTeamId]!.rosterPlayerIds
    const away = world.teams[game.awayTeamId]!.rosterPlayerIds
    const simulation = simulateMatchDetailed({
      world,
      gameId: game.id,
      homeStrength: { teamId: game.homeTeamId, value: 60 },
      awayStrength: { teamId: game.awayTeamId, value: 40 },
      lineups: { home: home.slice(0, 5), away: away.slice(0, 5) },
      squads: { home, away },
      playerProfiles: { home: home.map((id) => createMatchPlayerProfile(world.players[id]!)), away: away.map((id) => createMatchPlayerProfile(world.players[id]!)) },
      random: new SeededRandomSource(51),
      decisionRandom: new SeededRandomSource(52),
      actorRandom: new SeededRandomSource(53),
    })
    const completed = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: simulation.finalScore.home, awayScore: simulation.finalScore.away })
    const withConsequences = applyPlayerMatchConsequences(world, completed, simulation)
    const events = Object.values(withConsequences.developmentStimulusEventsById)

    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => event.sourceType === 'match' && event.sourceId === game.id && event.date === game.date)).toBe(true)
    for (const event of events) {
      expect(Object.values(event.byRating).some((amount) => (amount ?? 0) > 0)).toBe(true)
      expect(Object.values(withConsequences.developmentStimulusByPlayerId[event.playerId]!.byRating).reduce((sum, amount) => sum + amount, 0)).toBeGreaterThan(0)
    }
    const saved = serializeGameWorldV1(withConsequences, '2033-10-01T00:00:00.000Z')
    const loaded = deserializeGameWorldV1(JSON.parse(JSON.stringify(saved)) as unknown)
    expect(loaded.developmentStimulusEventsById).toEqual(withConsequences.developmentStimulusEventsById)
  })
})
