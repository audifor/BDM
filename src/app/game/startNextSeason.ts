import { addYears, formatGameDate } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import type { CompetitionCalendarPolicy, Season } from '@/domain/season'
import { createCompetition } from '@/domain/competition'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { generateNcaaLikeSchedule, generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { maintainAiTeamMinimumRosters } from '@/app/market'
import { getCurrentSeason } from './selectors'
import { buildNextCompetitionParticipants } from '@/engine/competition'
import { deriveNextEditionCalendarPolicy } from '@/engine/competition/WorldCompetitionCalendar'
import { ensureNcaaEligibility } from '@/engine/eligibility'
import { ensureNcaaAcademics } from '@/engine/academic'
import { rolloverBoardState } from '@/engine/board'

/** Starts the next edition of the world's current (user-facing) competition. */
export function startNextSeason(world: GameWorld): GameWorld {
  return startNextSeasonFor(world, getCurrentSeason(world).id)
}

/**
 * Starts the next edition of any Season's competition, independently of whether it is the
 * world's current (user-facing) one. Competition lifecycle capability is a property of the
 * GameWorld, not of which competition the user happens to be following: rolling a competition
 * forward NEVER moves `world.currentDate`, even when `seasonId` is the world's current season.
 * `GameWorld.currentDate` is the single universal clock and only ever advances via
 * `CalendarEngine.advanceDay` (one day at a time) or `simulateUntilDate` walking day by day --
 * never as a side effect of a competition's lifecycle transition. The next edition can (and
 * routinely will) have a `startDate` far in the future; the world does not jump to meet it.
 *
 * `world.currentSeasonId` is likewise left untouched here: it is a UI/gameplay-selection concern,
 * not a clock. It migrates to the new edition naturally, inside `CalendarEngine.advanceDay`, once
 * `currentDate` actually reaches the new edition's `startDate` -- see
 * `migrateCurrentSeasonIfElapsed` there. This keeps it valid for a completed
 * `CompetitionSeason A 2025-26` to coexist with a `SCHEDULED CompetitionSeason A 2026-27` while
 * `currentDate` is still anywhere in between (including still inside the old season's window).
 */
export function startNextSeasonFor(world: GameWorld, seasonId: Season['id']): GameWorld {
  const primary = world.seasons[seasonId]
  if (primary === undefined) throw new Error(`GameWorld has no Season: ${seasonId}`)
  if (!isSeasonComplete(world, primary.id)) throw new Error('Current season is not complete')
  if (getSeasonHistoryRecord(world, primary.id) === undefined) throw new Error('Current season requires a history record')
  const linkedEditions = linkedCompetitionEditions(world, primary)
  const nextIds = nextSeasonIds(world, linkedEditions.length + 1)
  const editionIds = new Map<string, string>([[primary.worldCompetitionFormat?.competitionSeasonId ?? String(primary.id), nextCompetitionSeasonId(primary.worldCompetitionFormat?.competitionSeasonId ?? String(primary.id), addYears(primary.startDate, 1))]])
  for (const linked of linkedEditions) {
    const previousId = linked.worldCompetitionFormat!.competitionSeasonId
    editionIds.set(previousId, nextCompetitionSeasonId(previousId, addYears(linked.startDate, 1)))
  }
  const nextParticipants = buildNextCompetitionParticipants(world, primary.id)
  const primaryRoundCount = regularSeasonRoundCount(world, primary, nextParticipants.length)
  const nextPrimaryCalendar = primary.calendarPolicy === undefined ? undefined : rollForwardCalendar(primary.calendarPolicy, editionIds, primaryRoundCount)
  const nextPrimary = createSeason({
    id: nextIds[0]!,
    competitionId: primary.competitionId,
    label: nextSeasonLabel(primary),
    startDate: nextPrimaryCalendar?.seasonWindow.startDate ?? addYears(primary.startDate, 1),
    endDate: nextPrimaryCalendar?.seasonWindow.endDate ?? addYears(primary.endDate, 1),
    participantTeamIds: nextParticipants,
    ...(primary.worldCompetitionFormat === undefined ? {} : { worldCompetitionFormat: rollForwardFormat(primary.worldCompetitionFormat, editionIds, nextSeasonLabel(primary)) }),
    ...(nextPrimaryCalendar === undefined ? {} : { calendarPolicy: nextPrimaryCalendar }),
  })
  const nextLinkedSeasons = linkedEditions.map((previous, index) => {
    // Linked editions here are bracket/cup-style competitions with no round-robin regular
    // season of their own (their "regular season window" is just their qualification/bracket
    // window), so they always use the simple year-shift, never round-count-driven derivation.
    const nextCalendar = previous.calendarPolicy === undefined ? undefined : rollForwardCalendar(previous.calendarPolicy, editionIds, undefined)
    return createSeason({
      ...previous,
      id: nextIds[index + 1]!,
      label: previous.worldCompetitionFormat?.seasonLabel === undefined ? nextSeasonLabel(previous) : incrementEditionLabel(previous.worldCompetitionFormat.seasonLabel),
      startDate: nextCalendar?.seasonWindow.startDate ?? addYears(previous.startDate, 1),
      endDate: nextCalendar?.seasonWindow.endDate ?? addYears(previous.endDate, 1),
      participantTeamIds: [],
      worldCompetitionFormat: rollForwardFormat(previous.worldCompetitionFormat!, editionIds, incrementEditionLabel(previous.worldCompetitionFormat!.seasonLabel)),
      ...(nextCalendar === undefined ? {} : { calendarPolicy: nextCalendar }),
    })
  })
  // Player development is a WORLD-LEVEL annual event (see CalendarEngine.advanceDay and
  // WorldAnnualDevelopmentCycle), never a Competition-lifecycle event: a rollover here only
  // resolves this competition's own season/calendar/schedule/participants.
  const rolledCompetitions = new Map(Object.values(world.competitions).map((competition) => [competition.id, competition] as const))
  for (const nextSeason of nextLinkedSeasons) {
    const competition = rolledCompetitions.get(nextSeason.competitionId)!
    rolledCompetitions.set(competition.id, createCompetition({ ...competition, participantTeamIds: [] }))
  }
  const staged = updateGameWorld(world, { seasons: [...Object.values(world.seasons), nextPrimary, ...nextLinkedSeasons], competitions: [...rolledCompetitions.values()] })
  const regularSeasonNodeKey = nextPrimary.worldCompetitionFormat?.variants.find((variant) => variant.isRealVariant)?.nodes.find((node) => node.role === 'REGULAR_SEASON')?.key
    ?? nextPrimary.worldCompetitionFormat?.variants[0]?.nodes.find((node) => node.role === 'REGULAR_SEASON')?.key
  const schedule = staged.ecosystems[staged.competitions[nextPrimary.competitionId]!.ecosystemId]!.kind === 'ncaaLike'
    ? generateNcaaLikeSchedule(staged, nextPrimary.id)
    : generateRoundRobinSchedule({ world: staged, seasonId: nextPrimary.id, ...(regularSeasonNodeKey === undefined ? {} : { competitionStageKey: regularSeasonNodeKey }) })
  const next = ensureNcaaAcademics(ensureNcaaEligibility(maintainAiTeamMinimumRosters(reconcileExpiredPlayerContracts(updateGameWorld(staged, { games: [...Object.values(staged.games), ...schedule] }), nextPrimary.startDate)).world))
  return Object.keys(next.boardStatesByTeamId).reduce((current, teamId) => rolloverBoardState(current, teamId as import('@/domain/ids').TeamId, nextPrimary.id), next)
}

function linkedCompetitionEditions(world: GameWorld, primary: Season): Season[] {
  const linkedIds = new Set(primary.calendarPolicy?.specialCompetitionWindows.map((window) => window.competitionSeasonId) ?? [])
  return Object.values(world.seasons).filter((season) => season.worldCompetitionFormat !== undefined && linkedIds.has(season.worldCompetitionFormat.competitionSeasonId))
}

function nextSeasonLabel(season: Season): string {
  return season.worldCompetitionFormat === undefined
    ? `${formatGameDate(addYears(season.startDate, 1))} to ${formatGameDate(addYears(season.endDate, 1))}`
    : incrementEditionLabel(season.worldCompetitionFormat.seasonLabel)
}

function incrementEditionLabel(label: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(label)
  return match === null ? label : `${Number(match[1]) + 1}-${String((Number(match[1]) + 2) % 100).padStart(2, '0')}`
}

function nextCompetitionSeasonId(previousId: string, nextStart: Season['startDate']): string {
  const match = /^(.*:)(\d{4})-(\d{2})$/.exec(previousId)
  return match === null
    ? `${previousId}:${nextStart.slice(0, 4)}`
    : `${match[1]}${Number(match[2]) + 1}-${String((Number(match[2]) + 2) % 100).padStart(2, '0')}`
}

function rollForwardFormat(format: WorldCompetitionFormatDocument, editionIds: ReadonlyMap<string, string>, seasonLabel: string): WorldCompetitionFormatDocument {
  const currentEditionId = format.competitionSeasonId
  return replaceEditionIds({ ...format, competitionSeasonId: editionIds.get(currentEditionId) ?? currentEditionId, seasonLabel }, editionIds) as WorldCompetitionFormatDocument
}

function replaceEditionIds(value: unknown, editionIds: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') return editionIds.get(value) ?? value
  if (Array.isArray(value)) return value.map((entry) => replaceEditionIds(entry, editionIds))
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replaceEditionIds(entry, editionIds)]))
  return value
}

/**
 * Rolls a CompetitionCalendarPolicy forward to its next edition. When `roundCount` is given
 * (a real round-robin regular season), the regular-season window's length is derived from the
 * cadence and round count via `deriveNextEditionCalendarPolicy` instead of being a fixed shift
 * of the reference edition's window -- this is what keeps every future edition's calendar
 * self-consistent regardless of how the aligned start date's weekday falls. When `roundCount` is
 * undefined (a bracket/cup-style linked edition with no round-robin regular season), the window
 * is simply shifted by one year, since there is no round-robin capacity to derive from.
 */
function rollForwardCalendar(calendar: CompetitionCalendarPolicy, editionIds: ReadonlyMap<string, string>, roundCount: number | undefined): CompetitionCalendarPolicy {
  const shiftWindow = (window: CompetitionCalendarPolicy['seasonWindow']) => ({ startDate: addYears(window.startDate, 1), endDate: addYears(window.endDate, 1) })
  const remapSpecialWindows = (windows: CompetitionCalendarPolicy['specialCompetitionWindows']) => windows.map((window) => ({ ...shiftWindow(window), competitionSeasonId: editionIds.get(window.competitionSeasonId) ?? nextCompetitionSeasonId(window.competitionSeasonId, addYears(calendar.seasonWindow.startDate, 1)) }))

  if (roundCount === undefined) {
    return {
      seasonWindow: shiftWindow(calendar.seasonWindow),
      regularSeasonWindow: shiftWindow(calendar.regularSeasonWindow),
      specialCompetitionWindows: remapSpecialWindows(calendar.specialCompetitionWindows),
      postseasonWindow: calendar.postseasonWindow === null ? null : shiftWindow(calendar.postseasonWindow),
      postseasonStageStartDates: Object.fromEntries(Object.entries(calendar.postseasonStageStartDates).map(([key, date]) => [key, addYears(date, 1)])),
      offseasonWindow: calendar.offseasonWindow === null ? null : shiftWindow(calendar.offseasonWindow),
      regularSeasonCadence: calendar.regularSeasonCadence,
      postseasonCadence: calendar.postseasonCadence,
    }
  }

  const derived = deriveNextEditionCalendarPolicy(calendar, roundCount)
  return { ...derived, specialCompetitionWindows: remapSpecialWindows(calendar.specialCompetitionWindows) }
}

function regularSeasonRoundCount(world: GameWorld, season: Season, participantCount: number): number {
  const meetingsPerPair = world.competitions[season.competitionId]!.rules.schedule.meetingsPerPair
  return (participantCount - 1) * meetingsPerPair
}

function nextSeasonIds(world: GameWorld, count: number) { let ordinal = 1; const ids = []; while (ids.length < count) { const id = seasonIdFromString(`generated-season-${ordinal.toString().padStart(4, '0')}`); if (world.seasons[id] === undefined) ids.push(id); ordinal += 1 } return ids }
