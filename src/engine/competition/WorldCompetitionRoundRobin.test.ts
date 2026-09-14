import { describe, expect, it } from 'vitest'

import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { instantiateWorldCompetitionRoundRobinV1 } from './WorldCompetitionRoundRobin'

const format = parseWorldCompetitionFormatDocument({
  schema_version: '1.0',
  competition_id: 'competition:league',
  competition_season_id: 'edition:league:2026',
  season_label: '2026',
  status: 'COMPLETE',
  variants: [{
    key: 'MAIN',
    nodes: [{
      key: 'REGULAR',
      node_type: 'STAGE',
      role: 'REGULAR_SEASON',
      team_count: 4,
      pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 2 },
      opponent_scope: { type: 'ALL_STAGE' },
    }],
    edges: [],
  }],
  sources: [{ url: 'https://example.com', type: 'OFFICIAL' }],
})

const entries = [1, 2, 3, 4].map((value) => ({ competitionSeasonEntryId: `entry:${value}` }))

describe('Phase 1 round-robin instantiator', () => {
  it('creates a deterministic double round robin with every pair exactly twice', () => {
    const first = instantiateWorldCompetitionRoundRobinV1(format, 'MAIN', 'REGULAR', entries)
    const second = instantiateWorldCompetitionRoundRobinV1(format, 'MAIN', 'REGULAR', entries)

    expect(first).toEqual(second)
    expect(first.roundsPerMeeting).toBe(3)
    expect(first.meetingsPerPair).toBe(2)
    expect(first.fixtures).toHaveLength(12)
    expect(new Set(first.fixtures.map((fixture) => fixture.fixtureId)).size).toBe(12)

    for (let left = 1; left <= 4; left += 1) {
      for (let right = left + 1; right <= 4; right += 1) {
        const meetings = first.fixtures.filter((fixture) =>
          new Set([fixture.homeEntryId, fixture.awayEntryId]).has(`entry:${left}`)
          && new Set([fixture.homeEntryId, fixture.awayEntryId]).has(`entry:${right}`),
        )
        expect(meetings).toHaveLength(2)
        expect(meetings[0]?.homeEntryId).toBe(meetings[1]?.awayEntryId)
        expect(meetings[0]?.awayEntryId).toBe(meetings[1]?.homeEntryId)
      }
    }
  })

  it('supports odd team counts with a bye and still emits every pair once', () => {
    const oddFormat = parseWorldCompetitionFormatDocument({
      schema_version: '1.0', competition_id: 'competition:odd', competition_season_id: 'edition:odd', season_label: 'odd', status: 'COMPLETE',
      variants: [{ key: 'MAIN', nodes: [{ key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON', team_count: 3, pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 1 }, opponent_scope: { type: 'ALL_STAGE' } }], edges: [] }],
      sources: [{ url: 'https://example.com', type: 'OFFICIAL' }],
    })
    const plan = instantiateWorldCompetitionRoundRobinV1(oddFormat, 'MAIN', 'REGULAR', entries.slice(0, 3))
    expect(plan.roundsPerMeeting).toBe(3)
    expect(plan.fixtures).toHaveLength(3)
    expect(plan.fixtures.some((fixture) => fixture.homeEntryId.includes('BYE') || fixture.awayEntryId.includes('BYE'))).toBe(false)
  })

  it('validates team count, duplicate entries and unsupported opponent scopes', () => {
    expect(() => instantiateWorldCompetitionRoundRobinV1(format, 'MAIN', 'REGULAR', entries.slice(0, 3))).toThrow('declares 4 teams')
    expect(() => instantiateWorldCompetitionRoundRobinV1(format, 'MAIN', 'REGULAR', [entries[0]!, entries[0]!, entries[2]!, entries[3]!])).toThrow('Duplicate round-robin competition entry')

    const subgroup = parseWorldCompetitionFormatDocument({
      schema_version: '1.0', competition_id: 'competition:groups', competition_season_id: 'edition:groups', season_label: 'groups', status: 'COMPLETE',
      variants: [{ key: 'MAIN', nodes: [{ key: 'GROUP', node_type: 'GROUP', role: 'GROUP_STAGE', team_count: 4, pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 1 }, opponent_scope: { type: 'SAME_GROUP' } }], edges: [] }],
      sources: [{ url: 'https://example.com', type: 'OFFICIAL' }],
    })
    expect(() => instantiateWorldCompetitionRoundRobinV1(subgroup, 'MAIN', 'GROUP', entries)).toThrow('requires ALL_STAGE opponent scope in v1')
  })
})
