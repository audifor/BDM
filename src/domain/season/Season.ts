import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { CompetitionId, SeasonId, TeamId } from '@/domain/ids'
import type { ConferenceMembership } from '@/domain/conference'
import { requireNonEmptyString } from '@/domain/validation'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'

export interface Season {
  readonly id: SeasonId
  readonly competitionId: CompetitionId
  readonly label: string
  readonly startDate: GameDate
  readonly endDate: GameDate
  readonly participantTeamIds?: readonly TeamId[]
  readonly conferenceMembershipSnapshot?: readonly ConferenceMembership[]
  /** Immutable B04 format for this edition; tournament progress is derived from its Games. */
  readonly worldCompetitionFormat?: WorldCompetitionFormatDocument
  readonly calendarPolicy?: CompetitionCalendarPolicy
}

export interface CalendarDateWindow {
  readonly startDate: GameDate
  readonly endDate: GameDate
}

export interface SpecialCompetitionWindow extends CalendarDateWindow {
  readonly competitionSeasonId: string
}

/** Stored season calendar configuration, independent from the competition's sporting format. */
export interface CompetitionCalendarPolicy {
  readonly seasonWindow: CalendarDateWindow
  readonly regularSeasonWindow: CalendarDateWindow
  readonly specialCompetitionWindows: readonly SpecialCompetitionWindow[]
  readonly postseasonWindow: CalendarDateWindow | null
  readonly postseasonStageStartDates: Readonly<Record<string, GameDate>>
  readonly offseasonWindow: CalendarDateWindow | null
  readonly regularSeasonCadence: {
    readonly preferredWeekdays: readonly number[]
    readonly midweekWeekdays: readonly number[]
    readonly midweekRoundNumbers: readonly number[]
    readonly weeklyCadenceDays: number
    readonly minimumRestDays: number
    readonly breakDaysAfterRound: Readonly<Record<number, number>>
  }
  readonly postseasonCadence: {
    readonly daysBetweenGames: number
    readonly daysBetweenRounds: number
  }
}

export interface CreateSeasonInput {
  id: SeasonId
  competitionId: CompetitionId
  label: string
  startDate: GameDate
  endDate: GameDate
  participantTeamIds?: readonly TeamId[]
  conferenceMembershipSnapshot?: readonly ConferenceMembership[]
  worldCompetitionFormat?: WorldCompetitionFormatDocument
  calendarPolicy?: CompetitionCalendarPolicy
}

export function createSeason(input: CreateSeasonInput): Season {
  const startDate = parseGameDate(input.startDate)
  const endDate = parseGameDate(input.endDate)
  if (input.worldCompetitionFormat !== undefined && input.worldCompetitionFormat.competitionId !== input.competitionId) {
    throw new RangeError('Season competition format must belong to the same Competition')
  }

  if (compareGameDates(startDate, endDate) > 0) {
    throw new RangeError('Season start date must not be after end date')
  }

  return Object.freeze({
    id: requireNonEmptyString(input.id, 'Season id') as SeasonId,
    competitionId: requireNonEmptyString(input.competitionId, 'Season competition id') as CompetitionId,
    label: requireNonEmptyString(input.label, 'Season label'),
    startDate,
    endDate,
    ...(input.participantTeamIds === undefined ? {} : { participantTeamIds: Object.freeze([...new Set(input.participantTeamIds)]) }),
    ...(input.conferenceMembershipSnapshot === undefined ? {} : { conferenceMembershipSnapshot: Object.freeze(input.conferenceMembershipSnapshot.map((membership) => ({ ...membership }))) }),
    ...(input.worldCompetitionFormat === undefined ? {} : { worldCompetitionFormat: input.worldCompetitionFormat }),
    ...(input.calendarPolicy === undefined ? {} : { calendarPolicy: createCalendarPolicy(input.calendarPolicy, startDate, endDate) }),
  })
}

function createCalendarPolicy(value: CompetitionCalendarPolicy, startDate: GameDate, endDate: GameDate): CompetitionCalendarPolicy {
  const seasonWindow = createWindow(value.seasonWindow, 'seasonWindow')
  if (seasonWindow.startDate !== startDate || seasonWindow.endDate !== endDate) throw new RangeError('Calendar seasonWindow must match the Season dates')
  const regularSeasonWindow = createWindow(value.regularSeasonWindow, 'regularSeasonWindow')
  if (!within(regularSeasonWindow, seasonWindow)) throw new RangeError('RegularSeasonWindow must fit within SeasonWindow')
  const specialCompetitionWindows = value.specialCompetitionWindows.map((window) => {
    const dates = createWindow(window, 'specialCompetitionWindow')
    if (!window.competitionSeasonId.trim()) throw new TypeError('SpecialCompetitionWindow requires a competitionSeasonId')
    if (!within(dates, seasonWindow)) throw new RangeError('SpecialCompetitionWindow must fit within SeasonWindow')
    return Object.freeze({ ...dates, competitionSeasonId: window.competitionSeasonId })
  })
  const postseasonWindow = value.postseasonWindow === null ? null : createWindow(value.postseasonWindow, 'postseasonWindow')
  if (postseasonWindow !== null && !within(postseasonWindow, seasonWindow)) throw new RangeError('PostseasonWindow must fit within SeasonWindow')
  const offseasonWindow = value.offseasonWindow === null ? null : createWindow(value.offseasonWindow, 'offseasonWindow')
  const postseasonStageStartDates = Object.freeze(Object.fromEntries(Object.entries(value.postseasonStageStartDates).map(([key, date]) => [key, parseGameDate(date)])))
  if (postseasonWindow !== null && Object.values(postseasonStageStartDates).some((date) => date < postseasonWindow.startDate || date > postseasonWindow.endDate)) throw new RangeError('Postseason stage start must fit within PostseasonWindow')
  const cadence = value.regularSeasonCadence
  validateInteger(cadence.weeklyCadenceDays, 'weeklyCadenceDays', 1)
  validateInteger(cadence.minimumRestDays, 'minimumRestDays', 1)
  const preferredWeekdays = weekdays(cadence.preferredWeekdays, 'preferredWeekdays')
  const midweekWeekdays = weekdays(cadence.midweekWeekdays, 'midweekWeekdays')
  const midweekRoundNumbers = uniquePositiveIntegers(cadence.midweekRoundNumbers, 'midweekRoundNumbers')
  const breakDaysAfterRound = Object.freeze(Object.fromEntries(Object.entries(cadence.breakDaysAfterRound).map(([round, days]) => {
    const roundNumber = Number(round)
    validateInteger(roundNumber, 'breakAfterRound', 1)
    validateInteger(days, 'breakDays', 1)
    return [roundNumber, days]
  })))
  validateInteger(value.postseasonCadence.daysBetweenGames, 'daysBetweenGames', 1)
  validateInteger(value.postseasonCadence.daysBetweenRounds, 'daysBetweenRounds', 0)
  return Object.freeze({
    seasonWindow,
    regularSeasonWindow,
    specialCompetitionWindows: Object.freeze(specialCompetitionWindows),
    postseasonWindow,
    postseasonStageStartDates,
    offseasonWindow,
    regularSeasonCadence: Object.freeze({ preferredWeekdays, midweekWeekdays, midweekRoundNumbers, weeklyCadenceDays: cadence.weeklyCadenceDays, minimumRestDays: cadence.minimumRestDays, breakDaysAfterRound }),
    postseasonCadence: Object.freeze({ ...value.postseasonCadence }),
  })
}

function createWindow(value: CalendarDateWindow, label: string): CalendarDateWindow {
  const window = Object.freeze({ startDate: parseGameDate(value.startDate), endDate: parseGameDate(value.endDate) })
  if (window.startDate > window.endDate) throw new RangeError(`${label} starts after it ends`)
  return window
}

function within(inner: CalendarDateWindow, outer: CalendarDateWindow): boolean {
  return inner.startDate >= outer.startDate && inner.endDate <= outer.endDate
}

function weekdays(values: readonly number[], label: string): readonly number[] {
  if (values.length === 0 || values.some((value) => !Number.isInteger(value) || value < 0 || value > 6) || new Set(values).size !== values.length) throw new RangeError(`${label} must contain unique weekdays from 0 to 6`)
  return Object.freeze([...values])
}

function uniquePositiveIntegers(values: readonly number[], label: string): readonly number[] {
  if (values.some((value) => !Number.isInteger(value) || value < 1) || new Set(values).size !== values.length) throw new RangeError(`${label} must contain unique positive integers`)
  return Object.freeze([...values])
}

function validateInteger(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${label} must be an integer of at least ${minimum}`)
}
