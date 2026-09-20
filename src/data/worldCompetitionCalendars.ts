import { addYears, parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionCalendarPolicy } from '@/domain/season'

const SPAIN_CUP_COMPETITION_SEASON_ID = 'edition:ESP:copa-del-rey:2025-26'

/** Calendar inputs for the initial RealWorldSpain edition; the engine only consumes the policy. */
export const SPAIN_ACB_2025_26_CALENDAR: CompetitionCalendarPolicy = Object.freeze({
  seasonWindow: { startDate: parseGameDate('2025-10-01'), endDate: parseGameDate('2026-06-30') },
  regularSeasonWindow: { startDate: parseGameDate('2025-10-04'), endDate: parseGameDate('2026-05-30') },
  specialCompetitionWindows: [{ competitionSeasonId: SPAIN_CUP_COMPETITION_SEASON_ID, startDate: parseGameDate('2026-02-19'), endDate: parseGameDate('2026-02-22') }],
  postseasonWindow: { startDate: parseGameDate('2026-06-02'), endDate: parseGameDate('2026-06-28') },
  postseasonStageStartDates: {
    QUARTERFINALS: parseGameDate('2026-06-02'),
    SEMIFINALS: parseGameDate('2026-06-09'),
    FINAL: parseGameDate('2026-06-20'),
  },
  offseasonWindow: { startDate: parseGameDate('2026-07-01'), endDate: parseGameDate('2026-09-30') },
  regularSeasonCadence: {
    preferredWeekdays: [6],
    midweekWeekdays: [2],
    midweekRoundNumbers: [31],
    weeklyCadenceDays: 7,
    minimumRestDays: 3,
    breakDaysAfterRound: { 20: 14 },
  },
  postseasonCadence: { daysBetweenGames: 2, daysBetweenRounds: 3 },
})

export function spainAcbCalendarForStartYear(startYear: number): CompetitionCalendarPolicy {
  if (!Number.isInteger(startYear) || startYear < 1) throw new RangeError('Season start year must be a positive integer')
  const yearOffset = startYear - 2025
  const shift = (date: GameDate) => addYears(date, yearOffset)
  const base = SPAIN_ACB_2025_26_CALENDAR
  const cupEdition = `edition:ESP:copa-del-rey:${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
  return Object.freeze({
    seasonWindow: { startDate: shift(base.seasonWindow.startDate), endDate: shift(base.seasonWindow.endDate) },
    regularSeasonWindow: { startDate: shift(base.regularSeasonWindow.startDate), endDate: shift(base.regularSeasonWindow.endDate) },
    specialCompetitionWindows: [{ competitionSeasonId: cupEdition, startDate: shift(base.specialCompetitionWindows[0]!.startDate), endDate: shift(base.specialCompetitionWindows[0]!.endDate) }],
    postseasonWindow: { startDate: shift(base.postseasonWindow!.startDate), endDate: shift(base.postseasonWindow!.endDate) },
    postseasonStageStartDates: Object.fromEntries(Object.entries(base.postseasonStageStartDates).map(([key, date]) => [key, shift(date)])),
    offseasonWindow: { startDate: shift(base.offseasonWindow!.startDate), endDate: shift(base.offseasonWindow!.endDate) },
    regularSeasonCadence: base.regularSeasonCadence,
    postseasonCadence: base.postseasonCadence,
  })
}

export function spainCopaCalendarForStartYear(startYear: number): CompetitionCalendarPolicy {
  const league = spainAcbCalendarForStartYear(startYear)
  const window = league.specialCompetitionWindows[0]!
  const starts = Object.fromEntries(Object.entries({ QUARTERFINALS: '2026-02-19', SEMIFINALS: '2026-02-21', FINAL: '2026-02-22' }).map(([key, date]) => [key, addYears(parseGameDate(date), startYear - 2025)]))
  return Object.freeze({
    seasonWindow: { startDate: window.startDate, endDate: window.endDate },
    regularSeasonWindow: { startDate: window.startDate, endDate: window.endDate },
    specialCompetitionWindows: [],
    postseasonWindow: { startDate: window.startDate, endDate: window.endDate },
    postseasonStageStartDates: starts,
    offseasonWindow: null,
    regularSeasonCadence: { preferredWeekdays: [4, 5, 6, 0], midweekWeekdays: [4, 5, 6, 0], midweekRoundNumbers: [], weeklyCadenceDays: 1, minimumRestDays: 1, breakDaysAfterRound: {} },
    postseasonCadence: { daysBetweenGames: 1, daysBetweenRounds: 1 },
  })
}

export function spainAcbCompetitionSeasonId(startYear: number): string {
  return `edition:ESP:liga-endesa:${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}

export function spainCopaCompetitionSeasonId(startYear: number): string {
  return `edition:ESP:copa-del-rey:${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`
}
