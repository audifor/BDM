import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import type { PlayerId } from '@/domain/ids'
import { organizationIdForTeam } from '@/domain/ids'
import {
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
} from '@/domain/intelligence/OrganizationPlayerEvaluation'
import { DEVELOPMENT_DOMAINS } from '@/domain/player/PlayerDevelopmentProfile'
import { executeTeamTraining } from '@/engine/training/TrainingEngine'

import {
  buildPlayerDevelopmentModel,
  findDevelopmentInspectorDetail,
} from './buildPlayerDevelopmentModel'
import { buildPlayerWorkspaceModel, defaultPlayerIdForNg } from './buildPlayerWorkspaceModel'

function skipToTrainableDate(world: ReturnType<typeof createNewGame>) {
  return updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
}

describe('buildPlayerDevelopmentModel', () => {
  it('builds a sparse honest model when no rating history exists', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerDevelopmentModel(world, playerId)

    expect(model).toBeDefined()
    expect(model!.longitudinal.message).toBe('Historical rating progression is not currently tracked.')
    expect(model!.contextBand.age).toBeGreaterThan(0)
    expect(model!.seasonStimulus.totalStimulus).toBe(0)
    expect(model!.trainingContext.teamIntensity).toBe('Normal')
    expect(model!.trainingContext.teamFocus).toBe('Balanced')
  })

  it('never exposes hidden internal development ceilings in the presentation model', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const player = world.players[playerId]!
    const model = buildPlayerDevelopmentModel(world, playerId)!
    const serialized = JSON.stringify(model)

    for (const domain of DEVELOPMENT_DOMAINS) {
      expect(serialized).not.toContain(String(player.development.ceilings[domain]))
    }
    expect(serialized).not.toContain('growthRate')
    expect(serialized).not.toContain('declineSensitivity')
  })

  it('uses scouting potential evaluations and never exact hidden truth', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const player = world.players[playerId]!
    const team = Object.values(world.teams).find((entry) => entry.rosterPlayerIds.includes(playerId))!
    const organizationId = organizationIdForTeam(team.id)
    const model = buildPlayerDevelopmentModel(world, playerId)!

    for (const row of model.scoutPotential.rows) {
      const domain = row.id.replace('potential:', '')
      const evaluation = getOrganizationRatingEvaluation({
        organizationId,
        playerId,
        dimension: row.id,
        knowledge: world.organizationKnowledge,
        currentDate: world.currentDate,
        publicPosition: player.basketball.primaryPosition,
      })
      expect(evaluation.mode).not.toBe('EXACT')
      expect(row.evaluationLabel).toBe(formatRatingEvaluation(evaluation))
      expect(row.evaluationLabel).not.toBe(String(player.development.ceilings[domain as keyof typeof player.development.ceilings]))
    }
  })

  it('aggregates season stimulus by NG rating categories after training', () => {
    const world = skipToTrainableDate(createNewGame())
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const trained = executeTeamTraining(world, teamId)
    const model = buildPlayerDevelopmentModel(trained, playerId)!

    expect(model.seasonStimulus.totalStimulus).toBeGreaterThan(0)
    expect(model.seasonStimulus.categories.length).toBeGreaterThan(0)
    const categorySum = model.seasonStimulus.categories.reduce((sum, row) => sum + row.stimulusTotal, 0)
    expect(categorySum).toBeCloseTo(model.seasonStimulus.totalStimulus, 5)
    expect(model.seasonStimulus.topRatings.length).toBeGreaterThan(0)
    expect(model.defaultSelectedItemId).not.toBeNull()
  })

  it('transforms inspector detail for selected stimulus and potential rows', () => {
    const world = skipToTrainableDate(createNewGame())
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const trained = executeTeamTraining(world, teamId)
    const model = buildPlayerDevelopmentModel(trained, playerId)!
    const categoryId = model.seasonStimulus.categories.find((row) => row.stimulusTotal > 0)!.id
    const ratingId = model.seasonStimulus.topRatings[0]!.id
    const potentialId = model.scoutPotential.rows[0]!.id

    expect(findDevelopmentInspectorDetail(model, categoryId)?.kind).toBe('stimulus-category')
    expect(findDevelopmentInspectorDetail(model, ratingId)?.kind).toBe('stimulus-rating')
    expect(findDevelopmentInspectorDetail(model, potentialId)?.kind).toBe('scout-potential')
    expect(findDevelopmentInspectorDetail(model, null)).toBeUndefined()
  })

  it('connects development into the player workspace model', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const workspace = buildPlayerWorkspaceModel(world, playerId)

    expect(workspace?.development.longitudinal.message).toContain('not currently tracked')
    expect(workspace?.development.contextBand.developmentStageNote).toContain('not used by the current offseason')
  })

  it('returns undefined for missing players without fabricating data', () => {
    expect(buildPlayerDevelopmentModel(createNewGame(), 'missing-player' as PlayerId)).toBeUndefined()
  })
})
