import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionRuntimeBundle } from './WorldCompetitionRuntimeBundle'

function format(seasonId = 'edition:ESP:liga-endesa:2025-26') {
  return {
    schema_version: '1.0',
    competition_id: 'competition:ESP:liga-endesa',
    competition_season_id: seasonId,
    season_label: '2025-26',
    status: 'COMPLETE',
    variants: [{ key: 'MAIN', nodes: [{ key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON' }] }],
    sources: [{ url: 'https://acb.com/', type: 'OFFICIAL' }],
  }
}

function bundle() {
  return {
    bundle_schema_version: 1,
    content_id: 'bdm-phase1-2026-09-14',
    content_sha256: 'a'.repeat(64),
    world_db_schema: 'DDL-PHASE1-A',
    source_commit: '39a8c0a57e9e87e1ba1fb649caf6317744b867b5',
    competition_formats: [format()],
  }
}

describe('parseWorldCompetitionRuntimeBundle', () => {
  it('loads versioned immutable competition content', () => {
    const parsed = parseWorldCompetitionRuntimeBundle(bundle())
    expect(parsed.bundleSchemaVersion).toBe(1)
    expect(parsed.contentId).toBe('bdm-phase1-2026-09-14')
    expect(parsed.competitionFormats[0]?.competitionSeasonId).toBe('edition:ESP:liga-endesa:2025-26')
  })

  it('rejects malformed hashes and duplicate season definitions', () => {
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle(), content_sha256: 'bad' })).toThrow(/SHA-256/)
    expect(() => parseWorldCompetitionRuntimeBundle({ ...bundle(), competition_formats: [format(), format()] })).toThrow(/Duplicate competition season id/)
  })
})
