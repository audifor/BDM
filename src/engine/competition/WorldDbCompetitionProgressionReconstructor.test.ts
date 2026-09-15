import { describe, expect, it } from 'vitest'

import { parseGameDate } from '@/domain/date'
import { createGame, type CompletedGame } from '@/domain/game'
import {
  competitionIdFromString,
  gameIdFromString,
  seasonIdFromString,
  teamIdFromString,
} from '@/domain/ids'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { reconstructWorldDbCompetitionProgressionV1 } from './WorldDbCompetitionProgressionReconstructor'
import {
  planWorldDbPhysicalGamesV1,
  type WorldDbCompetitionPlanningContextV1,
  type WorldDbPlannedPhysicalGameV1,
} from './WorldDbPhysicalGamePlanner'

const AS_OF = '2026-09-15T12:00:00Z'

function context(): WorldDbCompetitionPlanningContextV1 {
  const bundle: WorldDbCompetitionBundleV1 = {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:test',
      competitionId: 'competition:test',
      seasonId: 'season:test',
      editionNumber: null,
    },
    entries: [
      { competitionSeasonEntryId: 'entry:a', teamId: 'team:a' },
      { competitionSeasonEntryId: 'entry:b', teamId: 'team:b' },
      { competitionSeasonEntryId: 'entry:c', teamId: 'team:c' },
      { competitionSeasonEntryId: 'entry:d', teamId: 'team:d' },
    ],
    structureNodes: [
      { competitionStructureNodeId: 'node:qf', nodeType: 'ROUND', name: 'Quarterfinal', sequenceNo: 1 },
      { competitionStructureNodeId: 'node:sf', nodeType: 'ROUND', name: 'Semifinal', sequenceNo: 2 },
      { competitionStructureNodeId: 'node:final', nodeType: 'ROUND', name: 'Final', sequenceNo: 3 },
    ],
    structurePositions: [
      {
        competitionStructurePositionId: 'position:sf:winner-qf',
        competitionStructureNodeId: 'node:sf',
        positionType: 'BRACKET_SLOT',
        positionOrder: 1,
        label: null,
      },
      {
        competitionStructurePositionId: 'position:final:winner-sf',
        competitionStructureNodeId: 'node:final',
        positionType: 'BRACKET_SLOT',
        positionOrder: 1,
        label: null,
      },
    ],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [
      { competitionFixtureId: 'fixture:qf', structureNodeId: 'node:qf', matchdayId: null, fixtureOrder: 1 },
      { competitionFixtureId: 'fixture:sf', structureNodeId: 'node:sf', matchdayId: null, fixtureOrder: 2 },
      { competitionFixtureId: 'fixture:final', structureNodeId: 'node:final', matchdayId: null, fixtureOrder: 3 },
    ],
    fixtureSides: [
      { competitionFixtureSideId: 'side:qf:home', competitionFixtureId: 'fixture:qf', sideRole: 'HOME', competitionSeasonEntryId: 'entry:a', competitionSeasonSlotId: null, sourceStructurePositionId: null },
      { competitionFixtureSideId: 'side:qf:away', competitionFixtureId: 'fixture:qf', sideRole: 'AWAY', competitionSeasonEntryId: 'entry:b', competitionSeasonSlotId: null, sourceStructurePositionId: null },
      { competitionFixtureSideId: 'side:sf:home', competitionFixtureId: 'fixture:sf', sideRole: 'HOME', competitionSeasonEntryId: null, competitionSeasonSlotId: null, sourceStructurePositionId: 'position:sf:winner-qf' },
      { competitionFixtureSideId: 'side:sf:away', competitionFixtureId: 'fixture:sf', sideRole: 'AWAY', competitionSeasonEntryId: 'entry:c', competitionSeasonSlotId: null, sourceStructurePositionId: null },
      { competitionFixtureSideId: 'side:final:home', competitionFixtureId: 'fixture:final', sideRole: 'HOME', competitionSeasonEntryId: null, competitionSeasonSlotId: null, sourceStructurePositionId: 'position:final:winner-sf' },
      { competitionFixtureSideId: 'side:final:away', competitionFixtureId: 'fixture:final', sideRole: 'AWAY', competitionSeasonEntryId: 'entry:d', competitionSeasonSlotId: null, sourceStructurePositionId: null },
    ],
    scheduleSlots: [
      { competitionScheduleSlotId: 'slot:qf', scheduleBlockId: null, scheduleSessionId: null, slotOrder: 1 },
      { competitionScheduleSlotId: 'slot:sf', scheduleBlockId: null, scheduleSessionId: null, slotOrder: 2 },
      { competitionScheduleSlotId: 'slot:final', scheduleBlockId: null, scheduleSessionId: null, slotOrder: 3 },
    ],
    scheduleSlotTimings: [
      { competitionScheduleSlotTimingHistoryId: 'timing:qf', competitionScheduleSlotId: 'slot:qf', timingState: 'CONFIRMED', localDate: '2026-09-10', localTime: null, timeZone: null, validFrom: null, validTo: null },
      { competitionScheduleSlotTimingHistoryId: 'timing:sf', competitionScheduleSlotId: 'slot:sf', timingState: 'CONFIRMED', localDate: '2026-09-11', localTime: null, timeZone: null, validFrom: null, validTo: null },
      { competitionScheduleSlotTimingHistoryId: 'timing:final', competitionScheduleSlotId: 'slot:final', timingState: 'CONFIRMED', localDate: '2026-09-12', localTime: null, timeZone: null, validFrom: null, validTo: null },
    ],
    fixtureScheduleAllocations: [
      { competitionFixtureScheduleAllocationId: 'allocation:qf', competitionFixtureId: 'fixture:qf', competitionScheduleSlotId: 'slot:qf', status: 'ACTIVE', validFrom: null, validTo: null },
      { competitionFixtureScheduleAllocationId: 'allocation:sf', competitionFixtureId: 'fixture:sf', competitionScheduleSlotId: 'slot:sf', status: 'ACTIVE', validFrom: null, validTo: null },
      { competitionFixtureScheduleAllocationId: 'allocation:final', competitionFixtureId: 'fixture:final', competitionScheduleSlotId: 'slot:final', status: 'ACTIVE', validFrom: null, validTo: null },
    ],
    rulePayloads: {
      progressionRules: [
        { id: 'rule:qf-winner', scopeStructureNodeId: 'node:qf', type: 'GAME_WINNER' },
        { id: 'rule:sf-winner', scopeStructureNodeId: 'node:sf', type: 'GAME_WINNER' },
      ],
      progressionDestinations: [
        {
          id: 'destination:qf-winner',
          ruleId: 'rule:qf-winner',
          payload: {
            competition_structure_node_id: 'node:sf',
            competition_structure_position_id: 'position:sf:winner-qf',
          },
        },
        {
          id: 'destination:sf-winner',
          ruleId: 'rule:sf-winner',
          payload: {
            competition_structure_node_id: 'node:final',
            competition_structure_position_id: 'position:final:winner-sf',
          },
        },
      ],
    },
  }
  return { bundle }
}

function completed(planned: WorldDbPlannedPhysicalGameV1, homeScore = 90, awayScore = 80): CompletedGame {
  if (planned.localDate === null) throw new Error('Test planned Game must have a date')
  const game = createGame({
    id: gameIdFromString(planned.gameId),
    seasonId: seasonIdFromString(planned.seasonId),
    competitionId: competitionIdFromString(planned.competitionId),
    date: parseGameDate(planned.localDate),
    homeTeamId: teamIdFromString(planned.homeTeamId),
    awayTeamId: teamIdFromString(planned.awayTeamId),
    status: 'completed',
    result: { homeScore, awayScore },
  })
  if (game.status !== 'completed') throw new Error('Test Game must be completed')
  return game
}

function gameForFixture(
  games: readonly WorldDbPlannedPhysicalGameV1[],
  fixtureId: string,
): WorldDbPlannedPhysicalGameV1 {
  const game = games.find((candidate) => candidate.competitionFixtureIds.includes(fixtureId))
  if (game === undefined) throw new Error(`Planned Game not found for ${fixtureId}`)
  return game
}

describe('World DB competition progression reconstruction', () => {
  it('rebuilds multiple completed rounds from the original unresolved context until the plan stabilizes', () => {
    const input = context()
    const initialPlan = planWorldDbPhysicalGamesV1([input], AS_OF)
    expect(initialPlan.games.map((game) => game.competitionFixtureIds)).toEqual([['fixture:qf']])

    const qfGame = completed(gameForFixture(initialPlan.games, 'fixture:qf'))
    const afterQuarterfinal = reconstructWorldDbCompetitionProgressionV1([input], [qfGame], AS_OF)
    expect(afterQuarterfinal.contexts[0]?.resolvedEntryIdByStructurePositionId).toEqual({
      'position:sf:winner-qf': 'entry:a',
    })

    const sfGame = completed(gameForFixture(afterQuarterfinal.plan.games, 'fixture:sf'))

    // Simulate loading a Save V4: start again from the original B04 context with no persisted
    // bindings or resolved positions, but with both completed physical Games persisted in GameWorld.
    const reloaded = reconstructWorldDbCompetitionProgressionV1([input], [qfGame, sfGame], AS_OF)
    expect(reloaded.contexts[0]?.resolvedEntryIdByStructurePositionId).toEqual({
      'position:sf:winner-qf': 'entry:a',
      'position:final:winner-sf': 'entry:a',
    })

    expect(gameForFixture(reloaded.plan.games, 'fixture:final')).toMatchObject({
      homeTeamId: 'team:a',
      awayTeamId: 'team:d',
    })
  })
})
