import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { emitEvent } from '../events'
import { draw } from '../rng'
import type { MatchState } from '../state'
import { CROSSOVER_RULES_D5B } from './TechniqueRules'

/** PLAYER 2.4-D5B gate: a feint is genuinely attempted on a live DRIVE near an
 * on-ball defender, not invented from an arbitrary box-score drive event.
 * Usage controls attempts; proficiency and defense control execution outcome.
 * No repertoire means exactly the legacy RNG and movement flow.
 */
export function attemptCrossoverOnDrive(
  state: MatchState,
  playerId: PlayerId,
  actionId: string,
  attackingBasket: CourtPosition,
): MatchState {
  if (state.ball.kind !== 'HELD' || state.ball.ownerPlayerId !== playerId || state.ball.dribble !== 'live') return state
  const drive = state.actions.find((action) => action.id === actionId)
  if (drive?.kind !== 'DRIVE' || drive.playerId !== playerId || drive.status !== 'ACTIVE') return state
  if (state.events.some((event) => event.type === 'techniqueAttempted' && event.actionId === actionId)) return state
  const driver = state.players.find((player) => player.playerId === playerId && player.active)
  const move = driver?.repertoire?.technicalMoves.find((entry) => entry.code === 'CROSSOVER')
  if (!driver || !move || move.usageTendency <= 0) return state
  const guardId = state.defensiveStructure?.assignments.find((entry) => entry.attackerPlayerId === playerId)?.defenderPlayerId
    ?? state.defensiveStructure?.onBallDefenderPlayerId
  const defender = state.players.find((player) => player.playerId === guardId && player.active && player.teamId !== driver.teamId)
  if (!defender) return state
  const gap = distanceBetween(driver.position, defender.position)
  if (gap < CROSSOVER_RULES_D5B.minimumDefenderGapMeters
    || gap > CROSSOVER_RULES_D5B.maximumDefenderGapMeters) return state
  const rim = { x: attackingBasket.x - driver.position.x, y: attackingBasket.y - driver.position.y }
  const rimLength = Math.hypot(rim.x, rim.y)
  if (rimLength < 1e-6) return state
  // The defender must obstruct the lane or defend from the driver's side;
  // nobody crosses over an opponent who has already been left behind.
  const ahead = ((defender.position.x - driver.position.x) * rim.x
    + (defender.position.y - driver.position.y) * rim.y) / rimLength
  if (ahead < -0.15) return state

  const attemptRoll = draw(state.rng, 'decision')
  let next: MatchState = { ...state, rng: attemptRoll.state }
  if (attemptRoll.value >= move.usageTendency / 100) return next

  next = emitEvent(next, 'techniqueAttempted', {
    teamId: driver.teamId, playerId, victimPlayerId: defender.playerId,
    actionId, moveCode: 'CROSSOVER', possessionId: next.activePossessionId ?? undefined,
  })
  const skillRoll = draw(next.rng, 'outcome')
  next = { ...next, rng: skillRoll.state }
  // Success means the defender loses a fraction of acceleration for 0.6 s.
  // It does NOT mean an automatic drive, shot make, foul, or point.
  const executionChance = Math.max(0.05, Math.min(0.90,
    0.20 + 0.68 * move.proficiency / 100 - 0.30 * defender.defense.pointOfAttack / 100))
  const executed = skillRoll.value < executionChance
  if (executed) {
    next = { ...next, players: next.players.map((player) => player.playerId === defender.playerId
      ? { ...player, techniqueBalanceUntilT: Math.max(player.techniqueBalanceUntilT ?? 0, next.t + CROSSOVER_RULES_D5B.maximumFootworkTicks) }
      : player) }
  }
  return emitEvent(next, 'techniqueResolved', {
    teamId: driver.teamId, playerId, victimPlayerId: defender.playerId,
    actionId, moveCode: 'CROSSOVER', possessionId: next.activePossessionId ?? undefined,
    techniqueOutcome: executed ? 'EXECUTED' : 'FAILED',
  })
}
