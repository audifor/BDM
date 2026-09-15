import { describe, expect, it } from 'vitest'

import type { WorldDbCompetitionBundleV1 } from '@/domain/worldDb/CompetitionBundle'
import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'
import { resolveWorldDbFixturesV1 } from './WorldDbFixtureResolver'
import type { WorldDbProgressionAssignmentV1 } from './WorldDbProgressionResolver'

function buildBundle(): WorldDbCompetitionBundleV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1.db', schemaId: 'DDL-PHASE1-A' },
    competitionSeason: {
      competitionSeasonId: 'edition:test:2026-27',
      competitionId: 'competition:test',
      seasonId: 'season:2026-27',
      editionNumber: null,
    },
    entries: [
      { competitionSeasonEntryId: 'entry:a', teamId: 'team:a' },
      { competitionSeasonEntryId: 'entry:b', teamId: 'team:b' },
      { competitionSeasonEntryId: 'entry:c', teamId: 'team:c' },
    ],
    structureNodes: [
      { competitionStructureNodeId: 'node:qf', nodeType: 'ROUND', name: 'Quarterfinal', sequenceNo: 1 },
      { competitionStructureNodeId: 'node:sf', nodeType: 'ROUND', name: 'Semifinal', sequenceNo: 2 },
    ],
    structurePositions: [
      {
        competitionStructurePositionId: 'position:sf:1',
        competitionStructureNodeId: 'node:sf',
        positionType: 'BRACKET_SLOT',
        positionOrder: 1,
        label: 'SF slot 1',
      },
      {
        competitionStructurePositionId: 'position:sf:2',
        competitionStructureNodeId: 'node:sf',
        positionType: 'BRACKET_SLOT',
        positionOrder: 2,
        label: 'SF slot 2',
      },
    ],
    structureEdges: [],
    structureEntryAssignments: [],
    fixtures: [
      { competitionFixtureId: 'fixture:sf', structureNodeId: 'node:sf', matchdayId: null, fixtureOrder: 1 },
    ],
    fixtureSides: [
      {
        competitionFixtureSideId: 'side:home',
        competitionFixtureId: 'fixture:sf',
        sideRole: 'HOME',
        competitionSeasonEntryId: null,
        competitionSeasonSlotId: null,
        sourceStructurePositionId: 'position:sf:1',
      },
      {
        competitionFixtureSideId: 'side:away',
        competitionFixtureId: 'fixture:sf',
        sideRole: 'AWAY',
        competitionSeasonEntryId: null,
        competitionSeasonSlotId: null,
        sourceStructurePositionId: 'position:sf:2',
      },
    ],
    rulePayloads: {},
  }
}

function assignment(positionId: string, entryId: string): WorldDbProgressionAssignmentV1 {
  return {
    ruleId: `rule:${positionId}`,
    ruleType: 'GAME_WINNER',
    sourceNodeId: 'node:qf',
    destinationNodeId: 'node:sf',
    destinationPositionId: positionId,
    competitionSeasonEntryId: entryId,
  }
}

describe('World DB fixture resolution', () => {
  it('resolves fixture sides only from explicit destination positions', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(buildBundle())

    expect(resolveWorldDbFixturesV1(runtime, [
      assignment('position:sf:1', 'entry:a'),
      assignment('position:sf:2', 'entry:b'),
    ])).toEqual([
      {
        competitionFixtureId: 'fixture:sf',
        ready: true,
        sides: [
          {
            competitionFixtureSideId: 'side:home',
            competitionFixtureId: 'fixture:sf',
            sideRole: 'HOME',
            competitionSeasonEntryId: 'entry:a',
            resolutionSource: 'STRUCTURE_POSITION',
          },
          {
            competitionFixtureSideId: 'side:away',
            competitionFixtureId: 'fixture:sf',
            sideRole: 'AWAY',
            competitionSeasonEntryId: 'entry:b',
            resolutionSource: 'STRUCTURE_POSITION',
          },
        ],
      },
    ])
  })

  it('leaves a fixture unresolved when progression names only the destination node', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(buildBundle())
    const nodeOnly: WorldDbProgressionAssignmentV1 = {
      ruleId: 'rule:winner',
      ruleType: 'GAME_WINNER',
      sourceNodeId: 'node:qf',
      destinationNodeId: 'node:sf',
      competitionSeasonEntryId: 'entry:a',
    }

    const [fixture] = resolveWorldDbFixturesV1(runtime, [nodeOnly])
    expect(fixture?.ready).toBe(false)
    expect(fixture?.sides.every((side) => side.competitionSeasonEntryId === null)).toBe(true)
  })

  it('rejects two different entries assigned to the same structure position', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(buildBundle())
    expect(() => resolveWorldDbFixturesV1(runtime, [
      assignment('position:sf:1', 'entry:a'),
      assignment('position:sf:1', 'entry:c'),
    ])).toThrow('Structure position position:sf:1 received multiple entries')
  })

  it('rejects an assignment whose explicit position belongs to another node', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(buildBundle())
    expect(() => resolveWorldDbFixturesV1(runtime, [{
      ...assignment('position:sf:1', 'entry:a'),
      destinationNodeId: 'node:qf',
    }])).toThrow('does not belong to node node:qf')
  })
})
