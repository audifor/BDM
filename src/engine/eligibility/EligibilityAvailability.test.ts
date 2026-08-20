import { describe, expect, it } from 'vitest'

import { createNewGame, PlayUserGameError, prepareMatch } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { MINIMUM_MATCH_SQUAD_SIZE } from '@/engine/match'

import { getAvailablePlayersForCompetition, getEligiblePlayersForCompetition } from './EligibilityEngine'

function ncaaFixture() {
  const world = createNewGame()
  const season = Object.values(world.seasons).find((candidate) => world.ecosystems[world.competitions[candidate.competitionId]!.ecosystemId]!.kind === 'ncaaLike')!
  const game = Object.values(world.games).find((candidate) => candidate.seasonId === season.id)!
  return { world, season, game }
}

describe('Eligibility match availability', () => {
  it('generates NCAA programs with a legal, position-complete normal match squad', () => {
    const { world, season, game } = ncaaFixture()
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      const roster = world.teams[teamId]!.rosterPlayerIds
      const available = getAvailablePlayersForCompetition(world, teamId, game.competitionId, season.id, game.date)
      expect(roster).toHaveLength(7)
      expect(available).toHaveLength(7)
      expect(['PG', 'SG', 'SF', 'PF', 'C'].every((position) => roster.some((playerId) => world.players[playerId]!.basketball.primaryPosition === position))).toBe(true)
    }
    expect(prepareMatch(world, game).squads.home.length).toBeGreaterThanOrEqual(MINIMUM_MATCH_SQUAD_SIZE)
  })

  it('filters an ineligible player before both match flows while preserving a legal squad', () => {
    const { world, season, game } = ncaaFixture()
    const playerId = world.teams[game.homeTeamId]!.rosterPlayerIds[0]!
    const restricted = updateGameWorld(world, { eligibilityRestrictions: [{ id: 'eligibility-restriction:test', playerId, ecosystemId: world.competitions[game.competitionId]!.ecosystemId, reasonCode: 'test', startsAt: game.date }] })
    const eligible = getEligiblePlayersForCompetition(restricted, game.homeTeamId, game.competitionId, season.id, game.date)
    const simulation = prepareMatch(restricted, game)
    expect(eligible).not.toContain(playerId)
    expect(simulation.squads.home).not.toContain(playerId)
    expect(simulation.squads.home.length).toBeGreaterThanOrEqual(MINIMUM_MATCH_SQUAD_SIZE)
  })

  it('reports an insufficient available roster before MatchEngine without an eligibility bypass', () => {
    const { world, game } = ncaaFixture()
    const playerIds = world.teams[game.homeTeamId]!.rosterPlayerIds.slice(0, 8)
    const restricted = updateGameWorld(world, { eligibilityRestrictions: playerIds.map((playerId, index) => ({ id: `eligibility-restriction:${index}`, playerId, ecosystemId: world.competitions[game.competitionId]!.ecosystemId, reasonCode: 'test', startsAt: game.date })) })
    try {
      prepareMatch(restricted, game)
      throw new Error('Expected pre-match availability failure')
    } catch (error) {
      expect(error).toBeInstanceOf(PlayUserGameError)
      expect((error as PlayUserGameError).code).toBe('INSUFFICIENT_AVAILABLE_PLAYERS')
    }
  })
})
