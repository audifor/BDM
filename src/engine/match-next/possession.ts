import type { TeamId } from '@/domain/ids'
import { emitEvent } from './events'
import { activePossession, type MatchState, type PossessionEndReason, type PossessionPhase, type PossessionStartReason, type PossessionState } from './state'

export function startPossession(
  state: MatchState,
  teamId: TeamId,
  startReason: PossessionStartReason,
  phase: PossessionPhase,
  live: boolean,
): MatchState {
  if (activePossession(state)) throw new Error('Cannot start a possession while another possession is open')
  if (teamId !== state.homeTeamId && teamId !== state.awayTeamId) throw new Error(`Possession team ${teamId} is not in this match`)
  const id = `possession-${state.nextPossessionSequence}`
  const possession: PossessionState = { id, teamId, startedT: state.t, startReason, phase, offensiveRebounds: 0, ...(live ? { shotClockStartedT: state.t } : {}) }
  let next: MatchState = {
    ...state,
    possessions: [...state.possessions, possession],
    activePossessionId: id,
    nextPossessionSequence: state.nextPossessionSequence + 1,
    shotClockTenths: live ? state.clockRules.shotClockSeconds * 10 : null,
    clock: { gameRunning: live || state.clock.gameRunning, shotRunning: live },
  }
  next = emitEvent(next, 'possessionStart', { possessionId: id, teamId, startReason, phase })
  return next
}

export function endPossession(state: MatchState, endReason: PossessionEndReason): MatchState {
  const active = activePossession(state)
  if (!active) return state
  if (active.endReason !== undefined) throw new Error(`Possession ${active.id} is already closed`)
  const possessions = state.possessions.map((possession) => possession.id === active.id ? { ...possession, endReason, endedT: state.t } : possession)
  const next: MatchState = { ...state, possessions, activePossessionId: null, shotClockTenths: null, clock: { ...state.clock, shotRunning: false } }
  return emitEvent(next, 'possessionEnd', { possessionId: active.id, teamId: active.teamId, endReason })
}

export function changePossessionPhase(state: MatchState, phase: PossessionPhase): MatchState {
  const active = activePossession(state)
  if (!active || active.phase === phase) return state
  const possessions = state.possessions.map((possession) => possession.id === active.id ? { ...possession, phase } : possession)
  return emitEvent({ ...state, possessions }, 'possessionPhaseChanged', { possessionId: active.id, teamId: active.teamId, phase })
}
