import type { MatchNextEvent, MatchState } from './state'

const EVENT_FATIGUE_BY_ACTION: Readonly<Record<string, number>> = {
  DRIVE: 0.16, SCREEN: 0.12, SHOOT: 0.06, CATCH_AND_SHOOT: 0.06,
  PASS: 0.035, KICK_OUT: 0.035, CLOSEOUT: 0.07,
}

/** Both source and session state are 0–100; only half of career load enters a match session. */
export function careerFatigueToMatchSession(value: number): number {
  return clamp(value, 0, 100) * 0.5
}

/** Converts match-session load gained (never its final absolute value) back to career fatigue. */
export function matchSessionFatigueDeltaToCareer(delta: number): number {
  return Math.max(0, delta) * 0.5
}

/** One running 0.1-second game-clock tick contributes 0.0005 session fatigue. */
export function advanceMatchSessionFatigue(state: MatchState, gameClockRunning: boolean): MatchState {
  if (!gameClockRunning) return state
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      fatigue: clamp(player.fatigue + 0.0005, 0, 100),
    })),
  }
}

/** Small, deterministic physical-load increments for player-attributed Match Next events. */
export function matchEventFatigueIncrement(event: Pick<MatchNextEvent, 'type' | 'actionKind'>): number {
  if (event.type === 'actionStarted') {
    return EVENT_FATIGUE_BY_ACTION[event.actionKind ?? ''] ?? 0
  }
  if (event.type === 'shotReleased') return 0.035
  if (event.type === 'reboundSecured') return 0.08
  if (event.type === 'passIntercepted' || event.type === 'looseBallRecovered') return 0.06
  if (event.type === 'defensiveResponsibilityChanged') return 0.015
  return 0
}

export function addMatchEventFatigue(state: MatchState, event: MatchNextEvent): MatchState {
  const increment = matchEventFatigueIncrement(event)
  if (increment === 0 || event.playerId === undefined) return state
  let changed = false
  const players = state.players.map((player) => {
    if (player.playerId !== event.playerId) return player
    const fatigue = clamp(player.fatigue + increment, 0, 100)
    if (fatigue === player.fatigue) return player
    changed = true
    return { ...player, fatigue }
  })
  return changed ? { ...state, players } : state
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) throw new RangeError('Player fatigue must be finite')
  return Math.max(minimum, Math.min(maximum, value))
}
