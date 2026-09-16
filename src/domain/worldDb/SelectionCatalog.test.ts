import { describe, expect, it } from 'vitest'

import { assertWorldDbSelectionCatalogV1, type WorldDbSelectionCatalogV1 } from './SelectionCatalog'

function catalog(): WorldDbSelectionCatalogV1 {
  return {
    schemaVersion: 1,
    source: { databaseId: 'phase1a.db', schemaId: 'DDL-PHASE1-A' },
    ecosystems: [
      { ecosystemId: 'ecosystem:ESP:acb', code: 'ESP_ACB', name: 'Spain ACB', gender: 'M' },
    ],
    levels: [
      {
        levelId: 'ecosystem-level:ESP:acb:1',
        ecosystemId: 'ecosystem:ESP:acb',
        parentLevelId: null,
        code: '1',
        name: 'Liga Endesa',
        tierOrder: 1,
      },
    ],
    units: [],
    competitionAssignments: [
      {
        assignmentId: 'assignment:acb',
        ecosystemId: 'ecosystem:ESP:acb',
        competitionId: 'competition:ESP:liga-endesa',
        competitionName: 'Liga Endesa',
        levelId: 'ecosystem-level:ESP:acb:1',
        unitId: null,
        roleType: 'PRIMARY_LEAGUE',
      },
    ],
    competitionSeasons: [
      {
        competitionSeasonId: 'edition:ESP:liga-endesa:2025-26',
        competitionId: 'competition:ESP:liga-endesa',
        competitionName: 'Liga Endesa',
        seasonId: 'season:2025-26',
        editionNumber: 70,
      },
    ],
    teamMemberships: [
      {
        membershipId: 'team-ecosystem:acb:real-madrid',
        ecosystemId: 'ecosystem:ESP:acb',
        teamId: 'team:ESP:real-madrid',
        teamName: 'Real Madrid',
        levelId: 'ecosystem-level:ESP:acb:1',
        membershipStatus: 'ACTIVE',
        validFrom: '2025-07-01',
        validTo: '2026-06-30',
      },
    ],
    teamUnitMemberships: [],
  }
}

describe('WorldDbSelectionCatalogV1', () => {
  it('accepts a canonical Phase 1 selection catalog', () => {
    const value: unknown = catalog()
    expect(() => assertWorldDbSelectionCatalogV1(value)).not.toThrow()
  })

  it('rejects duplicate canonical IDs', () => {
    const value = catalog()
    const duplicate = {
      ...value,
      competitionSeasons: [value.competitionSeasons[0], value.competitionSeasons[0]],
    }
    expect(() => assertWorldDbSelectionCatalogV1(duplicate)).toThrow('duplicate IDs')
  })

  it('rejects empty canonical names', () => {
    const value = catalog()
    const invalid = {
      ...value,
      teamMemberships: [{ ...value.teamMemberships[0], teamName: ' ' }],
    }
    expect(() => assertWorldDbSelectionCatalogV1(invalid)).toThrow('teamName')
  })
})
