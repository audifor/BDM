import { describe, expect, it } from 'vitest'

import {
  WORLD_COMPETITION_PACK_SCHEMA_VERSION,
  parseWorldCompetitionPack,
  type WorldCompetitionPack,
} from './WorldCompetitionPack'

function validPack(): WorldCompetitionPack {
  return {
    schemaVersion: WORLD_COMPETITION_PACK_SCHEMA_VERSION,
    sourceRevision: 'bdm-db:phase1:0510cac',
    ecosystems: [{ id: 'ecosystem:nba', code: 'NBA', name: 'NBA', gender: 'MALE' }],
    ecosystemUnits: [
      {
        id: 'unit:east',
        ecosystemId: 'ecosystem:nba',
        parentUnitId: null,
        levelId: null,
        unitType: 'CONFERENCE',
        code: 'EAST',
        name: 'Eastern Conference',
      },
    ],
    competitions: [{ id: 'competition:nba', name: 'NBA' }],
    competitionAssignments: [
      {
        id: 'assignment:nba',
        ecosystemId: 'ecosystem:nba',
        competitionId: 'competition:nba',
        levelId: null,
        unitId: null,
        roleType: 'PRIMARY_LEAGUE',
      },
    ],
    competitionSeasons: [
      {
        id: 'season:nba:2026-27',
        competitionId: 'competition:nba',
        seasonId: 'season:2026-27',
        startDate: '2026-10-20',
        endDate: '2027-06-30',
      },
    ],
    seasonEntries: [
      {
        id: 'entry:celtics',
        competitionSeasonId: 'season:nba:2026-27',
        teamId: 'team:celtics',
      },
    ],
    seasonSlots: [
      {
        id: 'slot:east-1',
        competitionSeasonId: 'season:nba:2026-27',
        slotTypeId: 'PLAYOFF_SEED',
        slotOrder: 1,
      },
    ],
    structureNodes: [
      {
        id: 'node:east',
        competitionSeasonId: 'season:nba:2026-27',
        nodeType: 'GROUP',
        name: 'Eastern Conference',
        sequenceNo: 1,
        specializedType: 'CONFERENCE',
        sourceEcosystemUnitId: 'unit:east',
      },
      {
        id: 'node:playoffs',
        competitionSeasonId: 'season:nba:2026-27',
        nodeType: 'STAGE',
        name: 'Playoffs',
        sequenceNo: 2,
        specializedType: 'PLAYOFFS',
        sourceEcosystemUnitId: null,
      },
    ],
    structureRelationships: [
      {
        id: 'relationship:east-playoffs',
        fromNodeId: 'node:east',
        toNodeId: 'node:playoffs',
        relationshipType: 'PROGRESSION',
      },
    ],
    structurePositions: [
      {
        id: 'position:east-1',
        structureNodeId: 'node:east',
        positionType: 'RANK',
        positionOrder: 1,
        label: '1',
      },
    ],
    structureAssignments: [
      {
        id: 'structure-assignment:celtics:east',
        competitionSeasonEntryId: 'entry:celtics',
        structureNodeId: 'node:east',
      },
    ],
    fixtures: [
      {
        id: 'fixture:1',
        competitionSeasonId: 'season:nba:2026-27',
        structureNodeId: 'node:east',
        status: 'SCHEDULED',
        scheduledDate: '2026-10-20',
      },
    ],
    fixtureSides: [
      {
        id: 'fixture-side:1:home',
        competitionFixtureId: 'fixture:1',
        sideRole: 'HOME',
        competitionSeasonEntryId: 'entry:celtics',
        competitionSeasonSlotId: null,
        sourceStructurePositionId: null,
      },
    ],
    rules: [
      {
        id: 'rule:1',
        competitionSeasonId: 'season:nba:2026-27',
        scopeStructureNodeId: 'node:east',
        category: 'PAIRING',
        ruleType: 'ROUND_ROBIN',
        priority: 0,
        payload: { meetingsPerPair: 4 },
      },
    ],
  }
}

describe('WorldCompetitionPack', () => {
  it('accepts a normalized JSON-safe Phase 1 competition pack', () => {
    expect(parseWorldCompetitionPack(validPack())).toEqual(validPack())
  })

  it('rejects unsupported schema versions before runtime adaptation', () => {
    expect(() => parseWorldCompetitionPack({ ...validPack(), schemaVersion: '2.0' })).toThrow(
      'Unsupported world competition pack schema version',
    )
  })

  it('rejects duplicate identities', () => {
    const pack = validPack()
    expect(() =>
      parseWorldCompetitionPack({
        ...pack,
        competitions: [...pack.competitions, pack.competitions[0]],
      }),
    ).toThrow('competitions contains duplicate id')
  })

  it('rejects graph relationships crossing competition seasons', () => {
    const pack = validPack()
    expect(() =>
      parseWorldCompetitionPack({
        ...pack,
        competitionSeasons: [
          ...pack.competitionSeasons,
          {
            id: 'season:nba:2027-28',
            competitionId: 'competition:nba',
            seasonId: 'season:2027-28',
            startDate: null,
            endDate: null,
          },
        ],
        structureNodes: [
          ...pack.structureNodes,
          {
            id: 'node:future',
            competitionSeasonId: 'season:nba:2027-28',
            nodeType: 'STAGE',
            name: null,
            sequenceNo: null,
            specializedType: null,
            sourceEcosystemUnitId: null,
          },
        ],
        structureRelationships: [
          {
            id: 'relationship:bad',
            fromNodeId: 'node:east',
            toNodeId: 'node:future',
            relationshipType: 'PROGRESSION',
          },
        ],
      }),
    ).toThrow('crosses competition seasons')
  })

  it('rejects fixture-side references from a different competition season', () => {
    const pack = validPack()
    expect(() =>
      parseWorldCompetitionPack({
        ...pack,
        competitionSeasons: [
          ...pack.competitionSeasons,
          {
            id: 'season:nba:2027-28',
            competitionId: 'competition:nba',
            seasonId: 'season:2027-28',
            startDate: null,
            endDate: null,
          },
        ],
        seasonSlots: [
          ...pack.seasonSlots,
          {
            id: 'slot:future',
            competitionSeasonId: 'season:nba:2027-28',
            slotTypeId: null,
            slotOrder: null,
          },
        ],
        fixtureSides: [
          {
            ...pack.fixtureSides[0],
            competitionSeasonEntryId: null,
            competitionSeasonSlotId: 'slot:future',
          },
        ],
      }),
    ).toThrow('crosses competition seasons')
  })

  it('rejects non-JSON rule payloads', () => {
    const pack = validPack()
    expect(() =>
      parseWorldCompetitionPack({
        ...pack,
        rules: [{ ...pack.rules[0], payload: { value: Number.NaN } }],
      }),
    ).toThrow('finite JSON numbers')
  })
})
