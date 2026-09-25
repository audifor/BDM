import { distanceBetween, isInsideCourt, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { RandomSource } from '@/engine/random'
import type { OffensiveAction } from './OffensiveActions'
import { createDriveIntent, driveOpportunity, type DriveIntent } from './DribbleDrives'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { calculateShotLocation, SPATIAL_CONTEST_V1 } from './ShotResolution'
import type { SpatialState } from './SpatialState'
import { chooseWeighted } from './WeightedChoice'

export const SPOT_UP_RULES_V1 = {
  closeoutDistanceMeters: SPATIAL_CONTEST_V1.noContestDistanceMeters,
  minimumClosingSpeedMps: 0.25,
  minimumCloseoutDriveDistanceFromRimMeters: SPATIAL_CONTEST_V1.noContestDistanceMeters,
} as const

export type SpotUpContinuation = 'SHOT' | 'DRIVE' | 'PASS' | 'RESET'

export interface SpotUpRead {
  readonly continuation: SpotUpContinuation
  readonly driveIntent?: DriveIntent
}

/** Validates the single primary SPOT_UP action against the current canonical handler. */
export function isSpotUpActionValid(input: {
  readonly action: OffensiveAction | undefined
  readonly teamId: TeamId
  readonly activeLineup: readonly PlayerId[]
  readonly handlerId: PlayerId | undefined
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): boolean {
  const action = input.action
  const handler = input.handlerId === undefined ? undefined : input.spatial.players.find((player) => player.playerId === input.handlerId)
  const ball = input.spatial.ball
  if (action?.kind !== 'SPOT_UP' || action.teamId !== input.teamId || input.handlerId !== action.initiatorId
    || action.participantIds.length === 0 || new Set(action.participantIds).size !== action.participantIds.length
    || !action.participantIds.includes(action.initiatorId) || action.participantIds.some((playerId) => !input.activeLineup.includes(playerId))) return false
  if (handler?.teamId !== input.teamId || !isInsideCourt(handler.position, input.spatial.court)
    || ball.kind !== 'playerControlled' || ball.teamId !== input.teamId || ball.playerId !== input.handlerId) return false
  if (action.participantIds.some((playerId) => input.spatial.players.find((player) => player.playerId === playerId)?.teamId !== input.teamId)) return false
  return calculateShotLocation(handler.position, input.attackingBasket, input.spatial.court).shotZone !== 'rim'
}

/** Reads a catch or valid SPOT_UP context from current owner, defender and court positions. */
export function selectSpotUpContinuation(input: {
  readonly handler: MatchPlayerProfile
  readonly teamId: TeamId
  readonly defenderId: PlayerId
  readonly activeLineup: readonly PlayerId[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly isCatch: boolean
  readonly random: RandomSource
}): SpotUpRead {
  const handler = input.spatial.players.find((player) => player.playerId === input.handler.playerId)
  const defender = input.spatial.players.find((player) => player.playerId === input.defenderId)
  const hasCanonicalBall = input.spatial.ball.kind === 'playerControlled'
    && input.spatial.ball.teamId === input.teamId
    && input.spatial.ball.playerId === input.handler.playerId
  if (!input.activeLineup.includes(input.handler.playerId) || !hasCanonicalBall
    || handler?.teamId !== input.teamId || !isInsideCourt(handler.position, input.spatial.court)
    || defender === undefined || defender.teamId === input.teamId) return { continuation: 'RESET' }

  const shotLocation = calculateShotLocation(handler.position, input.attackingBasket, input.spatial.court)
  const defenderDistance = distanceBetween(handler.position, defender.position)
  const closeoutDriveOpportunity = closeoutDriveSignal({ handler, defender, defenderDistance, spatial: input.spatial, handlerId: input.handler.playerId, defenderId: input.defenderId, attackingBasket: input.attackingBasket, distanceFromRim: shotLocation.distanceMeters })
  const options: { readonly item: Exclude<SpotUpContinuation, 'RESET'>; readonly weight: number }[] = []

  const zoneFrequency = shotLocation.shotZone === 'rim'
    ? Math.max(input.handler.tendencies.SHOT_FREQUENCY, input.handler.tendencies.RIM_ATTEMPT_FREQUENCY)
    : Math.max(input.handler.tendencies.SHOT_FREQUENCY, input.handler.tendencies.MIDRANGE_FREQUENCY, input.handler.tendencies.THREE_POINT_FREQUENCY, input.handler.tendencies.DEEP_THREE_FREQUENCY)
  const shotFrequency = input.isCatch && shotLocation.shotZone !== 'rim'
    ? Math.max(zoneFrequency, input.handler.tendencies.CATCH_AND_SHOOT_FREQUENCY)
    : zoneFrequency
  const contestFactor = Math.max(0.25, Math.min(1, (defenderDistance - SPATIAL_CONTEST_V1.fullContestDistanceMeters)
    / (SPATIAL_CONTEST_V1.noContestDistanceMeters - SPATIAL_CONTEST_V1.fullContestDistanceMeters)))
  const shotWeight = shotFrequency * contestFactor
  if (shotWeight > 0) options.push({ item: 'SHOT', weight: shotWeight })

  if (closeoutDriveOpportunity > 0 && input.handler.tendencies.DRIVE_FREQUENCY > 0) {
    options.push({ item: 'DRIVE', weight: input.handler.tendencies.DRIVE_FREQUENCY * closeoutDriveOpportunity })
  }

  const hasPassTarget = input.activeLineup.some((playerId) => playerId !== input.handler.playerId
    && input.spatial.players.some((player) => player.playerId === playerId && player.teamId === input.teamId))
  if (hasPassTarget && input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY > 0) {
    options.push({ item: 'PASS', weight: input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY })
  }
  if (options.length === 0) return { continuation: 'RESET' }

  const continuation = chooseWeighted(options, input.random)
  return continuation === 'DRIVE'
    ? { continuation, driveIntent: createDriveIntent({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }) }
    : { continuation }
}

function closeoutDriveSignal(input: {
  readonly handler: SpatialState['players'][number]
  readonly defender: SpatialState['players'][number]
  readonly defenderDistance: number
  readonly spatial: SpatialState
  readonly handlerId: PlayerId
  readonly defenderId: PlayerId
  readonly attackingBasket: CourtPosition
  readonly distanceFromRim: number
}): number {
  if (input.distanceFromRim < SPOT_UP_RULES_V1.minimumCloseoutDriveDistanceFromRimMeters
    || input.defenderDistance <= 0 || input.defenderDistance > SPOT_UP_RULES_V1.closeoutDistanceMeters) return 0
  const directionToHandler = {
    x: (input.handler.position.x - input.defender.position.x) / input.defenderDistance,
    y: (input.handler.position.y - input.defender.position.y) / input.defenderDistance,
  }
  const closingSpeed = input.defender.velocity.x * directionToHandler.x + input.defender.velocity.y * directionToHandler.y
  if (closingSpeed <= SPOT_UP_RULES_V1.minimumClosingSpeedMps) return 0
  const driveSpace = driveOpportunity({ handlerId: input.handlerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }) ?? 0
  const distanceSignal = (SPOT_UP_RULES_V1.closeoutDistanceMeters - input.defenderDistance) / SPOT_UP_RULES_V1.closeoutDistanceMeters
  const closingSignal = Math.min(1, closingSpeed / 3)
  return driveSpace * distanceSignal * closingSignal
}
