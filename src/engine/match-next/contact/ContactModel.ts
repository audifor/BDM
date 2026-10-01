import { tuning } from '../tuning'
import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { ContactKind, FoulType, MatchPlayerState } from '../state'

/**
 * BT3B: the canonical notion of physical interaction. Contact is a property of two bodies, their motion, their facing and
 * the action they are in: it is measured, classified and only then, sometimes, called. None of these functions draws random
 * numbers; they return the probability a referee would blow the whistle, and the caller decides with the seeded stream.
 */

/** A shot with contact goes in this share as often as the same shot without it. */
export const FOULED_SHOT_MAKE_FACTOR = 0.8

/** Bodies are in contact range when their centres are this close (each player is ~0.3 m wide, arms add reach). */
export const CONTACT_DISTANCE_METERS = 0.95

export function speedOf(player: Pick<MatchPlayerState, 'velocity'>): number {
  return Math.hypot(player.velocity.x, player.velocity.y)
}

function unitBetween(from: CourtPosition, to: CourtPosition): CourtPosition {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  return length > 1e-9 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 }
}

function dot(a: CourtPosition, b: CourtPosition): number {
  return a.x * b.x + a.y * b.y
}

/** How fast `mover` closes on `other` along the line between their centres (m/s); negative when separating. */
export function closingSpeed(mover: Pick<MatchPlayerState, 'position' | 'velocity'>, other: Pick<MatchPlayerState, 'position' | 'velocity'>): number {
  const direction = unitBetween(mover.position, other.position)
  return dot({ x: mover.velocity.x - other.velocity.x, y: mover.velocity.y - other.velocity.y }, direction)
}

/** Where the mover is heading (unit vector) or his facing when he is nearly still. */
function heading(player: Pick<MatchPlayerState, 'velocity' | 'facing'>): CourtPosition {
  const speed = Math.hypot(player.velocity.x, player.velocity.y)
  return speed > 0.8 ? { x: player.velocity.x / speed, y: player.velocity.y / speed } : player.facing
}

/** A defender has legal guarding position when he is set (not sliding into the attacker), faces him and stands in his path. */
export function isEstablished(defender: MatchPlayerState, attacker: MatchPlayerState): boolean {
  if (speedOf(defender) > 2.6) return false
  const towardAttacker = unitBetween(defender.position, attacker.position)
  if (dot(defender.facing, towardAttacker) < 0.15) return false
  return dot(unitBetween(attacker.position, defender.position), heading(attacker)) >= 0.3
}

/** Defender stands in front of the direction the attacker is moving. */
export function isInPath(defender: Pick<MatchPlayerState, 'position'>, attacker: Pick<MatchPlayerState, 'position' | 'velocity' | 'facing'>): boolean {
  return dot(unitBetween(attacker.position, defender.position), heading(attacker)) >= 0.35
}

/** 0 = a brush, 1 = a collision at full speed between heavy bodies. */
export function contactSeverity(closing: number, moverWeightKg: number): number {
  const impact = Math.max(0, Math.min(1, (closing - 0.5) / 4.5))
  const mass = Math.max(0.75, Math.min(1.12, 0.75 + moverWeightKg / 300))
  return Math.min(1, impact * mass)
}

export interface DriveContactTrack {
  readonly defenderId: PlayerId
  readonly minGap: number
  /** Closing speed of the driver on the defender at the closest approach. */
  readonly closingSpeed: number
  readonly established: boolean
  readonly inPath: boolean
  readonly atT: number
}

/** Keeps the closest approach between a driver and his on-ball defender (called every tick of the drive). */
export function updateDriveContactTrack(track: DriveContactTrack | undefined, driver: MatchPlayerState, defender: MatchPlayerState, t: number): DriveContactTrack {
  const gap = distanceBetween(driver.position, defender.position)
  if (track !== undefined && track.defenderId === defender.playerId && track.minGap <= gap) return track
  return { defenderId: defender.playerId, minGap: gap, closingSpeed: closingSpeed(driver, defender), established: isEstablished(defender, driver), inPath: isInPath(defender, driver), atT: t }
}

export interface ContactAssessment {
  readonly kind: ContactKind
  readonly severity: number
  readonly offenderId: PlayerId | null
  readonly victimId: PlayerId | null
  readonly foulType: FoulType | null
  /** Probability that a referee calls this contact a foul, from the geometry alone. */
  readonly callProbability: number
}

const NO_CONTACT: ContactAssessment = Object.freeze({ kind: 'INCIDENTAL', severity: 0, offenderId: null, victimId: null, foulType: null, callProbability: 0 })

/** A referee tolerates less contact on a man who has left his feet. Called probability of a maximum-severity contact. */
/** The whistle tolerance of one kind of contact, scaled by the referee's strictness (an audit/competition parameter). */
function whistleTolerance(kind: keyof typeof REFEREE_TOLERANCE): number { return REFEREE_TOLERANCE[kind] * tuning().refereeScale }

export const REFEREE_TOLERANCE = Object.freeze({
  shotAtRim: 0.65, shotInPaint: 0.45, shotMidRange: 0.4, shotThree: 0.18,
  charge: 0.18, blocking: 0.65, reach: 0.55, illegalScreen: 0.6, looseBall: 0.22, rebounding: 0.1,
})

function defensiveSkill(player: MatchPlayerState, close: boolean): number {
  return (close ? player.defense.interior : player.defense.pointOfAttack) / 100
}

/**
 * Drive contact: the driver and the on-ball defender meet. A defender who was set in the driver's path takes the hit and
 * the driver has charged; one who was still moving into the path (or not in it at all) has blocked or reached.
 */
export function assessDriveContact(track: DriveContactTrack | undefined, driver: MatchPlayerState, defender: MatchPlayerState): ContactAssessment {
  if (track === undefined || track.minGap > CONTACT_DISTANCE_METERS) return NO_CONTACT
  const severity = contactSeverity(Math.max(0, track.closingSpeed), driver.weightKg)
  if (severity < 0.06) return { ...NO_CONTACT, kind: 'INCIDENTAL', severity }
  const driverSkill = (driver.offense.rimAttack + driver.offense.creation) / 200
  const defenderSkill = (defender.defense.pointOfAttack + defender.defense.mobility) / 200
  if (track.established && track.closingSpeed >= 1.5) {
    return { kind: 'DRIVE', severity, offenderId: driver.playerId, victimId: defender.playerId, foulType: 'CHARGING', callProbability: Math.min(0.9, whistleTolerance('charge') * severity * (1.2 - 0.45 * driverSkill)) }
  }
  if (track.inPath) {
    return { kind: 'DRIVE', severity, offenderId: defender.playerId, victimId: driver.playerId, foulType: 'BLOCKING', callProbability: Math.min(0.9, whistleTolerance('blocking') * severity * (1.3 - defenderSkill)) }
  }
  return { kind: 'DRIVE', severity, offenderId: defender.playerId, victimId: driver.playerId, foulType: 'REACH', callProbability: Math.min(0.9, whistleTolerance('reach') * severity * (1.3 - defenderSkill)) }
}

/**
 * Contact with a shooter as the ball leaves his hands. Every defender within arm's reach is a candidate; the one who
 * touches him hardest is the offender. `driveFinish` shooters are moving into contact, so the same geometry is harsher.
 */
export function assessShootingContact(
  shooter: MatchPlayerState,
  defenders: readonly MatchPlayerState[],
  basket: CourtPosition,
  driveFinish: boolean,
): ContactAssessment {
  const distanceToBasket = distanceBetween(shooter.position, basket)
  const tolerance = distanceToBasket <= 2.6 ? whistleTolerance('shotAtRim')
    : distanceToBasket <= 4.6 ? whistleTolerance('shotInPaint')
      : distanceToBasket <= 6.6 ? whistleTolerance('shotMidRange') : whistleTolerance('shotThree')
  let best: ContactAssessment = NO_CONTACT
  for (const defender of defenders) {
    const gap = distanceBetween(defender.position, shooter.position)
    if (gap > 1.7) continue
    const closing = Math.max(0, closingSpeed(defender, shooter))
    // Arms reach beyond the body: a defender a metre away is already in the shooter's space.
    const proximity = Math.max(0, Math.min(1, (1.7 - gap) / 1.1))
    // The shooter is going up and cannot absorb contact: he adds his own momentum toward the defender when driving.
    const momentum = driveFinish ? Math.max(0, closingSpeed(shooter, defender)) * 0.6 : 0
    const severity = Math.min(1, contactSeverity(closing + momentum + 1.2, defender.weightKg) * proximity * (driveFinish ? 1.25 : 1))
    if (severity <= best.severity) continue
    const skill = defensiveSkill(defender, distanceToBasket <= 4.6)
    const shooterEdge = driveFinish ? 1 + (shooter.offense.rimAttack - 50) / 400 : 1
    best = { kind: 'SHOOTING', severity, offenderId: defender.playerId, victimId: shooter.playerId, foulType: 'SHOOTING', callProbability: Math.min(0.9, tolerance * severity * (1.3 - skill) * shooterEdge) }
  }
  return best
}

/** A screener who is still moving when the defender runs into him sets an illegal (moving) screen. */
export interface ScreenContactTrack {
  readonly minGap: number
  /** Closing speed of the defender on the screener at the closest approach. */
  readonly defenderClosing: number
  /** How fast the screener was still moving at that moment. */
  readonly screenerSpeed: number
  readonly atT: number
}

export function updateScreenContactTrack(track: ScreenContactTrack | undefined, screener: MatchPlayerState, defender: MatchPlayerState, t: number): ScreenContactTrack {
  const gap = distanceBetween(screener.position, defender.position)
  if (track !== undefined && track.minGap <= gap) return track
  return { minGap: gap, defenderClosing: closingSpeed(defender, screener), screenerSpeed: speedOf(screener), atT: t }
}

export function assessScreenContact(screener: MatchPlayerState, defender: MatchPlayerState, track: ScreenContactTrack): ContactAssessment {
  const gap = track.minGap
  const screenerSpeedAtContact = track.screenerSpeed
  const defenderClosing = track.defenderClosing
  void defender
  if (gap > CONTACT_DISTANCE_METERS) return NO_CONTACT
  const severity = contactSeverity(Math.max(0, defenderClosing) + screenerSpeedAtContact * 0.5, screener.weightKg)
  if (severity < 0.06) return { ...NO_CONTACT, kind: 'SCREEN', severity }
  if (screenerSpeedAtContact < 1.0) return { kind: 'SCREEN', severity, offenderId: null, victimId: null, foulType: null, callProbability: 0 }
  return {
    kind: 'ILLEGAL_DISPLACEMENT', severity, offenderId: screener.playerId, victimId: defender.playerId, foulType: 'ILLEGAL_SCREEN',
    callProbability: Math.min(0.9, whistleTolerance('illegalScreen') * severity * Math.min(1, screenerSpeedAtContact / 2.2)),
  }
}

/**
 * Contact between two opponents fighting for the same ball (a rebound or a loose ball): whoever drives into the other with
 * more speed is the one who displaced him.
 */
export function assessBallContestContact(winner: MatchPlayerState, opponent: MatchPlayerState, kind: 'REBOUNDING' | 'LOOSE_BALL'): ContactAssessment {
  const gap = distanceBetween(winner.position, opponent.position)
  if (gap > CONTACT_DISTANCE_METERS + 0.15) return NO_CONTACT
  const winnerClosing = closingSpeed(winner, opponent)
  const opponentClosing = closingSpeed(opponent, winner)
  const winnerIsMover = winnerClosing >= opponentClosing
  const mover = winnerIsMover ? winner : opponent
  const other = winnerIsMover ? opponent : winner
  const closing = Math.max(winnerClosing, opponentClosing)
  const severity = contactSeverity(Math.max(0, closing), mover.weightKg) * Math.max(0, Math.min(1, (CONTACT_DISTANCE_METERS + 0.15 - gap) / 0.6 + 0.25))
  if (severity < 0.08) return { ...NO_CONTACT, kind: 'REBOUNDING', severity }
  const tolerance = kind === 'LOOSE_BALL' ? whistleTolerance('looseBall') : whistleTolerance('rebounding')
  const skill = (mover.defense.interior + mover.reboundingImpact) / 200
  return {
    kind: 'REBOUNDING', severity, offenderId: mover.playerId, victimId: other.playerId,
    foulType: kind, callProbability: Math.min(0.9, tolerance * severity * (1.3 - skill)),
  }
}
