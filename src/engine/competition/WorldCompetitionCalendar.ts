import { addDays, addYears, compareGameDates, type GameDate } from '@/domain/date'
import type { WorldCompetitionFormatDocument, WorldCompetitionFormatNode, WorldCompetitionFormatVariant } from '@/domain/competition'
import type { CompetitionCalendarPolicy } from '@/domain/season'
import { scheduleRoundsByCalendar } from './schedule/SchedulePolicy'

export interface CompetitionSeasonWindows {
  readonly regularSeasonStart: GameDate
  readonly regularSeasonEnd: GameDate
  readonly postseasonStart: GameDate | null
  readonly seasonEnd: GameDate
  readonly postseasonStartByNodeKey: Readonly<Record<string, GameDate>>
  readonly postseasonDaysBetweenGames: number
}

/** Reserves the maximum configured playoff game days inside a season's overall calendar window. */
export function deriveCompetitionSeasonWindows(
  seasonStart: GameDate,
  seasonEnd: GameDate,
  format?: WorldCompetitionFormatDocument,
  calendarPolicy?: CompetitionCalendarPolicy,
): CompetitionSeasonWindows {
  if (compareGameDates(seasonStart, seasonEnd) > 0) throw new RangeError('Competition season starts after it ends')
  if (calendarPolicy !== undefined) {
    const postseasonStart = calendarPolicy.postseasonWindow?.startDate ?? Object.values(calendarPolicy.postseasonStageStartDates).sort()[0] ?? null
    return Object.freeze({
      regularSeasonStart: calendarPolicy.regularSeasonWindow.startDate,
      regularSeasonEnd: calendarPolicy.regularSeasonWindow.endDate,
      postseasonStart,
      seasonEnd,
      postseasonStartByNodeKey: calendarPolicy.postseasonStageStartDates,
      postseasonDaysBetweenGames: calendarPolicy.postseasonCadence.daysBetweenGames,
    })
  }
  if (format === undefined) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}), postseasonDaysBetweenGames: 1 })

  const variant = requireCompetitionFormatVariant(format)
  const regularNode = variant.nodes.find((node) => node.role === 'REGULAR_SEASON')
  if (regularNode === undefined) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}), postseasonDaysBetweenGames: 1 })

  const postseasonKeys = reachableNodes(regularNode.key, variant)
  postseasonKeys.delete(regularNode.key)
  if (postseasonKeys.size === 0) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}), postseasonDaysBetweenGames: 1 })

  const ordered = topologicalNodes(variant)
  const durations = new Map<string, number>()
  for (const node of variant.nodes) {
    if (!postseasonKeys.has(node.key)) continue
    const duration = maxGameDays(node)
    if (duration > 0) durations.set(node.key, duration)
  }
  if (durations.size === 0) return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd: seasonEnd, postseasonStart: null, seasonEnd, postseasonStartByNodeKey: Object.freeze({}), postseasonDaysBetweenGames: 1 })

  const startOffsets = new Map<string, number>()
  const endOffsets = new Map<string, number>()
  for (const node of ordered) {
    if (!durations.has(node.key)) continue
    const incoming = variant.edges.filter((edge) => edge.to === node.key && durations.has(edge.from))
    const startOffset = incoming.length === 0 ? 0 : Math.max(...incoming.map((edge) => (endOffsets.get(edge.from) ?? 0) + 1))
    startOffsets.set(node.key, startOffset)
    endOffsets.set(node.key, startOffset + durations.get(node.key)! - 1)
  }
  const reserveDays = Math.max(...endOffsets.values()) + 1
  const regularSeasonEnd = addDays(seasonEnd, -reserveDays)
  if (compareGameDates(regularSeasonEnd, seasonStart) < 0) throw new RangeError('Competition season window cannot fit regular season and configured postseason')
  const postseasonStart = addDays(regularSeasonEnd, 1)
  const postseasonStartByNodeKey = Object.fromEntries([...startOffsets].map(([nodeKey, offset]) => [nodeKey, addDays(postseasonStart, offset)]))
  return Object.freeze({ regularSeasonStart: seasonStart, regularSeasonEnd, postseasonStart, seasonEnd, postseasonStartByNodeKey: Object.freeze(postseasonStartByNodeKey), postseasonDaysBetweenGames: 1 })
}

/**
 * Derives a following edition's CompetitionCalendarPolicy from the previous edition and the
 * new edition's actual round count, instead of shifting the previous edition's already-aligned
 * absolute dates by a fixed calendar year. The regular-season window's length is computed by
 * running the real scheduling algorithm against the aligned start date, so the window always has
 * exactly the capacity the cadence and round count require -- it can never be too short because a
 * weekday-alignment slip pushed the start date later than the reference edition's start date.
 * Postseason and offseason windows keep the previous edition's relative durations, shifted to
 * begin immediately after the newly derived regular-season end.
 */
export function deriveNextEditionCalendarPolicy(
  previous: CompetitionCalendarPolicy,
  roundCount: number,
): CompetitionCalendarPolicy {
  // The next edition can never start before the previous one actually ends: a long-running
  // previous offseason (itself possibly extended by a regular-season weekday slip) must push
  // the following edition's start forward too, rather than colliding with a fixed anniversary
  // date computed only from the previous edition's own start date.
  const seasonWindowStart = laterOf(addYears(previous.seasonWindow.startDate, 1), addDays(previous.seasonWindow.endDate, 1))
  const regularSeasonStart = alignToPreferredWeekday(
    addYears(previous.regularSeasonWindow.startDate, 1),
    seasonWindowStart,
    previous.regularSeasonCadence.preferredWeekdays,
  )
  // A generous ceiling only bounds the search; the real end date is wherever round `roundCount`
  // actually lands, never a fixed offset from the reference edition's window.
  const searchCeiling = addDays(regularSeasonStart, (roundCount + 8) * 7 + totalBreakDays(previous.regularSeasonCadence.breakDaysAfterRound, roundCount))
  const shiftedBlackouts = previous.specialCompetitionWindows.map((window) => ({ ...shiftWindow(window, 1), competitionSeasonId: window.competitionSeasonId }))
  const placedRounds = scheduleRoundsByCalendar(roundCount, regularSeasonStart, searchCeiling, {
    ...previous,
    regularSeasonWindow: { startDate: regularSeasonStart, endDate: searchCeiling },
    specialCompetitionWindows: shiftedBlackouts,
  })
  const regularSeasonEnd = placedRounds.at(-1)!

  // Postseason/offseason are anchored directly off the real regularSeasonEnd (never a drift
  // estimate) so a postseason window can never overlap or collide with the last regular-season
  // round, however much the aligned start date slipped. Each stage/window keeps the same
  // duration and gaps the previous edition had, just re-based to start right after this
  // edition's actual regular-season end.
  const postseasonGapDays = previous.postseasonWindow === null ? 0 : calendarDaysBetween(previous.regularSeasonWindow.endDate, previous.postseasonWindow.startDate) - 1
  const postseasonSpanDays = previous.postseasonWindow === null ? 0 : calendarDaysBetween(previous.postseasonWindow.startDate, previous.postseasonWindow.endDate)
  const postseasonStart = addDays(regularSeasonEnd, 1 + Math.max(postseasonGapDays, 0))
  const postseasonWindow = previous.postseasonWindow === null ? null : { startDate: postseasonStart, endDate: addDays(postseasonStart, postseasonSpanDays) }

  const postseasonStageStartDates = Object.freeze(Object.fromEntries(Object.entries(previous.postseasonStageStartDates).map(([key, date]) => {
    const offsetFromPostseasonStart = previous.postseasonWindow === null ? 0 : calendarDaysBetween(previous.postseasonWindow.startDate, date)
    return [key, addDays(postseasonStart, Math.max(offsetFromPostseasonStart, 0))]
  })))

  const offseasonGapDays = previous.postseasonWindow === null || previous.offseasonWindow === null ? 0 : calendarDaysBetween(previous.postseasonWindow.endDate, previous.offseasonWindow.startDate) - 1
  const offseasonSpanDays = previous.offseasonWindow === null ? 0 : calendarDaysBetween(previous.offseasonWindow.startDate, previous.offseasonWindow.endDate)
  const offseasonStart = previous.offseasonWindow === null ? undefined : addDays(postseasonWindow?.endDate ?? regularSeasonEnd, 1 + Math.max(offseasonGapDays, 0))
  const offseasonWindow = offseasonStart === undefined ? null : { startDate: offseasonStart, endDate: addDays(offseasonStart, offseasonSpanDays) }

  const seasonWindowEnd = offseasonWindow?.endDate ?? postseasonWindow?.endDate ?? regularSeasonEnd

  return Object.freeze({
    seasonWindow: { startDate: seasonWindowStart, endDate: seasonWindowEnd },
    regularSeasonWindow: { startDate: regularSeasonStart, endDate: regularSeasonEnd },
    specialCompetitionWindows: shiftedBlackouts,
    postseasonWindow,
    postseasonStageStartDates: Object.freeze(postseasonStageStartDates),
    offseasonWindow,
    regularSeasonCadence: previous.regularSeasonCadence,
    postseasonCadence: previous.postseasonCadence,
  })
}

function shiftWindow<T extends { readonly startDate: GameDate; readonly endDate: GameDate }>(window: T, years: number): { startDate: GameDate; endDate: GameDate } {
  return { startDate: addYears(window.startDate, years), endDate: addYears(window.endDate, years) }
}

function totalBreakDays(breakDaysAfterRound: Readonly<Record<number, number>>, roundCount: number): number {
  return Object.entries(breakDaysAfterRound).filter(([round]) => Number(round) <= roundCount).reduce((total, [, days]) => total + days, 0)
}

function laterOf(a: GameDate, b: GameDate): GameDate {
  return compareGameDates(a, b) >= 0 ? a : b
}

function calendarDaysBetween(from: GameDate, to: GameDate): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  return Math.round((Date.UTC(toYear!, toMonth! - 1, toDay!) - Date.UTC(fromYear!, fromMonth! - 1, fromDay!)) / 86_400_000)
}

function alignToPreferredWeekday(date: GameDate, windowStart: GameDate, preferredWeekdays: readonly number[]): GameDate {
  const weekday = (candidate: GameDate) => new Date(`${candidate}T00:00:00.000Z`).getUTCDay()
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

export function requireCompetitionFormatVariant(format: WorldCompetitionFormatDocument): WorldCompetitionFormatVariant {
  if (format.status !== 'COMPLETE') throw new Error(`Competition format is not executable: ${format.competitionSeasonId}`)
  const variant = format.variants.find((candidate) => candidate.isRealVariant) ?? format.variants[0]
  if (variant === undefined) throw new Error(`Competition format has no variant: ${format.competitionSeasonId}`)
  return variant
}

function maxGameDays(node: WorldCompetitionFormatNode): number {
  if (node.contest?.formatType === 'SERIES') {
    if (node.contest.bestOf === undefined || node.contest.winsRequired !== Math.floor(node.contest.bestOf / 2) + 1) throw new Error(`Postseason SERIES node ${node.key} requires a valid best-of rule`)
    return node.contest.bestOf
  }
  if (node.contest?.formatType === 'SINGLE_GAME') return 1
  if (node.contest?.formatType === 'AGGREGATE') {
    if (node.contest.legCount === undefined) throw new Error(`Postseason AGGREGATE node ${node.key} requires a leg count`)
    return node.contest.legCount
  }
  if (['ROUND', 'SERIES', 'BRACKET'].includes(node.nodeType)) throw new Error(`Postseason node ${node.key} requires an executable contest format`)
  return 0
}

function reachableNodes(start: string, variant: WorldCompetitionFormatVariant): Set<string> {
  const reached = new Set([start])
  const pending = [start]
  while (pending.length > 0) {
    const current = pending.shift()!
    for (const edge of variant.edges.filter((candidate) => candidate.from === current)) {
      if (reached.has(edge.to)) continue
      reached.add(edge.to)
      pending.push(edge.to)
    }
  }
  return reached
}

function topologicalNodes(variant: WorldCompetitionFormatVariant): readonly WorldCompetitionFormatNode[] {
  const byKey = new Map(variant.nodes.map((node) => [node.key, node] as const))
  const indegree = new Map(variant.nodes.map((node): [string, number] => [node.key, 0]))
  const outgoing = new Map<string, string[]>()
  for (const edge of variant.edges) {
    if (!byKey.has(edge.from) || !byKey.has(edge.to)) throw new Error(`Competition format has unknown progression node: ${edge.from}->${edge.to}`)
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to])
    indegree.set(edge.to, indegree.get(edge.to)! + 1)
  }
  const ready = variant.nodes.filter((node) => indegree.get(node.key) === 0).map((node) => node.key)
  const result: WorldCompetitionFormatNode[] = []
  while (ready.length > 0) {
    const key = ready.shift()!
    result.push(byKey.get(key)!)
    for (const next of outgoing.get(key) ?? []) {
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) ready.push(next)
    }
  }
  if (result.length !== variant.nodes.length) throw new Error('Competition format progression graph is cyclic')
  return result
}
