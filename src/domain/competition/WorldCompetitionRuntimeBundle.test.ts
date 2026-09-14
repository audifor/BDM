import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionRuntimeBundle } from './WorldCompetitionRuntimeBundle'

function format(seasonId = 'edition:FRA:coupe-de-france:2025-26') {
  return {
    schema_version: '1.0',
    competition_id: 'competition:FRA:coupe-de-france',
    competition_season_id: seasonId,
    season_label: '2025-26',
    status: 'COMPLETE',
    variants: [{ key: 'MAIN', nodes: [{ key: 'ROUND_1', node_type: 'ROUND', role: 'PLAYOFF' }] }],
    sources: [{ url: 'https://ffbb.com/', type: 'OFFICIAL' }],
  }
}

function initialScore(seasonId = 'edition:FRA:coupe-de-france:2025-26') {
  return {
    schema_version: '1.0',
    competition_id: 'competition:FRA:coupe-de-france',
    competition_season_id: seasonId,
    rules: [{
      key: 'LOWER_LEVEL_HANDICAP',
      variant_key: 'MAIN',
      scope_node_key: 'ROUND_1',
      rule_type: 'CLASSIFICATION_DIFFERENCE',
      priority: 0,
      composition_mode: 'ADDITIVE',
      payload: { points_per_level: 7 },
    }],
    sources: [{ url: 'https://ffbb.com/', type: 'OFFICIAL' }],
  }
}

function bundle() {
  return {
    bundle_schema_version: 1,
    content_id: 'bdm-phase1-2026-09-14',
    content_hash_algorithm: 'BLAKE3',
    content_hash: 'a'.repeat(64),
    world_db_schema: 'DDL-PHASE1-A',
    source_commit: '39a8c0a57e9e87e1ba1fb649caf6317744b867b5',
    competition_formats: [format()],
    initial_score_documents: [initialScore()],
  }
}

describe('parseWorldCompetitionRuntimeBundle', () => {
  it('loads versioned immutable competition content including initial score rules', () => {
    const parsed = parseWorldCompetitionRuntimeBundle(bundle())
    expect(parsed.bundleSchemaVersion).toBe(1)
    expect(parsed.contentId).toBe('bdm-phase1-2026-09-14')
    expect(parsed.contentHashAlgorithm).toBe('BLAKE3')
    expect(parsed.competitionFormats[0]?.competitionSeasonId).toBe('edition:FRA:coupe-de-france:2025-26')
    expect(parsed.initialScoreDocuments[0]?.rules[0]).toMatchObject({ ruleType: 'CLASSIFICATION_DIFFERENCE', payload: { points_per_level: 7 } })
  })

  it('rejects malformed hashes, unsupported algorithms and duplicate season definitions', () => {
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle(), content_hash: 'bad' })).toThrow(/BLAKE3/)
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle(), content_hash_algorithm: 'SHA256' })).toThrow(/content_hash_algorithm/)
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle(), competition_formats: [format(), format()] })).toThrow(/Duplicate competition season id/)
  })

  it('rejects initial score rules for a season missing from the bundle', () => {
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle(), initial_score_documents: [initialScore('edition:FRA:missing:2025-26')] })).toThrow(/absent from the bundle/)
  })
})
