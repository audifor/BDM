import { describe, expect, it } from 'vitest'
import { parseWorldCompetitionRuntimeBundle } from '@/domain/competition'
import { createWorldCompetitionCatalog, listWorldCompetitionFormats, requireWorldCompetitionFormat } from './WorldCompetitionCatalog'

function bundle() {
  const format = (seasonId: string, label: string) => ({
    schema_version: '1.0',
    competition_id: 'competition:ESP:liga-endesa',
    competition_season_id: seasonId,
    season_label: label,
    status: 'COMPLETE',
    variants: [{ key: 'MAIN', nodes: [{ key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON' }] }],
    sources: [{ url: 'https://acb.com/', type: 'OFFICIAL' }],
  })

  return parseWorldCompetitionRuntimeBundle({
    bundle_schema_version: 1,
    content_id: 'phase1-test',
    content_sha256: 'b'.repeat(64),
    world_db_schema: 'DDL-PHASE1-A',
    competition_formats: [
      format('edition:ESP:liga-endesa:2026-27', '2026-27'),
      format('edition:ESP:liga-endesa:2025-26', '2025-26'),
    ],
  })
}

describe('WorldCompetitionCatalog', () => {
  it('indexes by stable season id and keeps competition seasons deterministic', () => {
    const catalog = createWorldCompetitionCatalog(bundle())

    expect(catalog.bundleContentId).toBe('phase1-test')
    expect(requireWorldCompetitionFormat(catalog, 'edition:ESP:liga-endesa:2025-26').seasonLabel).toBe('2025-26')
    expect(listWorldCompetitionFormats(catalog, 'competition:ESP:liga-endesa').map((format) => format.seasonLabel)).toEqual(['2025-26', '2026-27'])
  })

  it('fails closed when the save/runtime requests content absent from the loaded bundle', () => {
    const catalog = createWorldCompetitionCatalog(bundle())
    expect(() => requireWorldCompetitionFormat(catalog, 'edition:missing')).toThrow(/not present in the loaded World DB bundle/)
  })
})
