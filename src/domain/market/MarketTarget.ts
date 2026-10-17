import { parseGameDate, type GameDate } from '@/domain/date'
import type { PlayerId, TeamId } from '@/domain/ids'

export type MarketTargetPriority = 'LOW' | 'NORMAL' | 'HIGH'
export type MarketTargetStatus = 'ACTIVE' | 'ARCHIVED'
export type MarketTargetEventKind = 'ADDED' | 'PRIORITY_CHANGED' | 'NOTE_UPDATED' | 'ARCHIVED' | 'RESTORED'
export interface MarketTargetEvent {
  readonly date: GameDate
  readonly kind: MarketTargetEventKind
  readonly detail?: string
}

/** User-authored recruitment shortlist. No hidden ability, market truth or scouting estimates. */
export interface MarketTarget {
  readonly id: string
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly priority: MarketTargetPriority
  readonly status: MarketTargetStatus
  readonly note: string
  readonly createdOn: GameDate
  readonly reviewedOn: GameDate
  readonly history: readonly MarketTargetEvent[]
}

export function marketTargetId(teamId: TeamId, playerId: PlayerId): string {
  return `market-target:${teamId}:${playerId}`
}
export function createMarketTarget(input: MarketTarget): MarketTarget {
  if (input.id !== marketTargetId(input.teamId, input.playerId)) throw new TypeError('Invalid market target identifier')
  if (!['LOW', 'NORMAL', 'HIGH'].includes(input.priority)) throw new TypeError('Invalid market target priority')
  if (!['ACTIVE', 'ARCHIVED'].includes(input.status)) throw new TypeError('Invalid market target status')
  if (typeof input.note !== 'string' || input.note.length > 500) throw new TypeError('Market target note exceeds 500 characters')
  const createdOn = parseGameDate(input.createdOn)
  const reviewedOn = parseGameDate(input.reviewedOn)
  if (reviewedOn < createdOn) throw new RangeError('Market target review predates selection')
  const history = input.history.map((event) => {
    if (!['ADDED', 'PRIORITY_CHANGED', 'NOTE_UPDATED', 'ARCHIVED', 'RESTORED'].includes(event.kind)) throw new TypeError('Invalid market target history event')
    const date = parseGameDate(event.date)
    if (date < createdOn || date > reviewedOn) throw new RangeError('Invalid market target history chronology')
    if (event.detail !== undefined && (typeof event.detail !== 'string' || event.detail.length > 500)) throw new TypeError('Invalid market target history detail')
    return Object.freeze({ ...event, date })
  })
  if (history[0]?.kind !== 'ADDED' || history[0]?.date !== createdOn || history.some((event, index) => index > 0 && event.date < history[index - 1]!.date)) throw new TypeError('Invalid market target history')
  return Object.freeze({ ...input, createdOn, reviewedOn, note: input.note.trim(), history: Object.freeze(history) })
}
