import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import { activePossession, type MatchState } from '../state'

/** The catch-to-release time within which a pass is still credited with the shot (2.2 s). */
const ASSIST_WINDOW_TICKS = 22
/** A dribble creation longer than this (1.2 s) means the scorer made the shot himself. */
const ASSIST_MAX_DRIBBLE_TICKS = 12
/** The pass must have improved on the shot the passer had himself by at least this much (expected points). */
const ASSIST_MIN_GAIN_POINTS = 0.02

/**
 * BT3R: an assist is the pass that CREATED the shot, not simply the last pass before it. It counts when the scorer caught it in
 * the same possession, shot within a short window without creating the shot off a long dribble, and the passer chose the pass
 * because it was worth more than his own shot (the decision utilities recorded on the pass decision say so).
 */
export function deriveAssistPasserId(state: MatchState, shooterId: PlayerId): PlayerId | undefined {
  const possession = activePossession(state)
  const shooter = state.players.find((player) => player.playerId === shooterId)
  if (!shooter) return undefined
  const pass = [...state.actions].reverse().find((action) => (action.kind === 'PASS' || action.kind === 'KICK_OUT') && action.status === 'COMPLETED'
    && action.outcome === 'CAUGHT' && action.targetPlayerId === shooterId && action.teamId === shooter.teamId
    && (possession === undefined || action.startedT >= possession.startedT))
  if (pass === undefined || pass.resolvedT === undefined) return undefined
  const shot = [...state.actions].reverse().find((action) => (action.kind === 'SHOOT' || action.kind === 'CATCH_AND_SHOOT') && action.playerId === shooterId && action.startedT >= pass.resolvedT!)
  if (shot === undefined || shot.startedT - pass.resolvedT > ASSIST_WINDOW_TICKS) return undefined
  const longDribble = state.actions.some((action) => action.kind === 'DRIVE' && action.playerId === shooterId && action.startedT >= pass.resolvedT!
    && (action.resolvedT ?? state.t) - action.startedT > ASSIST_MAX_DRIBBLE_TICKS)
  if (longDribble) return undefined
  const decision = pass.decisionId === undefined ? undefined : [...state.events].reverse().find((event) => event.type === 'decisionSelected' && event.decisionId === pass.decisionId)
  if (decision?.utility !== undefined && decision.utility.pass < decision.utility.shoot + ASSIST_MIN_GAIN_POINTS) return undefined
  return pass.playerId
}

export function emitAssistIfEarned(state: MatchState, shooterId: PlayerId): MatchState {
  const passerId = deriveAssistPasserId(state, shooterId)
  if (passerId === undefined) return state
  const passer = state.players.find((player) => player.playerId === passerId)
  const possession = activePossession(state)
  return emitEvent(state, 'assist', { ...(possession === undefined ? {} : { possessionId: possession.id }), ...(passer === undefined ? {} : { teamId: passer.teamId }), playerId: passerId, shooterPlayerId: shooterId, assistPlayerId: passerId })
}
