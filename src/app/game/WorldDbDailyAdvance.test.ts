import { describe, expect, it } from 'vitest'
import { addDays } from '@/domain/date'
import { gameIdFromString } from '@/domain/ids'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'

import { createNewGame } from './createNewGame'
import { advanceWorldDbGameDayV1 } from './WorldDbDailyAdvance'

function dailyFixtureContext(): {
  readonly world: ReturnType<typeof createNewGame>
  readonly context: WorldDbCompetitionPlanningContextV1
} {
  const baseWorld = createNewGame()
  const season = Object.values(baseWorld.seasons)[0]!
  const participantTeamIds = season.participantTeamIds ?? Object.keys(baseWorld.teams)
  const [homeTeamId, awayTeamId] = participantTeamIds
  if (homeTeamId === undefined || awayTeamId === undefined) {
    throw new Error('Test universe requires two teams')
  }

  const games = Object.fromEntries(
    Object.entries(baseWorld.games).filter(([, game]) =>
      game.date !== baseWorld.currentDate
      || (
        game.homeTeamId !== homeTeamId
        && game.awayTeamId !== homeTeamId
        && game.homeTeamId !== awayTeamId
        && game.awayTeamId !== awayTeamId
      ),
    ),
  ) as typeof baseWorld.games
  const world = { ...baseWorld, games: Object.freeze(games) }

  const fixtureId = 'fixture:daily:1'
  const nodeId = 'node:daily:regular'
  const slotId = 'slot:daily:1'
  const bundle: WorldDbCompetitionBundleV1 = {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'competition-season:daily',
      competitionId: season.competitionId,
      seasonId: season.id,
      editionNumber: null,
    },
    entries: [
      { competitionSeasonEntryId: 'entry:daily:home', teamId: homeTeamId },
      { competitionSeasonEntryId: 'entry:daily:away', teamId: awayTeamId },
    ],
    structureNodes: [
      { competitionStructureNodeId: nodeId, nodeType: 'STAGE', name: null, sequenceNo: 1 },
    ],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [
      { competitionFixtureId: fixtureId, structureNodeId: nodeId, matchdayId: null, fixtureOrder: 1 },
    ],
    fixtureSides: [
      {
        competitionFixtureSideId: 'side:daily:home',
        competitionFixtureId: fixtureId,
        sideRole: 'HOME',
        competitionSeasonEntryId: 'entry:daily:home',
        competitionSeasonSlotId: null,
        sourceStructurePositionId: null,
      },
      {
        competitionFixtureSideId: 'side:daily:away',
        competitionFixtureId: fixtureId,
        sideRole: 'AWAY',
        competitionSeasonEntryId: 'entry:daily:away',
        competitionSeasonSlotId: null,
        sourceStructurePositionId: null,
      },
    ],
    scheduleSlots: [
      { competitionScheduleSlotId: slotId, scheduleBlockId: null, scheduleSessionId: null, slotOrder: 1 },
    ],
    scheduleSlotTimings: [
      {
        competitionScheduleSlotTimingHistoryId: 'timing:daily:1',
        competitionScheduleSlotId: slotId,
        timingState: 'CONFIRMED',
        localDate: world.currentDate,
        localTime: null,
        timeZone: null,
        validFrom: null,
        validTo: null,
      },
    ],
    fixtureScheduleAllocations: [
      {
        competitionFixtureScheduleAllocationId: 'allocation:daily:1',
        competitionFixtureId: fixtureId,
        competitionScheduleSlotId: slotId,
        status: 'ACTIVE',
        validFrom: null,
        validTo: null,
      },
    ],
    rulePayloads: {},
  }

  return { world, context: { bundle } }
}

describe('World DB daily advance', () => {
  it('rejects missing explicit as-of timestamps', () => {
    const world = createNewGame()

    expect(() => advanceWorldDbGameDayV1(world, [], { beforeAsOf: '', afterAsOf: '2030-01-02T00:00:00Z' }))
      .toThrow('World DB beforeAsOf must be a non-empty string')
    expect(() => advanceWorldDbGameDayV1(world, [], { beforeAsOf: '2030-01-01T00:00:00Z', afterAsOf: '   ' }))
      .toThrow('World DB afterAsOf must be a non-empty string')
  })

  it('materializes before simulation and rematerializes completed results afterwards', () => {
    const { world, context } = dailyFixtureContext()
    const nextDate = addDays(world.currentDate, 1)
    const result = advanceWorldDbGameDayV1(world, [context], {
      beforeAsOf: `${world.currentDate}T00:00:00Z`,
      afterAsOf: `${nextDate}T00:00:00Z`,
    })

    expect(result.before.plan.games).toHaveLength(1)
    const plannedGameId = result.before.plan.games[0]!.gameId
    const plannedGameKey = gameIdFromString(plannedGameId)
    expect(result.before.world.games[plannedGameKey]?.status).toBe('scheduled')
    expect(result.world.games[plannedGameKey]?.status).toBe('completed')
    expect(result.world.games[plannedGameKey]?.result).not.toBeNull()
    expect(result.after.plan.games[0]?.gameId).toBe(plannedGameId)
    expect(result.world.currentDate).toBe(nextDate)
  })
})
