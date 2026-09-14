import { describe, expect, it } from 'vitest'

import type { Game } from '@/domain/game'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'

import type { WorldDbCompetitionExecutionV1 } from './WorldDbCompletedGameRealization'
import { instantiateWorldDbCompetitionV1 } from './WorldDbCompetitionInstance'
import { createWorldDbCompetitionRulesV1 } from './WorldDbCompetitionRules'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { createWorldDbPhysicalGamePlanV1, materializeWorldDbPhysicalGameV1 } from './WorldDbPhysicalGamePlan'

function bundle(seasonId: string, homeTeamId = 'team:a', awayTeamId = 'team:b'): { bundle: WorldDbCompetitionBundleV1; participants: readonly string[] } {
  return {
    participants: [homeTeamId, awayTeamId],
    bundle: {
      schemaVersion: 1,
      source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
      competitionSeason: {
        competitionSeasonId: seasonId,
        competitionId: `competition:${seasonId}`,
        seasonId: 'season:2026-27',
        editionNumber: null,
      },
      entries: [],
      structureNodes: [
        { competitionStructureNodeId: `${seasonId}:stage`, nodeType: 'STAGE', name: 'Stage', sequenceNo: 1 },
      ],
      structurePositions: [],
      structureEdges: [],
      structureEntryAssignments: [],
      fixtures: [],
      fixtureSides: [],
      rulePayloads: {
        pairing: [
          { id: `${seasonId}:pairing`, scopeStructureNodeId: `${seasonId}:stage`, type: 'ROUND_ROBIN_PAIRING', payload: { meetings_per_pair: 1 } },
        ],
      },
    },
  }
}

function execution(seasonId: string, homeTeamId = 'team:a', awayTeamId = 'team:b'): WorldDbCompetitionExecutionV1 {
  const value = bundle(seasonId, homeTeamId, awayTeamId)
  const runtime = createWorldDbCompetitionRuntimeV1(value.bundle)
  const rules = createWorldDbCompetitionRulesV1(value.bundle)
  return {
    runtime,
    rules,
    instance: instantiateWorldDbCompetitionV1(runtime, rules, { participantTeamIds: value.participants }),
  }
}

describe('World DB physical Game plan', () => {
  it('coalesces two competition fixtures into one physical Game and keeps both bindings', () => {
    const league = execution('edition:league')
    const cup = execution('edition:cup')
    const plan = createWorldDbPhysicalGamePlanV1({
      'edition:league': league,
      'edition:cup': cup,
    }, [
      { competitionSeasonId: 'edition:league', instanceFixtureId: league.instance.fixtures[0]!.instanceFixtureId },
      { competitionSeasonId: 'edition:cup', instanceFixtureId: cup.instance.fixtures[0]!.instanceFixtureId },
    ], 'edition:league')

    expect(plan.primaryCompetitionId).toBe('competition:edition:league')
    expect(plan.homeTeamId).toBe('team:a')
    expect(plan.awayTeamId).toBe('team:b')

    const materialized = materializeWorldDbPhysicalGameV1(plan, {
      gameId: 'game:shared' as Game['id'],
      date: '2026-11-01' as Game['date'],
      stakes: 'important',
    })
    expect(materialized.game).toMatchObject({
      id: 'game:shared',
      competitionId: 'competition:edition:league',
      seasonId: 'season:2026-27',
      homeTeamId: 'team:a',
      awayTeamId: 'team:b',
      status: 'scheduled',
      stakes: 'important',
    })
    expect(materialized.bindings).toEqual([
      { gameId: 'game:shared', competitionSeasonId: 'edition:league', instanceFixtureId: league.instance.fixtures[0]!.instanceFixtureId },
      { gameId: 'game:shared', competitionSeasonId: 'edition:cup', instanceFixtureId: cup.instance.fixtures[0]!.instanceFixtureId },
    ])
  })

  it('requires the legacy primary competition to be one of the realizations', () => {
    const league = execution('edition:league')
    expect(() => createWorldDbPhysicalGamePlanV1({ 'edition:league': league }, [
      { competitionSeasonId: 'edition:league', instanceFixtureId: league.instance.fixtures[0]!.instanceFixtureId },
    ], 'edition:missing')).toThrow('is not represented by the physical Game plan')
  })

  it('rejects coalescing fixtures whose physical home/away teams disagree', () => {
    const league = execution('edition:league', 'team:a', 'team:b')
    const cup = execution('edition:cup', 'team:b', 'team:a')
    expect(() => createWorldDbPhysicalGamePlanV1({
      'edition:league': league,
      'edition:cup': cup,
    }, [
      { competitionSeasonId: 'edition:league', instanceFixtureId: league.instance.fixtures[0]!.instanceFixtureId },
      { competitionSeasonId: 'edition:cup', instanceFixtureId: cup.instance.fixtures[0]!.instanceFixtureId },
    ], 'edition:league')).toThrow('Physical Game realizations disagree on teams')
  })

  it('does not guess a date or stakes before the calendar layer materializes the Game', () => {
    const league = execution('edition:league')
    const plan = createWorldDbPhysicalGamePlanV1({ 'edition:league': league }, [
      { competitionSeasonId: 'edition:league', instanceFixtureId: league.instance.fixtures[0]!.instanceFixtureId },
    ], 'edition:league')
    expect(plan).not.toHaveProperty('date')
    expect(plan).not.toHaveProperty('stakes')
  })
})
