import { describe, expect, it } from 'vitest'
import { parseGameDate } from '@/domain/date'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { deriveCompetitionSeasonWindows } from './WorldCompetitionCalendar'

const format = parseWorldCompetitionFormatDocument({
  schema_version: '1.0', competition_id: 'competition:acb', competition_season_id: 'edition:acb:2025-26', season_label: '2025-26', status: 'COMPLETE',
  variants: [{ key: 'MAIN', is_real_variant: true, nodes: [
    { key: 'REGULAR', node_type: 'STAGE', role: 'REGULAR_SEASON', team_count: 18 },
    { key: 'QUARTERFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 8, contest: { format_type: 'SERIES', best_of: 3, wins_required: 2 } },
    { key: 'SEMIFINALS', node_type: 'ROUND', role: 'PLAYOFF', team_count: 4, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 } },
    { key: 'FINAL', node_type: 'ROUND', role: 'FINAL', team_count: 2, contest: { format_type: 'SERIES', best_of: 5, wins_required: 3 } },
  ], edges: [
    { from: 'REGULAR', to: 'QUARTERFINALS', selector: 'RANK_RANGE', rank_from: 1, rank_to: 8 },
    { from: 'QUARTERFINALS', to: 'SEMIFINALS', selector: 'WINNER' },
    { from: 'SEMIFINALS', to: 'FINAL', selector: 'WINNER' },
  ] }],
  sources: [{ url: 'https://acb.com', type: 'OFFICIAL' }],
})

describe('WorldCompetitionCalendar', () => {
  it('reserves maximum series game days from the regular season window and keeps the final in season', () => {
    const windows = deriveCompetitionSeasonWindows(parseGameDate('2025-10-01'), parseGameDate('2026-06-30'), format)

    expect(windows.regularSeasonEnd).toBe('2026-06-17')
    expect(windows.postseasonStart).toBe('2026-06-18')
    expect(windows.postseasonStartByNodeKey).toEqual({ QUARTERFINALS: '2026-06-18', SEMIFINALS: '2026-06-21', FINAL: '2026-06-26' })
    expect(windows.postseasonStartByNodeKey.FINAL).toBe('2026-06-26')
    expect(windows.seasonEnd).toBe('2026-06-30')
  })

  it('validates normalized format documents through the same B04 parser on save/load', () => {
    expect(parseWorldCompetitionFormatDocument(format)).toEqual(format)
  })

  it('rejects a season window too short for its configured regular and postseason periods', () => {
    expect(() => deriveCompetitionSeasonWindows(parseGameDate('2026-06-25'), parseGameDate('2026-06-30'), format)).toThrow('cannot fit')
  })
})
