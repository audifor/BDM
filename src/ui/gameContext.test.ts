import { describe, expect, it } from 'vitest'

import { createAcbTestGame, createNewGame } from '@/app/game'
import { updateGameWorld } from '@/domain/world'
import { resolveGameCapabilities, resolveGameContext } from './gameContext'

describe('game context', () => {
  it('derives the user club, active competition, season, ecosystem and date from GameWorld', () => {
    const world = createNewGame()
    const context = resolveGameContext(world)
    const season = world.seasons[world.currentSeasonId]!
    const competition = world.competitions[season.competitionId]!

    expect(context.clubName).toBeDefined()
    expect(context.competitionName).toBe(competition.name)
    expect(context.seasonLabel).toBe(season.label)
    expect(context.ecosystemName).toBe(world.ecosystems[competition.ecosystemId]!.name)
    expect(context.currentDate).toBe(world.currentDate)
    expect(context.phaseLabel).toBeUndefined()
  })

  it('uses configured world records, rather than ecosystem-name branching, for capabilities', () => {
    const world = createNewGame()
    expect(resolveGameCapabilities(world)).toEqual({ hasDraft: false, hasTrades: false, hasSalaryCap: false, isNcaa: false })
  })

  it('derives hasTrades from the user club\'s own trade season, not from the season pointer', () => {
    const world = createNewGame()
    const nbaSeason = Object.values(world.seasons).find((season) => world.tradeRulesBySeasonId[season.id] !== undefined)!
    const nbaClubId = world.competitions[nbaSeason.competitionId]!.participantTeamIds.find((teamId) => world.teams[teamId]!.coachId !== undefined)!
    const coached = updateGameWorld(world, { userCoachId: world.teams[nbaClubId]!.coachId!, currentDate: nbaSeason.startDate })

    // The world pointer still selects the FIBA-like season, which never had trade rules.
    expect(coached.currentSeasonId).toBe(world.currentSeasonId)
    expect(coached.currentSeasonId).not.toBe(nbaSeason.id)
    expect(coached.tradeRulesBySeasonId[coached.currentSeasonId]).toBeUndefined()
    expect(resolveGameCapabilities(coached).hasTrades).toBe(true)
    expect(resolveGameCapabilities(coached).hasSalaryCap).toBe(true)
    expect(resolveGameCapabilities(world, nbaSeason.competitionId).hasTrades).toBe(false)
  })

  it('derives NCAA navigation from the coached program even when another ecosystem owns the world pointer', () => {
    const world = createNewGame()
    const ncaaSeason = Object.values(world.seasons).find((season) => world.ecosystems[world.competitions[season.competitionId]!.ecosystemId]?.kind === 'ncaaLike')!
    const programId = world.competitions[ncaaSeason.competitionId]!.participantTeamIds.find((teamId) => world.teams[teamId]!.coachId !== undefined)!
    const coached = updateGameWorld(world, {
      userCoachId: world.teams[programId]!.coachId!,
      currentDate: ncaaSeason.startDate,
      gmPlanStates: Object.values(world.gmPlanStatesById).filter((plan) => plan.teamId !== programId),
    })

    expect(coached.currentSeasonId).not.toBe(ncaaSeason.id)
    expect(resolveGameCapabilities(coached).isNcaa).toBe(true)
  })

  it('does not turn an uncapped professional salary rule into a salary-cap capability', () => {
    const world = createAcbTestGame({ playableMarket: true })
    expect(resolveGameCapabilities(world).hasSalaryCap).toBe(false)
  })

  it('can derive a screen-specific competition context without changing GameWorld state', () => {
    const world = createNewGame()
    const currentCompetitionId = world.seasons[world.currentSeasonId]!.competitionId
    const competition = Object.values(world.competitions).find((candidate) => candidate.id !== currentCompetitionId)!
    const currentSeasonId = world.currentSeasonId

    expect(resolveGameContext(world, competition.id).competitionName).toBe(competition.name)
    expect(world.currentSeasonId).toBe(currentSeasonId)
  })
})
