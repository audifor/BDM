import { describe, expect, it } from 'vitest'

import { completeMatch, createNewGame, prepareUserMatch } from '@/app/game'
import { organizationIdForTeam } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import { updateGameWorld } from '@/domain/world'

import {
  buildPlayerScoutingModel,
  SCOUTING_KNOWLEDGE_AREAS,
} from './buildPlayerScoutingModel'
import { defaultPlayerIdForNg } from './buildPlayerWorkspaceModel'

function withScoutingKnowledge(
  world: ReturnType<typeof createNewGame>,
  playerId: string,
  dimensions: Record<string, { estimate: number; uncertainty: number; coverage?: number }>,
) {
  const team = getUserTeam(world)!
  const organizationId = organizationIdForTeam(team.id)
  return updateGameWorld(world, {
    organizationKnowledge: [
      ...world.organizationKnowledge.filter(
        (entry) => entry.subjectPlayerId !== (playerId as never),
      ),
      {
        organizationId,
        subjectPlayerId: playerId as never,
        dimensions: Object.fromEntries(
          Object.entries(dimensions).map(([dimension, finding]) => [
            dimension,
            {
              coverage: finding.coverage ?? 1,
              confidence: 0.9,
              assessedAt: world.currentDate,
              provenance: 'scoutReport' as const,
              estimate: finding.estimate,
              uncertainty: finding.uncertainty,
            },
          ]),
        ),
      },
    ],
  })
}

describe('buildPlayerScoutingModel', () => {
  it('declares the six knowledge areas, including the ones the model cannot fill', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerScoutingModel(world, playerId)

    expect(model.knowledgeAreas.map((area) => area.id)).toEqual([
      'attributes',
      'physical',
      'mental',
      'personality',
      'medical',
      'potential',
    ])
    expect(SCOUTING_KNOWLEDGE_AREAS.map((area) => area.label)).toEqual([
      'Attributes',
      'Physical',
      'Mental',
      'Personality',
      'Medical',
      'Potential',
    ])
    // Areas with no backing dimension say so instead of drawing a zero bar.
    for (const area of model.knowledgeAreas.filter((entry) => entry.status === 'unavailable')) {
      expect(area.coverageLabel.length).toBeGreaterThan(0)
      expect(area.note.length).toBeGreaterThan(0)
    }
    const mental = model.knowledgeAreas.find((area) => area.id === 'mental')!
    expect(mental.status).toBe('unavailable')
    expect(mental.note).toContain('no dimension')
  })

  it('reports nothing at all when the player has not been scouted', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerScoutingModel(world, playerId)

    expect(model.status).toBe('unavailable')
    expect(model.unavailableLabel).toContain('No scouting evaluation exists')
    expect(model.attributes).toEqual([])
    expect(model.consensusSummary).toContain('No report has been filed')
    expect(model.statusPanel).not.toBeNull()
    expect(model.statusPanel!.lastScoutedLabel).toBeNull()
    expect(model.statusPanel!.observerLabel).toBe('No scout assigned')
  })

  it('reports the scouted ranges the engine returns and never a hidden value', () => {
    const base = createNewGame()
    const playerId = defaultPlayerIdForNg(base)!
    const world = withScoutingKnowledge(base, playerId, {
      shooting: { estimate: 78, uncertainty: 4 },
      physical: { estimate: 66, uncertainty: 6 },
    })
    const model = buildPlayerScoutingModel(world, playerId)

    expect(model.status).toBe('available')
    expect(model.statusPanel!.knowledgeLabel).toMatch(/^\d+%$/)
    const shooting = model.attributes.find((row) => row.id === 'shooting')!
    // The engine widens the range by its own uncertainty model, so assert the structure: a range
    // whose bounds contain the reported estimate, never a hidden exact value.
    const bounds = shooting.rangeLabel.split('-').map(Number)
    expect(bounds).toHaveLength(2)
    expect(bounds[0]!).toBeLessThanOrEqual(bounds[1]!)
    expect(shooting.estimateLabel).toContain('78')
    expect(bounds[0]!).toBeLessThanOrEqual(78)
    expect(bounds[1]!).toBeGreaterThanOrEqual(78)
    expect(shooting.certaintyNote).toBe('Scouting range')
    // Every reported attribute is one the organization actually evaluated.
    expect(model.attributes.every((row) => row.rangeLabel !== '?')).toBe(true)
    expect(model.knowledgeAreas.find((area) => area.id === 'physical')!.status).toBe('available')
  })

  it('lists the tracked games as the observed record, with real box scores', () => {
    const world = createNewGame()
    const simulation = prepareUserMatch(world)
    const updated = completeMatch(world, simulation)
    const playerId = simulation.squads.home[0]!
    const model = buildPlayerScoutingModel(updated, playerId)

    expect(model.observedGames).toHaveLength(1)
    const game = model.observedGames[0]!
    const line = updated.matchStatLogsByGameId[simulation.gameId]!.playerLines.find(
      (entry) => entry.playerId === playerId,
    )!
    expect(game.points).toBe(line.stats.points)
    expect(game.rebounds).toBe(line.stats.rebounds)
    expect(game.minutes).toBe(Math.round(line.stats.secondsPlayed / 60))
  })

  it('declares the scouting blocks it cannot produce', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const gaps = buildPlayerScoutingModel(world, playerId).gaps

    expect(gaps.map((gap) => gap.label)).toEqual([
      'Scout notes',
      'Projected roles',
      'Potential outcome ranges',
      'Personality & character',
      'Fit with our team',
      'Scouting actions',
      'Notes on observed games',
    ])
    for (const gap of gaps) {
      expect(gap.reason.length).toBeGreaterThan(0)
    }
  })

  it('states the uncertainty of every scouted dimension as a range with a knowledge state', () => {
    const base = createNewGame()
    const playerId = defaultPlayerIdForNg(base)!
    const world = withScoutingKnowledge(base, playerId, {
      shooting: { estimate: 78, uncertainty: 4 },
      physical: { estimate: 66, uncertainty: 6 },
    })
    const model = buildPlayerScoutingModel(world, playerId)

    expect(model.attributes.length).toBeGreaterThan(0)
    for (const row of model.attributes) {
      // A range, never a bare true value, and the point sits inside the band.
      expect(row.low).not.toBeNull()
      expect(row.high).not.toBeNull()
      expect(row.estimate).not.toBeNull()
      expect(row.low!).toBeLessThanOrEqual(row.estimate!)
      expect(row.high!).toBeGreaterThanOrEqual(row.estimate!)
      expect(row.low!).toBeGreaterThanOrEqual(1)
      expect(row.high!).toBeLessThanOrEqual(100)
      expect(['known', 'estimated', 'low']).toContain(row.knowledgeState)
    }

    const shooting = model.attributes.find((row) => row.id === 'shooting')!
    const physical = model.attributes.find((row) => row.id === 'physical')!
    // The dimension the club knows better must not be stated more loosely than the other one.
    expect(shooting.high! - shooting.low!).toBeLessThanOrEqual(physical.high! - physical.low!)
  })

  it('never turns an unknown reading into a value', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerScoutingModel(world, playerId)

    for (const trait of model.personalityTraits) {
      expect(trait.knowledgeState).toBe('unknown')
      expect(trait.assessmentLabel).toBe('?')
    }
    for (const row of model.teamFit) {
      expect(row.knowledgeState).toBe('unknown')
      expect(row.statusLabel).toBe('Unknown')
    }
    expect(model.overallFitLabel).toBe('Unknown')
    expect(model.projectedRoles).toEqual([])

    // With nothing scouted, the outcome bands state the unknown instead of a number.
    for (const outcome of model.potentialOutcomes) {
      expect(outcome.knowledgeState).toBe('unknown')
      expect(outcome.rangeLabel).toBe('?')
    }
  })

  it('builds the potential bands from scouted ranges and never reveals a ceiling', () => {
    const base = createNewGame()
    const playerId = defaultPlayerIdForNg(base)!
    const world = withScoutingKnowledge(base, playerId, {
      'potential:shooting': { estimate: 70, uncertainty: 6 },
      'potential:creation': { estimate: 82, uncertainty: 4 },
    })
    const model = buildPlayerScoutingModel(world, playerId)
    const player = world.players[playerId as never]!
    const serialized = JSON.stringify(model)

    expect(model.potentialOutcomes.map((outcome) => outcome.id)).toEqual(['low', 'expected', 'high'])
    for (const outcome of model.potentialOutcomes) {
      expect(outcome.knowledgeState).not.toBe('unknown')
      expect(outcome.rangeLabel).not.toBe('?')
    }

    // The hidden ceilings are never part of what the page can show.
    for (const ceiling of Object.values(player.development.ceilings)) {
      expect(serialized).not.toContain(`"${String(ceiling)}"`)
    }
  })

  it('ties the filing timeline to the reports actually on file', () => {
    const world = createNewGame()
    const playerId = defaultPlayerIdForNg(world)!
    const model = buildPlayerScoutingModel(world, playerId)

    expect(model.noteTimeline).toHaveLength(0)
    expect(model.actionsNote).toContain('not actions this workspace can perform')
  })
})
