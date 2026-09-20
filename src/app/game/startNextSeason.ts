import { addDays, addYears, formatGameDate } from '@/domain/date'
import { seasonIdFromString } from '@/domain/ids'
import { createSeason } from '@/domain/season'
import type { CompetitionCalendarPolicy, Season } from '@/domain/season'
import { createCompetition } from '@/domain/competition'
import type { WorldCompetitionFormatDocument } from '@/domain/competition'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { generateNcaaLikeSchedule, generateRoundRobinSchedule } from '@/engine/competition/schedule'
import { getSeasonHistoryRecord, isSeasonComplete } from '@/engine/season'
import { applyOffseasonDevelopment } from '@/engine/development'
import { reconcileExpiredPlayerContracts } from '@/engine/market'
import { maintainAiTeamMinimumRosters } from '@/app/market'
import { getCurrentSeason } from './selectors'
import { buildNextCompetitionParticipants } from '@/engine/competition'
import { ensureNcaaEligibility } from '@/engine/eligibility'
import { ensureNcaaAcademics } from '@/engine/academic'
import { rolloverBoardState } from '@/engine/board'

/** Starts the next edition of the current competition without synchronizing others. */
export function startNextSeason(world: GameWorld): GameWorld {
  const primary = getCurrentSeason(world)
  if (!isSeasonComplete(world, primary.id)) throw new Error('Current season is not complete')
  if (getSeasonHistoryRecord(world, primary.id) === undefined) throw new Error('Current season requires a history record')
  const linkedEditions = linkedCompetitionEditions(world, primary)
  const nextIds = nextSeasonIds(world, linkedEditions.length + 1)
  const editionIds = new Map<string, string>([[primary.worldCompetitionFormat?.competitionSeasonId ?? String(primary.id), nextCompetitionSeasonId(primary.worldCompetitionFormat?.competitionSeasonId ?? String(primary.id), addYears(primary.startDate, 1))]])
  for (const linked of linkedEditions) {
    const previousId = linked.worldCompetitionFormat!.competitionSeasonId
    editionIds.set(previousId, nextCompetitionSeasonId(previousId, addYears(linked.startDate, 1)))
  }
  const nextPrimary = createSeason({
    id: nextIds[0]!,
    competitionId: primary.competitionId,
    label: nextSeasonLabel(primary),
    startDate: addYears(primary.startDate, 1),
    endDate: addYears(primary.endDate, 1),
    participantTeamIds: buildNextCompetitionParticipants(world, primary.id),
    ...(primary.worldCompetitionFormat === undefined ? {} : { worldCompetitionFormat: rollForwardFormat(primary.worldCompetitionFormat, editionIds, nextSeasonLabel(primary)) }),
    ...(primary.calendarPolicy === undefined ? {} : { calendarPolicy: rollForwardCalendar(primary.calendarPolicy, editionIds) }),
  })
  const nextLinkedSeasons = linkedEditions.map((previous, index) => createSeason({
    ...previous,
    id: nextIds[index + 1]!,
    label: previous.worldCompetitionFormat?.seasonLabel === undefined ? nextSeasonLabel(previous) : incrementEditionLabel(previous.worldCompetitionFormat.seasonLabel),
    startDate: addYears(previous.startDate, 1),
    endDate: addYears(previous.endDate, 1),
    participantTeamIds: [],
    worldCompetitionFormat: rollForwardFormat(previous.worldCompetitionFormat!, editionIds, incrementEditionLabel(previous.worldCompetitionFormat!.seasonLabel)),
    ...(previous.calendarPolicy === undefined ? {} : { calendarPolicy: rollForwardCalendar(previous.calendarPolicy, editionIds) }),
  }))
  const developed = applyOffseasonDevelopment(world, { fromSeasonId: primary.id, toSeasonId: nextPrimary.id, targetDate: nextPrimary.startDate }).world
  const rolledCompetitions = new Map(Object.values(developed.competitions).map((competition) => [competition.id, competition] as const))
  for (const nextSeason of nextLinkedSeasons) {
    const competition = rolledCompetitions.get(nextSeason.competitionId)!
    rolledCompetitions.set(competition.id, createCompetition({ ...competition, participantTeamIds: [] }))
  }
  const staged = updateGameWorld(developed, { currentDate: nextPrimary.startDate, currentSeasonId: nextPrimary.id, seasons: [...Object.values(developed.seasons), nextPrimary, ...nextLinkedSeasons], competitions: [...rolledCompetitions.values()] })
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

function rollForwardCalendar(calendar: CompetitionCalendarPolicy, editionIds: ReadonlyMap<string, string>): CompetitionCalendarPolicy {
  const shiftWindow = (window: CompetitionCalendarPolicy['seasonWindow']) => ({ startDate: addYears(window.startDate, 1), endDate: addYears(window.endDate, 1) })
  const seasonWindow = shiftWindow(calendar.seasonWindow)
  const shiftedRegularWindow = shiftWindow(calendar.regularSeasonWindow)
  const regularSeasonWindow = {
    ...shiftedRegularWindow,
    startDate: alignToPreferredWeekday(shiftedRegularWindow.startDate, seasonWindow.startDate, calendar.regularSeasonCadence.preferredWeekdays),
  }
  return {
    seasonWindow,
    regularSeasonWindow,
    specialCompetitionWindows: calendar.specialCompetitionWindows.map((window) => ({ ...shiftWindow(window), competitionSeasonId: editionIds.get(window.competitionSeasonId) ?? nextCompetitionSeasonId(window.competitionSeasonId, addYears(calendar.seasonWindow.startDate, 1)) })),
    postseasonWindow: calendar.postseasonWindow === null ? null : shiftWindow(calendar.postseasonWindow),
    postseasonStageStartDates: Object.fromEntries(Object.entries(calendar.postseasonStageStartDates).map(([key, date]) => [key, addYears(date, 1)])),
    offseasonWindow: calendar.offseasonWindow === null ? null : shiftWindow(calendar.offseasonWindow),
    regularSeasonCadence: calendar.regularSeasonCadence,
    postseasonCadence: calendar.postseasonCadence,
  }
}

function alignToPreferredWeekday(date: Season['startDate'], windowStart: Season['startDate'], preferredWeekdays: readonly number[]): Season['startDate'] {
  const weekday = (candidate: Season['startDate']) => new Date(`${candidate}T00:00:00.000Z`).getUTCDay()
  for (let offset = 0; offset <= 6; offset += 1) {
    const candidate = addDays(date, -offset)
    if (candidate >= windowStart && preferredWeekdays.includes(weekday(candidate))) return candidate
  }
  for (let offset = 1; offset <= 6; offset += 1) {
    const candidate = addDays(date, offset)
    if (preferredWeekdays.includes(weekday(candidate))) return candidate
  }
  return date
}

function nextSeasonIds(world: GameWorld, count: number) { let ordinal = 1; const ids = []; while (ids.length < count) { const id = seasonIdFromString(`generated-season-${ordinal.toString().padStart(4, '0')}`); if (world.seasons[id] === undefined) ids.push(id); ordinal += 1 } return ids }
