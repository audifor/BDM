import { describe, expect, it } from 'vitest'

import { assertWorldDbPlayableCatalogV1 } from './PlayableCatalog'

const validCatalog = {
  schemaVersion: 1,
  source: { databaseId: 'phase1a.db', schemaId: 'DDL-PHASE1-A' },
  ecosystems: [
    {
      competitionEcosystemId: 'ecosystem:ncaa-d1',
      code: 'NCAA_D1_M',
      name: 'NCAA Division I Men',
      gender: 'M',
      levels: [
        {
          ecosystemLevelId: 'level:ncaa-d1',
          parentLevelId: null,
          levelCode: 'D1',
          name: 'Division I',
          tierOrder: 1,
        },
      ],
      units: [
        {
          ecosystemUnitId: 'unit:big-ten',
          ecosystemLevelId: 'level:ncaa-d1',
          parentUnitId: null,
          unitType: 'CONFERENCE',
          code: 'BIG_TEN',
          name: 'Big Ten',
        },
      ],
      competitions: [
        {
          ecosystemCompetitionAssignmentId: 'assignment:big-ten',
          competitionId: 'competition:big-ten',
          name: 'Big Ten Conference',
          ecosystemLevelId: 'level:ncaa-d1',
          ecosystemUnitId: 'unit:big-ten',
          roleType: 'REGULAR_SEASON',
          validFrom: '2025-07-01',
          validTo: null,
          seasons: [
            {
              competitionSeasonId: 'competition-season:big-ten:2025',
              seasonId: 'season:2025-26',
              editionNumber: 1,
            },
          ],
        },
      ],
      teams: [
        {
          teamId: 'team:michigan',
          name: 'Michigan Wolverines',
          memberships: [
            {
              teamEcosystemMembershipId: 'membership:michigan:d1',
              ecosystemLevelId: 'level:ncaa-d1',
              membershipStatus: 'ACTIVE',
              validFrom: '2025-07-01',
              validTo: null,
            },
          ],
          unitMemberships: [
            {
              teamEcosystemUnitMembershipId: 'membership:michigan:big-ten',
              ecosystemUnitId: 'unit:big-ten',
              membershipStatus: 'ACTIVE',
              validFrom: '2025-07-01',
              validTo: null,
            },
          ],
        },
      ],
    },
  ],
} as const

describe('WorldDbPlayableCatalogV1', () => {
  it('accepts a canonical nested playable hierarchy', () => {
    expect(() => assertWorldDbPlayableCatalogV1(validCatalog)).not.toThrow()
  })

  it('rejects malformed nested membership identity', () => {
    const malformed = structuredClone(validCatalog) as unknown as {
      ecosystems: Array<{ teams: Array<{ unitMemberships: Array<Record<string, unknown>> }> }>
    }
    delete malformed.ecosystems[0]!.teams[0]!.unitMemberships[0]!.teamEcosystemUnitMembershipId

    expect(() => assertWorldDbPlayableCatalogV1(malformed)).toThrow(
      'teamEcosystemUnitMembershipId',
    )
  })
})