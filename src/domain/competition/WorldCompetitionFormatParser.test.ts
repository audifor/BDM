import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionFormatDocument } from './WorldCompetitionFormatParser'

function acbFormat() {
  return {
    schema_version: '1.0',
    competition_id: 'competition:ESP:liga-endesa',
    competition_season_id: 'edition:ESP:liga-endesa:2025-26',
    season_label: '2025-26',
    status: 'COMPLETE',
    variants: [
      {
        key: 'MAIN',
        nodes: [
          {
            key: 'REGULAR',
            node_type: 'STAGE',
            role: 'REGULAR_SEASON',
            team_count: 18,
            pairing: { type: 'ROUND_ROBIN', meetings_per_pair: 2 },
            opponent_scope: { type: 'ALL_STAGE' },
          },
          {
            key: 'QUARTERFINALS',
            node_type: 'ROUND',
            role: 'PLAYOFF',
            pairing: { type: 'FIXED_BRACKET', payload: { matchups: ['1-8', '4-5', '2-7', '3-6'] } },
            contest: { format_type: 'SERIES', best_of: 3, wins_required: 2 },
            hosting: { rule_type: 'SERIES_PATTERN', pattern: 'HAH' },
          },
          {
            key: 'FINAL',
            node_type: 'ROUND',
            role: 'FINAL',
            contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 },
          },
        ],
        edges: [
          { from: 'REGULAR', to: 'QUARTERFINALS', selector: 'RANK_RANGE', rank_from: 1, rank_to: 8 },
          { from: 'QUARTERFINALS', to: 'FINAL', selector: 'WINNER' },
        ],
      },
    ],
    consequences: [
      { variant_key: 'MAIN', source_node: 'REGULAR', selector: 'RANK_RANGE', rank_from: 17, rank_to: 18, type: 'RELEGATION' },
    ],
    sources: [{ url: 'https://acb.com/', type: 'OFFICIAL', scope: 'format' }],
  }
}

describe('parseWorldCompetitionFormatDocument', () => {
  it('normalizes the canonical BDM-DB wire format without league-specific branching', () => {
    const parsed = parseWorldCompetitionFormatDocument(acbFormat())

    expect(parsed.schemaVersion).toBe('1.0')
    expect(parsed.competitionSeasonId).toBe('edition:ESP:liga-endesa:2025-26')
    expect(parsed.variants[0]?.nodes[0]).toMatchObject({
      key: 'REGULAR',
      nodeType: 'STAGE',
      role: 'REGULAR_SEASON',
      teamCount: 18,
      pairing: { type: 'ROUND_ROBIN', meetingsPerPair: 2 },
    })
    expect(parsed.variants[0]?.nodes[1]?.pairing?.payload).toEqual({ matchups: ['1-8', '4-5', '2-7', '3-6'] })
    expect(parsed.variants[0]?.edges[0]).toMatchObject({ from: 'REGULAR', to: 'QUARTERFINALS', selector: 'RANK_RANGE', rankFrom: 1, rankTo: 8 })
    expect(parsed.consequences[0]).toMatchObject({ sourceNode: 'REGULAR', selector: 'RANK_RANGE', rankFrom: 17, rankTo: 18, type: 'RELEGATION' })
  })

  it('rejects incompatible schema versions and blocked documents', () => {
    expect(() => parseWorldCompetitionFormatDocument({ ...acbFormat(), schema_version: '2.0' })).toThrow(/Unsupported competition format schema_version/)
    expect(() => parseWorldCompetitionFormatDocument({ ...acbFormat(), status: 'BLOCKED' })).toThrow(/BLOCKED competition formats/)
  })

  it('rejects broken graph references before they reach the simulation engine', () => {
    const raw = acbFormat()
    raw.variants[0]!.edges[0] = { from: 'MISSING', to: 'QUARTERFINALS', selector: 'RANK_RANGE', rank_from: 1, rank_to: 8 }
    expect(() => parseWorldCompetitionFormatDocument(raw)).toThrow(/Unknown edge source node MISSING/)
  })

  it('rejects invalid series definitions', () => {
    const raw = acbFormat()
    const quarterfinal = raw.variants[0]!.nodes[1]!
    quarterfinal.contest = { format_type: 'SERIES', best_of: 3, wins_required: 4 }
    expect(() => parseWorldCompetitionFormatDocument(raw)).toThrow(/wins_required cannot exceed contest.best_of/)
  })
})
