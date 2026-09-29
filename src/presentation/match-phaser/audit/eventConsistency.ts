/**
 * Basketball Truth (BT1F) — event / geometry consistency checks for ONE engine step.
 *
 * Operates on the engine's own before/after state and the events that step emitted. These are
 * checks against basketball logic ("a made shot is not followed by a rebound"), not against the
 * renderer. A violation found here is an ENGINE-stream fact; violations that only appear once the
 * step is queued/interpolated by the presentation pipeline are checked in presentationAudit.ts.
 */

import type { MatchEvent, MatchSessionState } from '@/engine/match'

export interface EventViolation {
  readonly code: string
  readonly severity: 'P0' | 'P1' | 'P2'
  readonly message: string
}

const MAX_PLAUSIBLE_SPEED_MPS = 10.5

export function auditEngineStep(before: MatchSessionState, after: MatchSessionState, newEvents: readonly MatchEvent[]): readonly EventViolation[] {
  const violations: EventViolation[] = []
  const types = newEvents.map((e) => e.type)
  const push = (code: string, severity: EventViolation['severity'], message: string): void => {
    violations.push({ code, severity, message })
  }

  const made = types.indexOf('shotMade')
  if (made >= 0 && types.slice(made + 1).includes('rebound')) push('MADE_THEN_REBOUND', 'P0', 'shotMade followed by rebound in the same step')
  if (types.includes('shotMissed') && !types.includes('rebound')) push('MISS_WITHOUT_REBOUND', 'P0', 'shotMissed without a rebound event')
  if (types.includes('foul') && !types.some((t) => t === 'freeThrowMade' || t === 'freeThrowMissed')) push('FOUL_WITHOUT_FT', 'P1', 'shooting foul without free throws')

  for (const event of newEvents) {
    if (event.type === 'passCompleted' && after.spatial.ball.kind === 'playerControlled' && after.spatial.ball.playerId !== event.receiverPlayerId) {
      // a later event in the same step may legitimately move the ball; only flag when the pass is the last event
      if (newEvents[newEvents.length - 1] === event) push('PASS_RECEIVER_NOT_OWNER', 'P0', 'passCompleted but receiver does not own the ball afterwards')
    }
    if (event.type === 'turnover' && after.attackingTeamId === before.attackingTeamId) push('TURNOVER_NO_POSSESSION_CHANGE', 'P0', 'turnover without possession change')
    if (event.type === 'shotMade' && after.spatial.ball.kind === 'playerControlled') push('MADE_SHOT_BALL_HELD', 'P1', 'after a made shot the ball is already controlled')
  }

  if (after.clockSecondsRemaining > before.clockSecondsRemaining && !types.includes('periodStart')) push('CLOCK_INCREASED', 'P0', 'clock increased without a period change')

  const dt = before.clockSecondsRemaining - after.clockSecondsRemaining
  if (dt >= 0 && !types.includes('periodStart')) {
    for (const player of after.spatial.players) {
      const previous = before.spatial.players.find((p) => p.playerId === player.playerId)
      if (previous === undefined) continue
      const moved = Math.hypot(player.position.x - previous.position.x, player.position.y - previous.position.y)
      if (dt === 0 && moved > 0.01) push('MOVED_WITH_ZERO_TIME', 'P0', `player moved ${moved.toFixed(2)}m with 0s elapsed`)
      else if (dt > 0 && moved / dt > MAX_PLAUSIBLE_SPEED_MPS) push('IMPLAUSIBLE_SPEED', 'P0', `implied ${(moved / dt).toFixed(1)} m/s over ${dt}s`)
    }
  }

  const ballBefore = before.spatial.ball
  const ballAfter = after.spatial.ball
  const ballJump = Math.hypot(ballAfter.position.x - ballBefore.position.x, ballAfter.position.y - ballBefore.position.y)
  const ballEvents = types.some((t) => t === 'passCompleted' || t === 'turnover' || t === 'shotMade' || t === 'shotMissed' || t === 'rebound' || t === 'foul' || t === 'freeThrowMade' || t === 'freeThrowMissed' || t === 'substitution')
  const carried = ballBefore.kind === 'playerControlled' && ballAfter.kind === 'playerControlled' && ballBefore.playerId === ballAfter.playerId
  if (carried && ballJump > MAX_PLAUSIBLE_SPEED_MPS * Math.max(0, dt) + 0.5) push('BALL_TELEPORT', 'P0', `carried ball jumped ${ballJump.toFixed(1)}m in ${dt}s`)
  // A loose ball that is suddenly in a player's hands far away, with no pass/steal/rebound to explain it: the engine
  // has no loose-ball recovery, so the new possessor simply "has" it wherever he is standing.
  if (ballBefore.kind !== 'playerControlled' && ballAfter.kind === 'playerControlled' && ballJump > 6 && !ballEvents) push('LOOSE_BALL_TELEPORT', 'P1', `loose ball placed in a player's hands ${ballJump.toFixed(1)}m away with no event`)

  if (after.homeScore < before.homeScore || after.awayScore < before.awayScore) push('SCORE_DECREASED', 'P0', 'score decreased')
  const last = newEvents[newEvents.length - 1]
  if (last !== undefined && (last.homeScore !== after.homeScore || last.awayScore !== after.awayScore)) push('SCORE_EVENT_MISMATCH', 'P0', 'last event score differs from state score')
  if (ballAfter.kind === 'playerControlled' && ballAfter.teamId !== after.attackingTeamId) push('OWNER_NOT_ATTACKING_TEAM', 'P0', 'ball owner is not on the attacking team')
  return violations
}
