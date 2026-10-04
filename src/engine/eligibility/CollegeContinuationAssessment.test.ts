import { describe, expect, it } from 'vitest'
import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { assessCollegeContinuation, recordCollegeContinuationAssessment } from './CollegeContinuationAssessment'

describe('CollegeContinuationAssessment', () => {
  it('uses actual season minutes and starts to explain experienced role', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const game = world.games[simulation.gameId]!
    const playerId = simulation.squads.home[0]!
    const withoutExperience = assessCollegeContinuation(world, playerId, game.homeTeamId, game.seasonId)!
    const played = completeMatch(world, simulation)
    const withExperience = assessCollegeContinuation(played, playerId, game.homeTeamId, game.seasonId)!
    expect(withExperience.experience.gamesPlayed).toBe(1)
    expect(withExperience.experience.minutesPerGame).toBeGreaterThan(0)
    expect(withExperience.experience).not.toEqual(withoutExperience.experience)
    expect(withExperience).not.toHaveProperty('transferProbability')
  }, 20_000)

  it('evaluates an explicit role promise against recorded season experience', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const game = world.games[simulation.gameId]!
    const playerId = simulation.squads.home[0]!
    const base = completeMatch(world, simulation)
    const profile = {
      id: 'continuation-test-recruit', playerId, cycleId: Object.keys(base.recruitingCyclesById)[0]!, origin: 'preCollege' as const,
      position: base.players[playerId]!.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'rotation' as const,
      preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'open' as const,
      recruitingRpg: { preferenceProfile: { importance: { playingTime: 10, roleClarity: 10, coachTrust: 5, familyTrust: 5, development: 5, winning: 5, prestige: 5, distance: 5, academics: 5, professionalPathway: 5, internationalSupport: 5 }, dealbreakers: [], decisionStyle: 'deliberate' as const }, intel: [], relationships: [], stakeholders: [], promises: [{ id: 'promise-role', programTeamId: game.homeTeamId, topic: 'role' as const, strength: 'explicit' as const, detail: 'Starting role', madeOn: world.currentDate }], story: [] },
    }
    const withPromise = updateGameWorld(base, { recruitProfiles: [profile] })
    const assessment = assessCollegeContinuation(withPromise, playerId, game.homeTeamId, game.seasonId)!
    expect(assessment.promiseAssessments[0]?.fulfillment).toBe('FULFILLED')
    expect(assessment.promiseAssessments[0]?.explanation).toContain('starts')
  }, 20_000)

  it('records a broken promise trust consequence once in Recruiting relationship history', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.length > 0)!
    const playerId = team.rosterPlayerIds[0]!
    const seasonId = world.currentSeasonId
    const base = assessCollegeContinuation(world, playerId, team.id, seasonId)!
    const cycleId = Object.keys(world.recruitingCyclesById)[0]!
    const profile = {
      id: 'continuation-promise-history', playerId, cycleId, origin: 'preCollege' as const,
      position: world.players[playerId]!.basketball.primaryPosition, publicRank: 1, positionRank: 1, tier: 'rotation' as const,
      preferences: { opportunity: 5, development: 5, competing: 5, coach: 5 }, status: 'open' as const,
      recruitingRpg: { preferenceProfile: { importance: { playingTime: 5, roleClarity: 5, coachTrust: 5, familyTrust: 5, development: 5, winning: 5, prestige: 5, distance: 5, academics: 5, professionalPathway: 5, internationalSupport: 5 }, dealbreakers: [], decisionStyle: 'deliberate' as const }, intel: [], relationships: [{ programTeamId: team.id, actor: 'program' as const, familiarity: 50, rapport: 50, trust: 80, credibility: 50, updatedOn: world.currentDate }], stakeholders: [], promises: [{ id: 'persistent-broken-role', programTeamId: team.id, topic: 'role' as const, strength: 'explicit' as const, detail: 'Starting role', madeOn: world.currentDate }], story: [] },
    }
    const withProfile = updateGameWorld(world, { recruitProfiles: [profile] })
    const broken = { ...base, promiseAssessments: [{ promiseId: 'persistent-broken-role', topic: 'role' as const, strength: 'explicit' as const, fulfillment: 'BROKEN' as const, explanation: 'Role benchmark was not met.' }] }
    const recorded = recordCollegeContinuationAssessment(withProfile, broken)
    const relationship = recorded.recruitProfilesById[profile.id]!.recruitingRpg!.relationships[0]!
    expect(relationship.trust).toBe(70)
    expect(recorded.recruitProfilesById[profile.id]!.recruitingRpg!.promises[0]!.fulfilled).toBe(false)
    expect(recordCollegeContinuationAssessment(recorded, broken)).toBe(recorded)
  })
})
