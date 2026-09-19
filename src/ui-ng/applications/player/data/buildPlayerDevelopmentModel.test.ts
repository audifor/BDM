import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { addDays, createGameDate } from '@/domain/date'
import { updateGameWorld } from '@/domain/world'
import { seasonIdFromString } from '@/domain/ids'
import type { PlayerId } from '@/domain/ids'
import { organizationIdForTeam } from '@/domain/ids'
import {
  formatRatingEvaluation,
  getOrganizationRatingEvaluation,
} from '@/domain/intelligence/OrganizationPlayerEvaluation'
import { DEVELOPMENT_DOMAINS } from '@/domain/player/PlayerDevelopmentProfile'
import { applyOffseasonDevelopment } from '@/engine/development'
import { getUserTeam } from '@/engine/calendar'
import { executeTeamTraining } from '@/engine/training/TrainingEngine'

import {
  buildPlayerDevelopmentModel,
  findDevelopmentInspectorDetail,
} from './buildPlayerDevelopmentModel'
import { aggregateCategoryValue, RADAR_CATEGORY_ORDER } from './ratingCatalog'
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
    // The history exists as a concept now, so the page reports the missing transition instead of
    // claiming progression is not tracked at all.
    expect(model!.longitudinal.status).toBe('unavailable')
    expect(model!.longitudinal.message).toContain('No offseason transition has been recorded yet')
    expect(model!.longitudinal.note).toContain('reconstructed from the recorded offseason movement')
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

    expect(workspace?.development.longitudinal.status).toBe('unavailable')
    expect(workspace?.development.contextBand.developmentStageNote).toContain('not used by the current offseason')
  })

  it('draws the career curve from the rating history once a transition exists', () => {
    const base = createNewGame()
    const playerId = defaultPlayerIdForNg(base)!
    // Mirrors the real transition: development runs, then the world moves into the next season.
    const advanced = updateGameWorld(
      applyOffseasonDevelopment(base, {
        fromSeasonId: seasonIdFromString('generated-season-0001'),
        toSeasonId: seasonIdFromString('generated-season-0003'),
        targetDate: createGameDate(2033, 10, 1),
      }).world,
      { currentSeasonId: seasonIdFromString('generated-season-0002') },
    )
    const model = buildPlayerDevelopmentModel(advanced, playerId)!

    expect(model.longitudinal.status).toBe('available')
    expect(model.longitudinal.series.length).toBeGreaterThan(0)
    expect(model.longitudinal.series.length).toBeLessThanOrEqual(4)
    for (const series of model.longitudinal.series) {
      expect(series.points.length).toBeGreaterThanOrEqual(2)
      const player = advanced.players[playerId]!
      expect(series.points[series.points.length - 1]).toBe(player.basketball.ratings[series.id])
      expect(series.delta).toBe(series.points[series.points.length - 1]! - series.points[0]!)
    }
    expect(model.longitudinal.movers.length).toBeGreaterThan(0)
    expect(model.longitudinal.events.some((event) => event.label === 'Offseason development')).toBe(true)
  })

  it('maps the lifecycle rail to the domain stages and marks exactly one as current', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerDevelopmentModel(world, playerId)!

    expect(model.lifecycle.stages.map((stage) => stage.id)).toEqual([
      'early',
      'developing',
      'prime',
      'declining',
    ])
    expect(model.lifecycle.stages.filter((stage) => stage.isCurrent)).toHaveLength(1)
    expect(model.lifecycle.currentLabel).toBe(model.contextBand.developmentStageLabel)
    // Potential is a scouting range or an honest gap, never a hidden ceiling.
    expect(model.lifecycle.potentialLabel.length).toBeGreaterThan(0)
  })

  it('reports category development with real values and recorded movement', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const player = world.players[playerId]!
    const model = buildPlayerDevelopmentModel(world, playerId)!

    expect(model.categoryDevelopment).toHaveLength(RADAR_CATEGORY_ORDER.length)
    for (const row of model.categoryDevelopment) {
      expect(row.current).toBe(aggregateCategoryValue(row.id, player.basketball.ratings))
      expect(row.trend).toBe(0)
    }
    expect(model.drivers.length).toBeGreaterThan(0)
    for (const driver of model.drivers) {
      expect(driver.valueLabel.length).toBeGreaterThan(0)
    }
    // The projection is now derived from the reported scouting ranges, so it is no longer a gap.
    expect(model.gaps.map((gap) => gap.label)).not.toContain('Scouting projection ranges')
    expect(model.gaps.map((gap) => gap.label)).toContain('Coach assessment')
  })

  it('rebuilds one curve per category with a season column per recorded transition', () => {
    const base = createNewGame()
    const playerId = defaultPlayerIdForNg(base)!
    const world = updateGameWorld(
      applyOffseasonDevelopment(base, {
        fromSeasonId: seasonIdFromString('generated-season-0001'),
        toSeasonId: seasonIdFromString('generated-season-0003'),
        targetDate: createGameDate(2033, 10, 1),
      }).world,
      { currentSeasonId: seasonIdFromString('generated-season-0002') },
    )
    const model = buildPlayerDevelopmentModel(world, playerId)!
    const player = world.players[playerId]!

    expect(model.categoryCurve).toHaveLength(RADAR_CATEGORY_ORDER.length)
    const columns = Math.max(...model.categoryCurve.map((entry) => entry.points.length))
    expect(columns).toBeGreaterThanOrEqual(2)
    for (const series of model.categoryCurve) {
      expect(series.points).toHaveLength(columns)
      expect(series.delta).toBe(series.points[series.points.length - 1]! - series.points[0]!)
      // The last point of every category is the value currently in the save.
      expect(series.points[series.points.length - 1]).toBe(
        aggregateCategoryValue(series.id, player.basketball.ratings),
      )
      // Potential is a reported scouting bound when knowledge exists, never a hidden ceiling.
      expect([null, expect.any(Number)]).toContain(
        model.categoryDevelopment.find((row) => row.id === series.id)!.potential,
      )
    }
    expect(model.markers.length).toBeGreaterThan(0)
    for (const marker of model.markers) {
      expect(['injury', 'transition']).toContain(marker.kind)
      expect(marker.columnIndex).toBeLessThan(columns)
    }
    expect(model.longitudinal.movers.length).toBeGreaterThan(0)
    expect(model.detailByCategory.shooting.rateLabel).not.toBe('No transition recorded')
    // The projection reads the reported scouting ranges, or says it has none: never invents one.
    expect(model.projection.note.length).toBeGreaterThan(0)
    expect(model.projection.status === 'available' ? 3 : 0).toBe(model.projection.outcomes.length)
    expect(model.trainingEffect.note).toContain('projection')
  })

  it('rebuilds the category curve honestly when no transition exists yet', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerDevelopmentModel(world, playerId)!

    expect(model.categoryCurve).toHaveLength(RADAR_CATEGORY_ORDER.length)
    expect(model.markers).toEqual([])
    expect(model.overview.nextEvaluationLabel.length).toBeGreaterThan(0)
  })

  it('reads potential and projection from reported scouting ranges only', () => {
    const base = createNewGame()
    const playerId = defaultPlayerIdForNg(base)!
    const team = getUserTeam(base)!
    const world = updateGameWorld(base, {
      organizationKnowledge: [
        ...base.organizationKnowledge.filter((entry) => entry.subjectPlayerId !== (playerId as never)),
        {
          organizationId: organizationIdForTeam(team.id),
          subjectPlayerId: playerId as never,
          dimensions: Object.fromEntries(
            ['potential:shooting', 'potential:defense', 'potential:physical', 'potential:mental'].map(
              (dimension) => [
                dimension,
                {
                  coverage: 1,
                  confidence: 0.9,
                  assessedAt: base.currentDate,
                  provenance: 'scoutReport' as const,
                  estimate: 70,
                  uncertainty: 8,
                },
              ],
            ),
          ),
        },
      ],
    })
    const model = buildPlayerDevelopmentModel(world, playerId)!

    expect(model.categoryDevelopment.find((row) => row.id === 'shooting')!.potential).toBe(78)
    expect(model.categoryDevelopment.find((row) => row.id === 'playmaking')!.potential).toBeNull()
    expect(model.projection.status).toBe('available')
    expect(model.projection.outcomes.map((outcome) => outcome.id)).toEqual(['low', 'expected', 'high'])
    // The bands stay inside the reported range and its note says where they come from.
    for (const outcome of model.projection.outcomes) {
      const [low, high] = outcome.rangeLabel.split('-').map(Number)
      expect(low).toBeGreaterThanOrEqual(62)
      expect(high).toBeLessThanOrEqual(78)
      expect(low).toBeLessThanOrEqual(high)
    }
    expect(model.projection.note).toContain('reported ranges')
  })

  it('returns undefined for missing players without fabricating data', () => {
    expect(buildPlayerDevelopmentModel(createNewGame(), 'missing-player' as PlayerId)).toBeUndefined()
  })
})
