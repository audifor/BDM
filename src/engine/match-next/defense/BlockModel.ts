import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import { closingSpeed } from '../contact/ContactModel'
import type { MatchPlayerState } from '../state'

/** A defender can only reach a shot this far from his body (arm extension plus the step he takes into it). */
export const BLOCK_MAX_HORIZONTAL_METERS = 1.4

/** Per-attempt base rate of a perfectly placed, perfectly timed block by zone. Rim attempts are the only ones really blockable. */
const BLOCK_BASE_RATE = Object.freeze({ rim: 0.55, paint: 0.25, mid: 0.06, three: 0.012 })

export interface BlockAssessment {
  readonly blockerId: PlayerId
  readonly probability: number
  /** Why: how much higher he gets to the ball than the shooter releases it (cm), how close he is, from where he comes. */
  readonly reachAdvantageCm: number
  readonly gapMeters: number
  readonly side: 'FRONT' | 'BESIDE' | 'BEHIND'
}

function unit(from: CourtPosition, to: CourtPosition): CourtPosition {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  return length > 1e-9 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 }
}

/** Highest point the defender's hand can reach going up for the ball. */
function defenderReachCm(defender: MatchPlayerState): number {
  return defender.standingReachCm + 38 + defender.defense.interior * 0.32 + defender.defense.mobility * 0.12
}

/** Height at which the ball leaves the shooter's hand: higher for a jumper, lower for a hurried layup off the dribble. */
function releaseHeightCm(shooter: MatchPlayerState, closeToRim: boolean): number {
  return shooter.standingReachCm + (closeToRim ? 34 + shooter.offense.rimAttack * 0.16 : 26)
}

/**
 * BT3H: a block needs position AND timing. The defender must be within arm's reach of the shooter, on the right side of him
 * (in front, beside, or chasing him down at speed), and able to get his hand above the release point. There is no block
 * from several metres away, and none from a defender who cannot get up to the ball.
 */
export function assessBlock(shooter: MatchPlayerState, defenders: readonly MatchPlayerState[], basket: CourtPosition, distanceToBasket: number): BlockAssessment | null {
  const closeToRim = distanceToBasket <= 4.6
  const base = distanceToBasket <= 2.6 ? BLOCK_BASE_RATE.rim : distanceToBasket <= 4.6 ? BLOCK_BASE_RATE.paint : distanceToBasket <= 6.6 ? BLOCK_BASE_RATE.mid : BLOCK_BASE_RATE.three
  const toBasket = unit(shooter.position, basket)
  let best: BlockAssessment | null = null
  for (const defender of defenders) {
    const gap = distanceBetween(defender.position, shooter.position)
    if (gap > BLOCK_MAX_HORIZONTAL_METERS) continue
    const toDefender = unit(shooter.position, defender.position)
    const alignment = toDefender.x * toBasket.x + toDefender.y * toBasket.y
    const closing = closingSpeed(defender, shooter)
    const side: BlockAssessment['side'] = alignment >= 0.25 ? 'FRONT' : alignment >= -0.35 ? 'BESIDE' : 'BEHIND'
    // A defender behind the shooter can only reject the shot by running him down.
    if (side === 'BEHIND' && closing < 3) continue
    const sideFactor = side === 'FRONT' ? 1 : side === 'BESIDE' ? 0.65 : 0.5
    const reachAdvantage = defenderReachCm(defender) - releaseHeightCm(shooter, closeToRim)
    const height = Math.max(0, Math.min(1.4, (reachAdvantage + 25) / 50))
    const timing = Math.max(0.3, Math.min(1, 0.5 + 0.12 * closing))
    const proximity = Math.max(0, Math.min(1, (BLOCK_MAX_HORIZONTAL_METERS + 0.1 - gap) / 0.9))
    const probability = Math.min(0.6, base * height * timing * proximity * sideFactor)
    if (probability > 0 && (best === null || probability > best.probability)) best = { blockerId: defender.playerId, probability, reachAdvantageCm: Math.round(reachAdvantage), gapMeters: Number(gap.toFixed(2)), side }
  }
  return best
}

/** Where a blocked ball goes: swatted back toward the court and to the blocker's side, harder when he gets well above it. */
export function blockedBallVelocity(shooter: MatchPlayerState, blocker: MatchPlayerState, basket: CourtPosition, reachAdvantageCm: number, angleDraw: number, speedDraw: number): CourtPosition {
  const awayFromBasket = unit(basket, shooter.position)
  const fromBlocker = unit(blocker.position, shooter.position)
  const base = { x: awayFromBasket.x * 0.65 + fromBlocker.x * 0.35, y: awayFromBasket.y * 0.65 + fromBlocker.y * 0.35 }
  const angle = Math.atan2(base.y, base.x) + (angleDraw - 0.5) * 1.4
  const speed = 3.5 + speedDraw * 3.5 + Math.max(0, Math.min(2, reachAdvantageCm / 40))
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed }
}
