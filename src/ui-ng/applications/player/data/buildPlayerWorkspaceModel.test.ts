import { describe, expect, it } from 'vitest'

import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'
import { completeMatch, createConfiguredGame, createNewGame, prepareUserMatch } from '@/app/game'
import { createAcbTestGame } from '@/app/game/createAcbTestGame'
import { derivePlayerKnowledgeAccess } from '@/app/player/PlayerKnowledgeAccess'
import { updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { boxScoreValuation } from '@/engine/stats/boxScoreValuation'
import { getPlayerSeasonStats } from '@/engine/stats/PlayerHistory'
import { ACB_QUICK_START_TEAM_KEY, ACB_TEST_UNIVERSE_ID } from '@/data/acb2026'
import type { PlayerId } from '@/domain/ids'

import {
  aggregateCategoryValue,
  buildOverviewRatingKeys,
  ratingCategory,
} from './ratingCatalog'
import {
  buildPlayerWorkspaceModel,
  defaultPlayerIdForNg,
  rosterPlayerOptions,
} from './buildPlayerWorkspaceModel'

describe('buildPlayerWorkspaceModel', () => {
  it('builds a real presentation model from canonical player ratings', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)
    expect(playerId).toBeDefined()

    const model = buildPlayerWorkspaceModel(world, playerId!)
    expect(model).toBeDefined()
    expect(model!.ratings.map((rating) => rating.id)).toEqual(PLAYER_TRUTH_RATING_KEYS)
    expect(model!.ratings.map((rating) => rating.value)).toEqual(
      PLAYER_TRUTH_RATING_KEYS.map((key) => world.players[playerId!]!.basketball.ratings[key]),
    )
    expect(model!.ratings.every((rating) => rating.value >= 1 && rating.value <= 100)).toBe(true)
    expect(model!.overview.developmentPulse.potentialStatus).toBe('unavailable')
    expect(model!.strengths).toHaveLength(3)
    expect(model!.limitations).toHaveLength(3)
    expect(model!.shotProfile.status).toBe('unavailable')
    expect(model!.roleProfile.isDerived).toBe(true)
    expect(model!.identity.jerseyNumber.status).toBe('unavailable')
    expect(model!.identity.teamId.status).toBe('available')
    expect(model!.identity.dateOfBirth.status).toBe('available')
    expect(model!.identity.wingspan.status).toBe('available')
    expect(model!.attributes.allRatings.map((rating) => rating.id)).toEqual(PLAYER_TRUTH_RATING_KEYS)
    expect(model!.knowledgeAccess.kind).toBe('own-roster')
    expect('player' in model!).toBe(false)
    expect(model!.person).toBe(world.personsById[world.players[playerId!]!.personId!])
    expect(model!.attributes.categories.length).toBe(8)
    expect(model!.attributes.categories.reduce((count, category) => count + category.all.length, 0)).toBe(80)
    expect(model!.attributes.categories[0]!.note).toContain('average ')
    expect(model!.attributes.categories[0]!.note).not.toContain('mean')
    expect(model!.development.longitudinal.status).toBe('unavailable')
    expect(model!.history.scope.scopeNote).toContain('persisted in this save')
  })

  it('projects external profiles from viewer knowledge and removes exact rating data', () => {
    const world = createNewGame()
    const viewer = getUserTeam(world)!
    const player = Object.values(world.players).find((candidate) => !viewer.rosterPlayerIds.includes(candidate.id))!
    const knownWorld = updateGameWorld(world, {
      organizationKnowledge: [{
        organizationId: viewer.organizationId,
        subjectPlayerId: player.id,
        dimensions: {
          shooting: { coverage: 1, confidence: 0.9, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 78, uncertainty: 0 },
          'rating:THREE_POINT_STATIC': { coverage: 0.75, confidence: 0.8, assessedAt: world.currentDate, provenance: 'scoutReport', estimate: 61, uncertainty: 5 },
        },
      }],
    })
    const known = buildPlayerWorkspaceModel(knownWorld, player.id)!
    const unknown = buildPlayerWorkspaceModel(world, player.id)!
    const playerTeam = Object.values(world.teams).find((team) => team.rosterPlayerIds.includes(player.id))!
    const sameOrganization = {
      ...world,
      teams: {
        ...world.teams,
        [playerTeam.id]: { ...playerTeam, organizationId: viewer.organizationId },
      },
    } as typeof world
    const sharedOrg = buildPlayerWorkspaceModel(sameOrganization, player.id)!

    expect(known.knowledgeAccess.kind).toBe('scouted')
    expect(known.knowledgeAccess.knownDimensions.map((dimension) => dimension.id)).toContain('shooting')
    expect(known.knowledgeAccess.knownDimensions.find((dimension) => dimension.id === 'shooting')!.evaluation.mode).toBe('EXACT')
    expect(known.knowledgeAccess.knownDimensions.find((dimension) => dimension.id === 'shooting')!.displayLabel).toBe('78')
    expect(known.knowledgeAccess.ratingEvaluations.find((rating) => rating.key === 'THREE_POINT_STATIC')).toMatchObject({ evaluation: { mode: 'RANGE', estimate: 61, uncertainty: 5 }, displayLabel: '56-66' })
    expect(known.knowledgeAccess.ratingEvaluations.find((rating) => rating.key === 'FREE_THROW')!.evaluation).toBeNull()
    expect(known.knowledgeAccess.ratingEvaluations).toHaveLength(80)
    expect(known.ratings).toEqual([])
    expect(known.attributes.allRatings).toEqual([])
    expect(known.attributes.evolutionByRating).toEqual({})
    expect(known.strengths).toEqual([])
    expect(known.limitations).toEqual([])
    expect(known.development.seasonStimulus.topRatings).toEqual([])
    expect(known.development.longitudinal.series).toEqual([])
    expect(known.development.longitudinal.events).toEqual([])
    expect(known.development.categoryCurve).toEqual([])
    expect(known.knowledgeAccess.currentRatings).toBeUndefined()
    expect(unknown.knowledgeAccess.kind).toBe('unknown')
    expect(unknown.knowledgeAccess.knownDimensions).toEqual([])
    expect(unknown.ratings).toEqual([])
    expect(sharedOrg.knowledgeAccess.kind).toBe('unknown')
    expect(sharedOrg.ratings).toEqual([])
  })

  it('uses freshness-adjusted knowledge and the same access projection for ACB baseline data', () => {
    const base = createNewGame()
    const viewer = getUserTeam(base)!
    const player = Object.values(base.players).find((candidate) => !viewer.rosterPlayerIds.includes(candidate.id))!
    const fresh = updateGameWorld(base, {
      organizationKnowledge: [{
        organizationId: viewer.organizationId,
        subjectPlayerId: player.id,
        dimensions: {
          shooting: { coverage: 1, confidence: 0.9, assessedAt: base.currentDate, provenance: 'scoutReport', estimate: 78, uncertainty: 0 },
        },
      }],
    })
    const nextDate = new Date(`${base.currentDate}T00:00:00.000Z`)
    nextDate.setUTCDate(nextDate.getUTCDate() + 365)
    const stale = updateGameWorld(fresh, { currentDate: nextDate.toISOString().slice(0, 10) as never })
    const staleModel = buildPlayerWorkspaceModel(stale, player.id)!
    const acb = createAcbTestGame({ userTeamKey: 'caz' })
    const acbViewer = getUserTeam(acb)!
    const acbPlayer = Object.values(acb.players).find((candidate) => !acbViewer.rosterPlayerIds.includes(candidate.id))!
    const acbAccess = derivePlayerKnowledgeAccess(acb, acbPlayer.id)

    expect(staleModel.knowledgeAccess.knownDimensions.find((dimension) => dimension.id === 'shooting')!.evaluation.mode).not.toBe('EXACT')
    expect(staleModel.ratings).toEqual([])
    expect(acbAccess.kind).toBe('scouted')
    expect(acbAccess.knownDimensions.length).toBeGreaterThan(0)
  })

  it('aggregates radar categories as the mean of canonical ratings in each family', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const player = world.players[playerId]!
    const expected = aggregateCategoryValue('shooting', player.basketball.ratings)
    const model = buildPlayerWorkspaceModel(world, playerId)
    expect(model!.radarAxes.find((axis) => axis.key === 'shooting')?.value).toBe(expected)
  })

  it('selects a representative overview subset capped at twelve ratings', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const keys = buildOverviewRatingKeys(world.players[playerId]!.basketball.ratings)
    expect(keys.length).toBeLessThanOrEqual(12)
    expect(keys.every((key) => ratingCategory(key))).toBeTruthy()
  })

  it('supports switching across roster players without inventing domain fields', () => {
    const world = createConfiguredGame({ universeId: ACB_TEST_UNIVERSE_ID, userTeamKey: ACB_QUICK_START_TEAM_KEY })
    const options = rosterPlayerOptions(world)
    expect(options.length).toBeGreaterThan(0)

    const guard = options.find((option) => option.label.includes('PG')) ?? options[0]
    const big = options.find((option) => option.label.includes('C ') || option.label.endsWith('· C')) ?? options.at(-1)

    const guardModel = buildPlayerWorkspaceModel(world, guard!.id as PlayerId)
    const bigModel = buildPlayerWorkspaceModel(world, big!.id as PlayerId)

    expect(guardModel!.identity.firstName).not.toEqual(bigModel!.identity.firstName)
    expect(guardModel!.ratings.some((rating) => rating.label.length > 0)).toBe(true)
  })

  it('adds FIBA valuation to season performance after a completed match', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const stats = getPlayerSeasonStats(updated, playerId, updated.currentSeasonId)
    const expected = (boxScoreValuation(stats) / stats.gamesPlayed).toFixed(1)
    const model = buildPlayerWorkspaceModel(updated, playerId)

    expect(model!.seasonPerformance.status).toBe('available')
    expect(model!.seasonPerformance.valuation).toBe(expected)
    expect(model!.seasonPerformance.primary[0]).toEqual({ label: 'VAL', value: expected })
  })
})
