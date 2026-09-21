import { describe, expect, it } from 'vitest'
import { compareGameDates, parseGameDate } from '@/domain/date'
import { parseWorldCompetitionFormatDocument } from '@/domain/competition'
import { deriveCompetitionSeasonWindows, deriveNextEditionCalendarPolicy } from './WorldCompetitionCalendar'
import { SPAIN_ACB_2025_26_CALENDAR, spainAcbCalendarForStartYear } from '@/data/worldCompetitionCalendars'

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

  it('respects configured regular-season and playoff windows with rest between series games', () => {
    const windows = deriveCompetitionSeasonWindows(parseGameDate('2025-10-01'), parseGameDate('2026-06-30'), format, SPAIN_ACB_2025_26_CALENDAR)

    expect(windows.regularSeasonEnd).toBe('2026-05-30')
    expect(windows.postseasonStart).toBe('2026-06-02')
    expect(windows.postseasonStartByNodeKey).toEqual({ QUARTERFINALS: '2026-06-02', SEMIFINALS: '2026-06-09', FINAL: '2026-06-20' })
    expect(windows.postseasonDaysBetweenGames).toBe(2)
  })

  it('rejects a season window too short for its configured regular and postseason periods', () => {
    expect(() => deriveCompetitionSeasonWindows(parseGameDate('2026-06-25'), parseGameDate('2026-06-30'), format)).toThrow('cannot fit')
  })

  describe('RWS-BUG-002A deriveNextEditionCalendarPolicy', () => {
    const ROUND_COUNT = 34 // 18 teams, double round robin: (18 - 1) * 2

    it('reproduces the exact 2028-29 -> 2029-30 rollover that previously threw a margin error', () => {
      // 2028-10-01 is a Sunday, so the aligned regular-season start slips 6 days to the
      // following Saturday (2028-10-07) -- this is the exact case that used to overflow the
      // fixed 2025-26-derived window before round 34.
      const season3 = spainAcbCalendarForStartYear(2027)
      const next = deriveNextEditionCalendarPolicy(season3, ROUND_COUNT)

      expect(next.regularSeasonWindow.startDate).toBe('2028-10-07')
      expect(compareGameDates(next.regularSeasonWindow.endDate, next.regularSeasonWindow.startDate)).toBeGreaterThan(0)
      expect(next.postseasonWindow!.startDate > next.regularSeasonWindow.endDate).toBe(true)
    })

    it('never lets postseasonWindow.startDate collide with or precede regularSeasonWindow.endDate, across ten consecutive rollovers', () => {
      let policy: ReturnType<typeof spainAcbCalendarForStartYear> = spainAcbCalendarForStartYear(2025)
      for (let i = 0; i < 10; i += 1) {
        const next = deriveNextEditionCalendarPolicy(policy, ROUND_COUNT)
        expect(compareGameDates(next.regularSeasonWindow.startDate, next.regularSeasonWindow.endDate)).toBeLessThan(0)
        expect(next.postseasonWindow!.startDate > next.regularSeasonWindow.endDate).toBe(true)
        if (next.offseasonWindow !== null) expect(next.offseasonWindow.startDate > next.postseasonWindow!.endDate).toBe(true)
        expect(compareGameDates(next.seasonWindow.startDate, policy.seasonWindow.startDate)).toBeGreaterThan(0)
        policy = next
      }
    })

    it('crosses the 2028 leap year (29 February) without breaking window derivation', () => {
      // A season starting 2027-10-xx runs its regular season through the 2028 leap year.
      const season2027 = spainAcbCalendarForStartYear(2026)
      const next = deriveNextEditionCalendarPolicy(season2027, ROUND_COUNT)
      expect(next.regularSeasonWindow.startDate.startsWith('2027-10')).toBe(true)
      expect(next.regularSeasonWindow.endDate.startsWith('2028-0')).toBe(true)
      expect(compareGameDates(next.regularSeasonWindow.startDate, next.regularSeasonWindow.endDate)).toBeLessThan(0)
    })

    it('keeps a valid regular-season window across twenty consecutive rollovers regardless of starting weekday', () => {
      let policy: ReturnType<typeof spainAcbCalendarForStartYear> = spainAcbCalendarForStartYear(2025)
      for (let i = 0; i < 20; i += 1) {
        policy = deriveNextEditionCalendarPolicy(policy, ROUND_COUNT)
        expect(compareGameDates(policy.regularSeasonWindow.startDate, policy.regularSeasonWindow.endDate)).toBeLessThan(0)
      }
    })

    it('holds every Paso 11 window invariant across twenty consecutive rollovers', () => {
      let policy: ReturnType<typeof spainAcbCalendarForStartYear> = spainAcbCalendarForStartYear(2025)
      const reference2025 = policy
      for (let i = 0; i < 20; i += 1) {
        const next = deriveNextEditionCalendarPolicy(policy, ROUND_COUNT)

        // startDate < regularSeasonEnd
        expect(compareGameDates(next.seasonWindow.startDate, next.regularSeasonWindow.endDate)).toBeLessThan(0)
        // regularSeasonEnd < seasonEnd when there is a postseason
        expect(compareGameDates(next.regularSeasonWindow.endDate, next.seasonWindow.endDate)).toBeLessThan(0)
        // next season starts strictly after the previous season started
        expect(compareGameDates(next.seasonWindow.startDate, policy.seasonWindow.startDate)).toBeGreaterThan(0)
        // next season starts strictly after the previous season ended (no overlap)
        expect(compareGameDates(next.seasonWindow.startDate, policy.seasonWindow.endDate)).toBeGreaterThan(0)
        // no future edition reuses the reference 2025-26 edition's absolute regular-season dates
        expect(next.regularSeasonWindow.startDate).not.toBe(reference2025.regularSeasonWindow.startDate)
        expect(next.regularSeasonWindow.endDate).not.toBe(reference2025.regularSeasonWindow.endDate)

        policy = next
      }
    })
  })
})
