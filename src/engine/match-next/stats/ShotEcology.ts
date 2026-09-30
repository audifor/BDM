import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { activePossession, type MatchNextEvent, type MatchState } from '../state'

/**
 * BT4E/F: shot ecology. Both labels are DERIVED from facts (where the shooter is, what he did in the last seconds); they are never
 * chosen before the action and never stored in the state. They label the `shotReleased` event so audits and the decision model can
 * talk about the same thing.
 */
export type ShotZone = 'RESTRICTED' | 'RIM' | 'SHORT_PAINT' | 'FLOATER_RANGE' | 'MIDRANGE' | 'LONG_MIDRANGE' | 'CORNER_THREE' | 'ABOVE_BREAK_THREE' | 'DEEP'

export const SHOT_ZONES: readonly ShotZone[] = ['RESTRICTED', 'RIM', 'SHORT_PAINT', 'FLOATER_RANGE', 'MIDRANGE', 'LONG_MIDRANGE', 'CORNER_THREE', 'ABOVE_BREAK_THREE', 'DEEP']

const RESTRICTED_METERS = 1.25
const RIM_METERS = 2.2
const SHORT_PAINT_METERS = 3.3
const FLOATER_METERS = 4.6
const MIDRANGE_METERS = 5.9
/** Beyond this a three is not a shot anyone designs: it is an emergency (clock, or an open floor). */
const DEEP_METERS = 8.6
const CORNER_STRIP_METERS = 1.7
const CORNER_MAX_DEPTH_METERS = 4.6

export function shotZone(position: CourtPosition, basket: CourtPosition, points: 2 | 3, court: MatchState['court']): ShotZone {
  const distance = distanceBetween(position, basket)
  if (points === 3) {
    if (distance >= DEEP_METERS) return 'DEEP'
    const sideline = Math.min(position.y, court.widthMeters - position.y)
    const alongCourt = Math.abs(position.x - basket.x)
    return sideline <= CORNER_STRIP_METERS && alongCourt <= CORNER_MAX_DEPTH_METERS ? 'CORNER_THREE' : 'ABOVE_BREAK_THREE'
  }
  if (distance <= RESTRICTED_METERS) return 'RESTRICTED'
  if (distance <= RIM_METERS) return 'RIM'
  if (distance <= SHORT_PAINT_METERS) return 'SHORT_PAINT'
  if (distance <= FLOATER_METERS) return 'FLOATER_RANGE'
  if (distance <= MIDRANGE_METERS) return 'MIDRANGE'
  return 'LONG_MIDRANGE'
}

export type ShotCreation = 'PUTBACK' | 'TRANSITION' | 'CUT_FINISH' | 'KICK_OUT' | 'PR_ROLLER' | 'PR_HANDLER' | 'DRIVE_FINISH' | 'FLOATER' | 'PULL_UP' | 'CATCH_AND_SHOOT' | 'LATE_CLOCK'

export const SHOT_CREATIONS: readonly ShotCreation[] = ['PUTBACK', 'TRANSITION', 'CUT_FINISH', 'KICK_OUT', 'PR_ROLLER', 'PR_HANDLER', 'DRIVE_FINISH', 'FLOATER', 'PULL_UP', 'CATCH_AND_SHOOT', 'LATE_CLOCK']

const CATCH_WINDOW_TICKS = 16
const PUTBACK_WINDOW_TICKS = 30
const SCREEN_WINDOW_TICKS = 45
const DRIVE_FINISH_WINDOW_TICKS = 16
const CUT_WINDOW_TICKS = 30
const LATE_CLOCK_SECONDS = 4
const EARLY_OFFENSE_TICKS = 60

function recent(events: readonly MatchNextEvent[], sinceT: number, test: (event: MatchNextEvent) => boolean): MatchNextEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!
    if (event.t < sinceT) return undefined
    if (test(event)) return event
  }
  return undefined
}

/**
 * What created this shot, from what the shooter did in the seconds before it. The order is a priority: the first thing that explains
 * the shot names it (a putback is a putback even in transition).
 */
export function classifyShotCreation(state: MatchState, shooterId: PlayerId, position: CourtPosition, basket: CourtPosition, options: { readonly stopKind?: 'PULL_UP' | 'FLOATER' } = {}): ShotCreation {
  const events = state.events
  const distance = distanceBetween(position, basket)
  const mine = (event: MatchNextEvent): boolean => event.playerId === shooterId
  if (distance <= 3.4 && recent(events, state.t - PUTBACK_WINDOW_TICKS, (event) => event.type === 'reboundSecured' && event.reboundType === 'offensive' && mine(event)) !== undefined) return 'PUTBACK'
  const possession = activePossession(state)
  // Early offense: the shot comes in the first seconds of the possession, before the defense has had time to set (whatever the set-up).
  if (possession !== undefined && possession.startReason !== 'periodStart' && state.t - possession.startedT <= EARLY_OFFENSE_TICKS) return 'TRANSITION'
  const caught = recent(events, state.t - CATCH_WINDOW_TICKS, (event) => event.type === 'passReceived' && event.receiverPlayerId === shooterId)
  if (caught !== undefined && distance <= 3.2 && recent(events, state.t - CUT_WINDOW_TICKS, (event) => event.type === 'offBallMove' && mine(event) && (event.ballReason === 'BASKET_CUT' || event.ballReason === 'BACKDOOR_CUT')) !== undefined) return 'CUT_FINISH'
  if (caught !== undefined && state.actions.some((action) => action.kind === 'KICK_OUT' && action.targetPlayerId === shooterId && action.resolvedT !== undefined && state.t - action.resolvedT <= CATCH_WINDOW_TICKS)) return 'KICK_OUT'
  const screenUsed = recent(events, state.t - SCREEN_WINDOW_TICKS, (event) => event.type === 'screenUsed')
  if (screenUsed !== undefined && screenUsed.receiverPlayerId === shooterId && caught !== undefined) return 'PR_ROLLER'
  if (screenUsed !== undefined && screenUsed.playerId === shooterId) return 'PR_HANDLER'
  if (options.stopKind === 'FLOATER') return 'FLOATER'
  if (options.stopKind === 'PULL_UP') return 'PULL_UP'
  if (distance <= 3.6 && state.actions.some((action) => action.kind === 'DRIVE' && action.playerId === shooterId && action.status === 'COMPLETED' && action.resolvedT !== undefined && state.t - action.resolvedT <= DRIVE_FINISH_WINDOW_TICKS)) return 'DRIVE_FINISH'
  if (caught !== undefined) return 'CATCH_AND_SHOOT'
  if (state.shotClockTenths !== null && state.shotClockTenths <= LATE_CLOCK_SECONDS * 10) return 'LATE_CLOCK'
  return 'PULL_UP'
}
