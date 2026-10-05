import type { MatchState } from '../state'
import { activePossession } from '../state'
import { attackingBasketForTeam } from '../structure/FiveOutStructure'
import { isInOffensiveFrontcourt } from '../structure/OffensiveStructure'
import { violateBackcourt } from '../ball/BallTransitions'

/** FIBA and NBA give a team 8 seconds to take the ball into its frontcourt. */
export const DEFAULT_BACKCOURT_SECONDS = 8

/**
 * The backcourt clock runs while the team controls the ball (in a hand or in a pass it threw) in its backcourt and the game clock
 * runs. It stops for good once the ball reaches the frontcourt. Nothing here decides how fast a team brings the ball up: a team that
 * is slow, or whose handler keeps it, simply commits the violation.
 */
export function reconcileBackcourtClock(state: MatchState): MatchState {
  const seconds = state.clockRules.backcourtSeconds === undefined ? DEFAULT_BACKCOURT_SECONDS : state.clockRules.backcourtSeconds
  if (seconds === null) return state
  const possession = activePossession(state)
  if (possession === undefined) return state.backcourtControl == null ? state : { ...state, backcourtControl: null }
  const control = state.backcourtControl?.possessionId === possession.id ? state.backcourtControl : { possessionId: possession.id, ticks: 0, done: false }
  if (control.done) return control === state.backcourtControl ? state : { ...state, backcourtControl: control }
  const ball = state.ball
  const controlled = ball.kind === 'HELD' ? ball.ownerTeamId === possession.teamId : ball.kind === 'PASS_IN_FLIGHT' ? ball.passerTeamId === possession.teamId && !ball.isInbound : false
  if (!controlled || !state.clock.gameRunning) return control === state.backcourtControl ? state : { ...state, backcourtControl: control }
  const basket = attackingBasketForTeam(possession.teamId, state.homeTeamId, state.period, state.court)
  if (isInOffensiveFrontcourt(ball.position, basket, state.court.lengthMeters)) return { ...state, backcourtControl: { ...control, done: true } }
  const ticks = control.ticks + 1
  if (ticks >= Math.round(seconds * 10)) return violateBackcourt({ ...state, backcourtControl: { ...control, ticks } })
  return { ...state, backcourtControl: { ...control, ticks } }
}
