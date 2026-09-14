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
    ecosystems: [
      { id: 'ecosystem:nba', code: 'NBA', name: 'NBA', gender: 'MALE' },
    ],
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
    structureNodes: [
      {
        id: 'node:east',
        competitionSeasonId: 'season:nba:2026-27',
        parentNodeId: null,
        nodeType: 'GROUP',
        role: 'CONFERENCE',
        name: 'Eastern Conference',
        sourceEcosystemUnitId: 'unit:east',
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
        side: 'HOME',
        teamId: 'team:celtics',
        sourceStructureNodeId: null,
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
    expect(() =>
      parseWorldCompetitionPack({ ...validPack(), schemaVersion: '2.0' }),
    ).toThrow('Unsupported world competition pack schema version')
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

  it('rejects cross-season structural references', () => {
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
            id: 'node:bad-child',
            competitionSeasonId: 'season:nba:2027-28',
            parentNodeId: 'node:east',
            nodeType: 'ROUND',
            role: null,
            name: null,
            sourceEcosystemUnitId: null,
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
