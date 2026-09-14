import { describe, expect, it } from 'vitest'

import { parseWorldCompetitionRuntimeBundle } from './WorldCompetitionRuntimeBundle'
import { createWorldCompetitionCatalog } from '@/engine/competition/WorldCompetitionCatalog'

const bundle = {
  bundle_schema_version: 1,
  content_id: 'bdm-phase1-competition-runtime-v1',
  content_hash_algorithm: 'BLAKE3',
  content_hash: 'a'.repeat(64),
  world_db_schema: 'DDL-PHASE1-A',
  source_commit: 'test',
  competition_formats: [
    {
      schema_version: '1.0',
      competition_id: 'competition:test',
      competition_season_id: 'edition:test:2026-27',
      season_label: '2026-27',
      status: 'COMPLETE',
      variants: [{
        key: 'MAIN',
        nodes: [
          {
            key: 'QF',
            node_type: 'ROUND',
            role: 'PLAYOFF',
            specialized_type: 'QUARTERFINAL',
            pairing: { type: 'FIXED_BRACKET', payload: {} },
            contest: { format_type: 'SINGLE_GAME', requires_winner: true },
          },
          {
            key: 'SF',
            node_type: 'ROUND',
            role: 'PLAYOFF',
            specialized_type: 'SEMIFINAL',
            pairing: { type: 'FIXED_BRACKET', payload: {} },
            contest: { format_type: 'SINGLE_GAME', requires_winner: true },
          },
        ],
        edges: [{ from: 'QF', to: 'SF', selector: 'WINNER', payload: {} }],
      }],
      consequences: [],
      sources: [{ url: 'https://example.com/rules', type: 'OFFICIAL' }],
    },
  ],
  initial_score_documents: [],
}

describe('Phase 1 runtime bundle bridge', () => {
  it('parses the BDM-DB wire contract and builds a deterministic catalog', () => {
    const parsed = parseWorldCompetitionRuntimeBundle(bundle)
    const catalog = createWorldCompetitionCatalog(parsed)

    expect(parsed.contentId).toBe('bdm-phase1-competition-runtime-v1')
    expect(parsed.worldDbSchema).toBe('DDL-PHASE1-A')
    expect(catalog.formatsBySeasonId['edition:test:2026-27']?.variants[0]?.edges[0]).toEqual({
      from: 'QF',
      to: 'SF',
      selector: 'WINNER',
      payload: {},
    })
  })

  it('rejects bundles for another content contract or schema', () => {
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle, content_id: 'other' })).toThrow('content_id')
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle, world_db_schema: 'DDL-99' })).toThrow('world_db_schema')
  })

  it('rejects BLOCKED competition formats at the runtime boundary', () => {
    const blocked = {
      ...bundle,
      competition_formats: [{ ...bundle.competition_formats[0], status: 'BLOCKED' }],
    }
    expect(() => parseWorldCompetitionRuntimeBundle(blocked)).toThrow('BLOCKED')
  })
})
