import type { MatchPlayerState, MatchState } from '../state'

/**
 * BT6 point of attack. PRESSURE (how close the coach wants the defender on the ball) and CONTAINMENT (whether he stays in front) are
 * separate things, both from canonical ratings:
 *
 *  - burst (handler): how hard his first step is to read and to stay with (creation, rim attack, fatigue);
 *  - anticipation (defender): how soon he reads that first step (point-of-attack technique, hands/anticipation);
 *  - slide (defender): how much of his speed he keeps moving backward and sideways in his stance (mobility, technique);
 *  - cushion: the space he gives, from the coach's pressure and the handler's threat.
 *
 * The defender follows the handler with a reaction delay; the closer he plays, the less that delay can be absorbed, so a tight
 * cushion turns a slow read into a blow-by while a sagging one turns it into pull-up space. Nothing here is an outcome: the movement
 * that follows is simulated, and the drive decision believes the same quantities.
 */

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

export function handlerBurst(handler: MatchPlayerState): number {
  return handler.offense.creation * 0.55 + handler.offense.rimAttack * 0.45 - handler.fatigue * 0.06
}

export function defenderAnticipation(defender: MatchPlayerState): number {
  return defender.defense.pointOfAttack * 0.65 + (defender.defense.steal ?? 50) * 0.35 - defender.fatigue * 0.05
}

export function defenderQuickness(defender: MatchPlayerState): number {
  return defender.defensiveMobility * 0.6 + defender.defense.pointOfAttack * 0.4 - defender.fatigue * 0.06
}

/** Seconds between the handler's first step and the defender's answer to it. Off balance (a missed reach) he is late on top of that. */
export function onBallReactionSeconds(state: MatchState, defender: MatchPlayerState, handler: MatchPlayerState): number {
  const read = 0.05 + 0.3 * clamp(0.5 + (handlerBurst(handler) - defenderAnticipation(defender)) / 80, 0, 1)
  const offBalance = defender.offBalanceUntilT !== undefined && defender.offBalanceUntilT > state.t ? 0.3 : 0
  // A defender running at the handler (a closeout) has his momentum committed: he cannot change direction at once.
  const dx = handler.position.x - defender.position.x
  const dy = handler.position.y - defender.position.y
  const length = Math.hypot(dx, dy)
  const closing = length < 1e-6 ? 0 : Math.max(0, (defender.velocity.x * dx + defender.velocity.y * dy) / length)
  return read + offBalance + Math.min(0.25, Math.max(0, closing - 1) * 0.05)
}

/** Share of his top speed a defender keeps sliding in his stance (backward or sideways), from his footwork; the generic backpedal is the floor. */
export function stanceSlideFactor(defender: MatchPlayerState, genericBackpedal: number): number {
  const skill = clamp((defenderQuickness(defender) - 40) / 50, 0, 1)
  return clamp(genericBackpedal + (0.92 - genericBackpedal) * skill * 0.75, genericBackpedal, 0.92)
}

/**
 * The space the on-ball defender gives. The coach's pressure sets it (up at arm's length 0.6 m .. sagging 1.9 m); a conservative defense also gives an
 * extra step to a handler it cannot stay with and sags off one who cannot shoot, a pressure defense does not.
 */
export function onBallCushion(pressure: number, defender: MatchPlayerState, handler: MatchPlayerState): number {
  const base = 1.9 - 1.3 * pressure
  const respect = (1 - pressure) * (clamp((handlerBurst(handler) - defenderQuickness(defender)) / 100, -0.15, 0.3) * 0.8 + clamp((60 - handler.offense.shooting) / 100, 0, 0.3) * 0.8)
  return clamp(base + respect, 0.55, 2.3)
}

/**
 * The drive edge a handler can believe in: the separation his first step creates against this defender's read and slide, at the distance
 * the defender is playing him. Positive: he gets by. Same terms as the movement (no separate "containment roll").
 */
export function expectedSeparation(state: MatchState, defender: MatchPlayerState, handler: MatchPlayerState, gap: number): number {
  const handlerSpeed = handler.kinematics.maxSpeedMps * (1 - handler.fatigue * 0.0012)
  const firstStep = handlerSpeed * 0.75 * onBallReactionSeconds(state, defender, handler)
  const slideDeficit = (1 - stanceSlideFactor(defender, defender.kinematics.backpedalFactor ?? 1)) * 0.9
  return firstStep + slideDeficit - gap * 0.85
}
