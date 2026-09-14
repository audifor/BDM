import { describe, expect, it } from 'vitest'

import { createWorldDbCompetitionRuntimeV1 } from './WorldDbCompetitionRuntime'

const bundle = {
  schemaVersion: 1 as const,
  source: { databaseId: 'bdm-world-phase1', schemaId: 'DDL-PHASE1-A' },
  competitionSeason: {
    competitionSeasonId: 'edition:ESP:liga-endesa:2025-26',
    competitionId: 'competition:ESP:liga-endesa',
    seasonId: 'season:2025-26',
    editionNumber: null,
  },
  entries: [
    { competitionSeasonEntryId: 'entry:a', teamId: 'team:a' },
    { competitionSeasonEntryId: 'entry:b', teamId: 'team:b' },
  ],
  structureNodes: [
    { competitionStructureNodeId: 'node:regular', nodeType: 'STAGE', name: 'Regular Season', sequenceNo: 1 },
    { competitionStructureNodeId: 'node:playoffs', nodeType: 'STAGE', name: 'Playoffs', sequenceNo: 2 },
  ],
  structureEdges: [{ fromNodeId: 'node:regular', toNodeId: 'node:playoffs', relationshipType: 'PROGRESSION' }],
  structureEntryAssignments: [
    { competitionStructureNodeId: 'node:regular', competitionSeasonEntryId: 'entry:a', validFrom: null, validTo: null },
    { competitionStructureNodeId: 'node:regular', competitionSeasonEntryId: 'entry:b', validFrom: null, validTo: null },
  ],
  fixtures: [{ competitionFixtureId: 'fixture:1', structureNodeId: 'node:regular', matchdayId: null, fixtureOrder: 1 }],
  fixtureSides: [
    { competitionFixtureSideId: 'side:1:h', competitionFixtureId: 'fixture:1', sideRole: 'HOME', competitionSeasonEntryId: 'entry:a', competitionSeasonSlotId: null, sourceStructurePositionId: null },
    { competitionFixtureSideId: 'side:1:a', competitionFixtureId: 'fixture:1', sideRole: 'AWAY', competitionSeasonEntryId: 'entry:b', competitionSeasonSlotId: null, sourceStructurePositionId: null },
  ],
  rulePayloads: {},
}

describe('World DB competition runtime projection', () => {
  it('indexes canonical B04 identities without copying league-specific logic', () => {
    const runtime = createWorldDbCompetitionRuntimeV1(bundle)

    expect(runtime.entryIdsByNodeId['node:regular']).toEqual(['entry:a', 'entry:b'])
    expect(runtime.childNodeIdsByNodeId['node:regular']).toEqual(['node:playoffs'])
    expect(runtime.fixturesByNodeId['node:regular']?.map((fixture) => fixture.competitionFixtureId)).toEqual(['fixture:1'])
    expect(runtime.fixtureSidesByFixtureId['fixture:1']?.map((side) => side.sideRole)).toEqual(['HOME', 'AWAY'])
  })

  it('rejects dangling B04 references during bootstrap', () => {
    expect(() => createWorldDbCompetitionRuntimeV1({
      ...bundle,
      fixtureSides: [{ ...bundle.fixtureSides[0], competitionSeasonEntryId: 'entry:missing' }],
    })).toThrow('Fixture side entry not found: entry:missing')
  })

  it('rejects duplicate canonical identities', () => {
    expect(() => createWorldDbCompetitionRuntimeV1({
      ...bundle,
      structureNodes: [...bundle.structureNodes, bundle.structureNodes[0]],
    })).toThrow('Duplicate structure node: node:regular')
  })
})
