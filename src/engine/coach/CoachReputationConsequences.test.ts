import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { calculateCoachMatchExpectation, calculateMatchReputationImpact, type CoachMatchReputationContext } from '@/domain/coachReputation'
import { applyMatchResult } from '@/engine/match'
import { finalizeSeason } from '@/engine/season'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'

import { applyMatchCoachReputationConsequences, applySeasonChampionCoachReputation } from './CoachReputationConsequences'

describe('Coach reputation consequences', () => {
  it('applies deterministic match events and domain deltas to both user and AI coaches', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => candidate.homeTeamId === Object.values(world.teams).find((team) => team.coachId === world.userCoachId)!.id)!
    const homeCoachId = world.teams[game.homeTeamId]!.coachId!
    const awayCoachId = world.teams[game.awayTeamId]!.coachId!
    const next = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 84, awayScore: 76 })
    const homeEvent = next.coachReputationProfilesByCoachId[homeCoachId]!.events[0]!
    const awayEvent = next.coachReputationProfilesByCoachId[awayCoachId]!.events[0]!
    const homeContext = homeEvent.context as CoachMatchReputationContext
    const homeExpected = calculateCoachMatchExpectation({ coachTeamStrength: homeContext.teamStrength, opponentTeamStrength: homeContext.opponentTeamStrength, coachIsHome: true })

    expect(homeEvent.id).toBe(`coach-reputation:match:${game.id}:${homeCoachId}`)
    expect(awayEvent.id).toBe(`coach-reputation:match:${game.id}:${awayCoachId}`)
    expect(homeEvent.id).not.toBe(awayEvent.id)
    expect(homeEvent.context).toMatchObject({ kind: 'matchResult', gameId: game.id, teamId: game.homeTeamId, opponentTeamId: game.awayTeamId, result: 'win', coachIsHome: true, expectedWinProbability: homeExpected })
    expect(next.coachReputationProfilesByCoachId[homeCoachId]!.values.competitive).toBe(200 + calculateMatchReputationImpact(homeExpected, 'win').deltas.competitive)
    expect(next.coachReputationProfilesByCoachId[homeCoachId]!.values.publicStanding).toBeGreaterThan(200)
    expect(next.coachReputationProfilesByCoachId[awayCoachId]!.values.competitive).toBeLessThan(200)
    expect(next.coachReputationProfilesByCoachId[awayCoachId]!.values.publicStanding).toBeLessThan(200)
    expect(next.coachReputationProfilesByCoachId[homeCoachId]!.values).toMatchObject({ development: 200, professional: 200 })
    expect(next.coachReputationProfilesByCoachId[awayCoachId]!.values).toMatchObject({ development: 200, professional: 200 })
    expect(next.games[game.id]!.result).toEqual({ homeScore: 84, awayScore: 76 })
    expect(applyMatchCoachReputationConsequences(next, next.games[game.id]!)).toEqual(next)
  })

  it('updates both AI coaches for an AI versus AI game', () => {
    const world = createNewGame()
    const game = Object.values(world.games).find((candidate) => world.teams[candidate.homeTeamId]!.coachId !== world.userCoachId && world.teams[candidate.awayTeamId]!.coachId !== world.userCoachId)!
    const next = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 70, awayScore: 80 })

    expect(next.coachReputationProfilesByCoachId[world.teams[game.homeTeamId]!.coachId!]!.events).toHaveLength(1)
    expect(next.coachReputationProfilesByCoachId[world.teams[game.awayTeamId]!.coachId!]!.events).toHaveLength(1)
  })

  it('awards only the canonical season champion once and persists its context', () => {
    let world = createNewGame()
    for (const game of Object.values(world.games)) world = applyMatchResult(world, { gameId: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: 80, awayScore: 70 })
    const seasonId = world.currentSeasonId
    for (const season of Object.values(world.seasons).filter((candidate) => candidate.id !== seasonId)) world = finalizeSeason(world, season.id)
    const finalized = finalizeSeason(world, seasonId)
    const championTeamId = finalized.seasonHistoryBySeasonId[seasonId]!.championTeamId
    const championCoachId = finalized.teams[championTeamId]!.coachId!
    const championProfile = finalized.coachReputationProfilesByCoachId[championCoachId]!
    const event = championProfile.events.find((candidate) => candidate.source === 'seasonAchievement' && (candidate.context as { readonly seasonId?: string }).seasonId === seasonId)!
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(finalized, '2032-12-31T00:00:00.000Z'))

    expect(event).toMatchObject({ id: `coach-reputation:season-champion:${seasonId}:${championCoachId}`, deltas: { competitive: 40, publicStanding: 20 }, context: { kind: 'seasonAchievement', seasonId, teamId: championTeamId, achievement: 'champion' } })
    expect(championProfile.values).toMatchObject({ development: 200, professional: 200 })
    expect(applySeasonChampionCoachReputation(finalized, seasonId)).toEqual(finalized)
    expect(Object.entries(finalized.coachReputationProfilesByCoachId).filter(([coachId, profile]) => coachId !== championCoachId && profile.events.some((candidate) => candidate.source === 'seasonAchievement'))).toEqual([])
    expect(loaded.coachReputationProfilesByCoachId[championCoachId]!.events.find((candidate) => candidate.id === event.id)!.context).toEqual(event.context)
  })
})
