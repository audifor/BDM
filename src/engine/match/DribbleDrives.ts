import { distanceBetween, isInsideCourt, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { RandomSource } from '@/engine/random'
import type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
import type { SpatialState } from './SpatialState'

export const DRIVE_RULES_V1 = {
  maximumSteps: 3,
  arrivalThresholdMeters: 0.45,
  targetBasketDistanceMeters: 2.25,
  targetLateralOffsetMeters: 0.75,
  courtMarginMeters: 0.6,
  minimumBallHandlingMovementFactor: 0.85,
} as const

export interface DriveIntent {
  readonly handlerId: PlayerId
  readonly defenderId: PlayerId
  readonly target: CourtPosition
  readonly stepsRemaining: number
}

/** A primary-defender and rim-distance context scales inclination without adding a drive rating. */
export function selectDriveIntent(input: {
  readonly handler: MatchPlayerProfile
  readonly defenderId: PlayerId
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly random: RandomSource
}): DriveIntent | undefined {
  const handler = input.spatial.players.find((player) => player.playerId === input.handler.playerId)
  const defender = input.spatial.players.find((player) => player.playerId === input.defenderId)
  if (handler === undefined || defender === undefined) return undefined

  const defenderSpace = clamp(distanceBetween(handler.position, defender.position) / 4, 0.25, 1)
  const rimDistance = distanceBetween(handler.position, input.attackingBasket)
  const rimOpportunity = clamp((rimDistance - 1) / 8, 0.3, 1)
  const opportunity = (defenderSpace + rimOpportunity) / 2
  const probability = input.handler.tendencies.DRIVE_FREQUENCY / 100 * opportunity
  if (!input.random.chance(probability)) return undefined

  return {
    handlerId: input.handler.playerId,
    defenderId: input.defenderId,
    target: createDriveTarget({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }),
    stepsRemaining: DRIVE_RULES_V1.maximumSteps,
  }
}

/** A near-rim target offsets to the side opposite the assigned defender, within court bounds. */
export function createDriveTarget(input: {
  readonly handlerId: PlayerId
  readonly defenderId: PlayerId
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): CourtPosition {
  const handler = input.spatial.players.find((player) => player.playerId === input.handlerId)
  const defender = input.spatial.players.find((player) => player.playerId === input.defenderId)
  if (handler === undefined || defender === undefined) throw new Error('Drive participants must be active in SpatialState')

  let attackX = input.attackingBasket.x - handler.position.x
  let attackY = input.attackingBasket.y - handler.position.y
  let attackLength = Math.hypot(attackX, attackY)
  if (attackLength < 1e-6) {
    attackX = input.attackingBasket.x > input.spatial.court.lengthMeters / 2 ? 1 : -1
    attackY = 0
    attackLength = 1
  }
  attackX /= attackLength
  attackY /= attackLength
  const perpendicular = { x: -attackY, y: attackX }
  const defenderSide = (defender.position.x - handler.position.x) * perpendicular.x
    + (defender.position.y - handler.position.y) * perpendicular.y >= 0 ? 1 : -1
  const openSide = -defenderSide
  const margin = DRIVE_RULES_V1.courtMarginMeters
  const target = {
    x: clamp(input.attackingBasket.x - attackX * DRIVE_RULES_V1.targetBasketDistanceMeters + perpendicular.x * openSide * DRIVE_RULES_V1.targetLateralOffsetMeters, margin, input.spatial.court.lengthMeters - margin),
    y: clamp(input.attackingBasket.y - attackY * DRIVE_RULES_V1.targetBasketDistanceMeters + perpendicular.y * openSide * DRIVE_RULES_V1.targetLateralOffsetMeters, margin, input.spatial.court.widthMeters - margin),
  }
  if (!isInsideCourt(target, input.spatial.court)) throw new Error('Drive target must be inside the court')
  return target
}

/** Ends a drive at its target or after a small, deterministic number of movement steps. */
export function advanceDriveIntent(intent: DriveIntent | undefined, spatial: SpatialState): DriveIntent | undefined {
  if (intent === undefined) return undefined
  const handler = spatial.players.find((player) => player.playerId === intent.handlerId)
  if (handler === undefined || intent.stepsRemaining <= 1 || distanceBetween(handler.position, intent.target) <= DRIVE_RULES_V1.arrivalThresholdMeters) return undefined
  return { ...intent, stepsRemaining: intent.stepsRemaining - 1 }
}

/** Better ball control preserves more MG6A/B speed and acceleration while driving with the ball. */
export function reduceDriveHandlerMovement(profiles: MatchPlayerProfiles, handlerId: PlayerId): MatchPlayerProfiles {
  return {
    home: profiles.home.map((profile) => applyDriveFactor(profile, handlerId)),
    away: profiles.away.map((profile) => applyDriveFactor(profile, handlerId)),
  }
}

export function driveMovementFactor(ballHandling: number): number {
  const skill = clamp(ballHandling, 0, 100) / 100
  return DRIVE_RULES_V1.minimumBallHandlingMovementFactor + (1 - DRIVE_RULES_V1.minimumBallHandlingMovementFactor) * skill
}

function applyDriveFactor(profile: MatchPlayerProfile, handlerId: PlayerId): MatchPlayerProfile {
  if (profile.playerId !== handlerId) return profile
  const factor = driveMovementFactor(profile.ballHandling ?? 50)
  return {
    ...profile,
    kinematics: {
      ...profile.kinematics,
      maxSpeedMps: profile.kinematics.maxSpeedMps * factor,
      accelerationMps2: profile.kinematics.accelerationMps2 * factor,
    },
  }
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
