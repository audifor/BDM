import { describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import { createGame } from '@/domain/game'
import {
  attachWorldDbCompetitionRuntime,
  updateGameWorld,
} from '@/domain/world'
import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import type { WorldDbCompetitionPlanningContextV1 } from '@/engine/competition/WorldDbPhysicalGamePlanner'
import { createNewGame } from './createNewGame'
import {
  deriveWorldDbPhysicalGameStakesV1,
  fixtureRequiresPhysicalExpansion,
  materializeWorldDbPhysicalGamesV1,
} from './WorldDbGameMaterialization'

function stakesContext(
  fixtureId: string,
  nodeId: string,
  nodeType: string,
  hasProgression: boolean,
  competitionSeasonId = `competition-season:${fixtureId}`,
): WorldDbCompetitionPlanningContextV1 {
  return {
    bundle: {
      schemaVersion: 1,
      source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
      competitionSeason: {
        competitionSeasonId,
        competitionId: `competition:${fixtureId}`,
        seasonId: 'season:1',
        editionNumber: null,
      },
      entries: [],
      structureNodes: [
        { competitionStructureNodeId: nodeId, nodeType, name: null, sequenceNo: null },
      ],
      structureEdges: [],
      structureEntryAssignments: [],
      fixtures: [
        { competitionFixtureId: fixtureId, structureNodeId: nodeId, matchdayId: null, fixtureOrder: 1 },
      ],
      fixtureSides: [],
      rulePayloads: hasProgression
        ? {
            progressionRules: [
              { id: `progression:${fixtureId}`, scopeStructureNodeId: nodeId, type: 'GAME_WINNER' },
            ],
          }
        : {},
    },
  }
}

function executableContext(): {
  readonly world: ReturnType<typeof createNewGame>
  readonly context: WorldDbCompetitionPlanningContextV1
  readonly fixtureId: string
} {
  const world = createNewGame()
  const season = Object.values(world.seasons)[0]!
  const teamIds = season.participantTeamIds ?? Object.keys(world.teams).slice(0, 2)
  const [homeTeamId, awayTeamId] = teamIds
  if (homeTeamId === undefined || awayTeamId === undefined) {
    throw new Error('Test universe requires two teams')
  }

  const fixtureId = 'fixture:materialize:1'
  const nodeId = 'node:regular'
  const slotId = 'slot:1'
  const bundle: WorldDbCompetitionBundleV1 = {
    schemaVersion: 1,
    source: { databaseId: 'world.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'competition-season:materialize',
      competitionId: season.competitionId,
      seasonId: season.id,
      editionNumber: null,
    },
    entries: [
      { competitionSeasonEntryId: 'entry:home', teamId: homeTeamId },
      { competitionSeasonEntryId: 'entry:away', teamId: awayTeamId },
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
        competitionFixtureSideId: 'side:home',
        competitionFixtureId: fixtureId,
        sideRole: 'HOME',
        competitionSeasonEntryId: 'entry:home',
        competitionSeasonSlotId: null,
        sourceStructurePositionId: null,
      },
      {
        competitionFixtureSideId: 'side:away',
        competitionFixtureId: fixtureId,
        sideRole: 'AWAY',
        competitionSeasonEntryId: 'entry:away',
        competitionSeasonSlotId: null,
        sourceStructurePositionId: null,
      },
    ],
    scheduleSlots: [
      { competitionScheduleSlotId: slotId, scheduleBlockId: null, scheduleSessionId: null, slotOrder: 1 },
    ],
    scheduleSlotTimings: [
      {
        competitionScheduleSlotTimingHistoryId: 'timing:1',
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
        competitionFixtureScheduleAllocationId: 'allocation:1',
        competitionFixtureId: fixtureId,
        competitionScheduleSlotId: slotId,
        status: 'ACTIVE',
        validFrom: null,
        validTo: null,
      },
    ],
    rulePayloads: {},
  }

  return { world, context: { bundle }, fixtureId }
}

describe('World DB Game materialization', () => {
  it('derives regular, elimination and terminal-final stakes from B04 semantics', () => {
    expect(
      deriveWorldDbPhysicalGameStakesV1(
        [stakesContext('fixture:regular', 'node:regular', 'STAGE', false)],
        ['fixture:regular'],
      ),
    ).toBe('regular')
    expect(
      deriveWorldDbPhysicalGameStakesV1(
        [stakesContext('fixture:playoff', 'node:playoff', 'ROUND', true)],
        ['fixture:playoff'],
      ),
    ).toBe('elimination')
    expect(
      deriveWorldDbPhysicalGameStakesV1(
        [stakesContext('fixture:final', 'node:final', 'ROUND', false)],
        ['fixture:final'],
      ),
    ).toBe('final')
  })

  it('keeps a named Conference Final as elimination when progression continues', () => {
    const context = stakesContext('fixture:conference-final', 'node:conference-final', 'ROUND', true)
    const node = context.bundle.structureNodes[0]!
    const bundle = {
      ...context.bundle,
      structureNodes: [{ ...node, name: 'Conference Finals' }],
    }

    expect(
      deriveWorldDbPhysicalGameStakesV1([{ bundle }], ['fixture:conference-final']),
    ).toBe('elimination')
  })

  it('uses the strongest stakes when one physical game realizes multiple fixtures', () => {
    const regular = stakesContext(
      'fixture:nba-regular',
      'node:nba-regular',
      'STAGE',
      false,
      'edition:nba',
    )
    const cup = stakesContext(
      'fixture:cup-semi',
      'node:cup-semi',
      'ROUND',
      true,
      'edition:cup',
    )

    expect(
      deriveWorldDbPhysicalGameStakesV1(
        [regular, cup],
        ['fixture:nba-regular', 'fixture:cup-semi'],
      ),
    ).toBe('elimination')
  })

  it('materializes deterministically and registers only the active competition season', () => {
    const { world, context } = executableContext()
    const seeded = attachWorldDbCompetitionRuntime(world, {
      competitionPlanIds: ['plan:preexisting'],
      competitionSeasonIds: [],
    })
    const asOf = `${world.currentDate}T12:00:00Z`

    const first = materializeWorldDbPhysicalGamesV1(seeded, [context], asOf)
    const gameId = first.plan.games[0]!.gameId
    expect(first.world.games[gameId as keyof typeof first.world.games]).toMatchObject({
      status: 'scheduled',
      stakes: 'regular',
    })
    expect(first.world.worldDbCompetitionRuntime).toEqual({
      competitionPlanIds: ['plan:preexisting'],
      competitionSeasonIds: ['competition-season:materialize'],
    })

    const second = materializeWorldDbPhysicalGamesV1(first.world, [context], asOf)
    expect(Object.keys(second.world.games).filter((id) => id === gameId)).toHaveLength(1)
    expect(second.world.worldDbCompetitionRuntime).toEqual(first.world.worldDbCompetitionRuntime)
  })

  it('preserves a completed result when the deterministic plan is materialized again', () => {
    const { world, context } = executableContext()
    const asOf = `${world.currentDate}T12:00:00Z`
    const first = materializeWorldDbPhysicalGamesV1(world, [context], asOf)
    const gameId = first.plan.games[0]!.gameId
    const scheduled = first.world.games[gameId as keyof typeof first.world.games]!
    const completed = createGame({
      ...scheduled,
      date: parseGameDate(scheduled.date),
      status: 'completed',
      result: { homeScore: 81, awayScore: 74 },
    })
    const completedWorld = updateGameWorld(first.world, {
      games: Object.values({ ...first.world.games, [gameId]: completed }),
    })

    const rematerialized = materializeWorldDbPhysicalGamesV1(completedWorld, [context], asOf)
    expect(rematerialized.world.games[gameId as keyof typeof rematerialized.world.games]).toMatchObject({
      status: 'completed',
      result: { homeScore: 81, awayScore: 74 },
    })
  })

  it.each(['SERIES', 'AGGREGATE'] as const)(
    'defers a virtual %s fixture instead of collapsing it into one Game',
    (formatType) => {
      const { world, context, fixtureId } = executableContext()
      const node = context.bundle.structureNodes[0]!
      const contestContext: WorldDbCompetitionPlanningContextV1 = {
        bundle: {
          ...context.bundle,
          structureNodes: [{ ...node, nodeType: 'ROUND' }],
          rulePayloads: {
            contestFormats: [
              {
                id: `contest:${formatType.toLowerCase()}`,
                scopeStructureNodeId: node.competitionStructureNodeId,
                type: formatType,
              },
            ],
          },
        },
      }

      expect(fixtureRequiresPhysicalExpansion([contestContext], fixtureId)).toBe(true)

      const result = materializeWorldDbPhysicalGamesV1(
        world,
        [contestContext],
        `${world.currentDate}T12:00:00Z`,
      )
      const gameId = result.plan.games[0]!.gameId
      expect(result.deferredCompetitionFixtureIds).toEqual([fixtureId])
      expect(result.world.games[gameId as keyof typeof result.world.games]).toBeUndefined()
      expect(result.world.worldDbCompetitionRuntime?.competitionSeasonIds).toEqual([
        'competition-season:materialize',
      ])
    },
  )
})
