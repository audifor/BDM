import { describe, expect, it } from 'vitest'
import { playerIdFromString, playerKnowledgeIdFromString, teamIdFromString, organizationIdFromString } from '@/domain/ids'
import { parseGameDate } from '@/domain/date'
import { BASKETBALL_RATING_KEYS } from '@/domain/player'
import { migrateLegacyPlayerKnowledgeRecords } from './OrganizationKnowledge'

describe('legacy PlayerKnowledge migration', () => {
  it('merges shared-organization team records deterministically with bounded uncertainty and legacy provenance', () => {
    const subjectPlayerId = playerIdFromString('player:prospect')
    const organizationId = organizationIdFromString('organization:shared')
    const makeRecord = (observerTeamId: string, estimate: number, uncertainty: number) => ({
      id: playerKnowledgeIdFromString(`player-knowledge:${observerTeamId}:${subjectPlayerId}`),
      observerTeamId: teamIdFromString(observerTeamId), subjectPlayerId, assessedOn: parseGameDate('2025-01-01'),
      basketball: { ratings: Object.fromEntries(BASKETBALL_RATING_KEYS.map((key) => [key, { estimatedValue: estimate, uncertainty }])) as Record<(typeof BASKETBALL_RATING_KEYS)[number], { estimatedValue: number; uncertainty: number }> },
    })
    const legacy = [makeRecord('team:first', 70, 4), makeRecord('team:second', 80, 6)]
    const resolver = (teamId: ReturnType<typeof teamIdFromString>) => {
      expect(['team:first', 'team:second']).toContain(teamId)
      return organizationId
    }
    const migrated = migrateLegacyPlayerKnowledgeRecords(legacy, resolver)
    expect(migrateLegacyPlayerKnowledgeRecords(legacy, resolver)).toEqual(migrated)
    expect(migrated).toHaveLength(1)
    expect(migrated[0]!.organizationId).toBe(organizationId)
    const shooting = migrated[0]!.dimensions.shooting!
    expect(shooting).toMatchObject({ provenance: 'legacyBaseline', estimate: 75, uncertainty: 11, assessedAt: '2025-01-01' })
    expect(shooting.uncertainty).toBeGreaterThanOrEqual(6 + Math.abs(80 - 75))
    expect(Object.keys(migrated[0]!.dimensions)).toHaveLength(7)
  })
})
