import { distanceBetween, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'

import { getEffectiveDefender, type DefensiveAuthority } from './DefensiveAuthority'
import type { DriveIntent } from './DribbleDrives'
import type { MatchPlayerProfiles } from './MatchPlayerProfile'
import type { SpatialState } from './SpatialState'

export const ON_BALL_DEFENSE_RULES_V1 = {
  baseGapMeters: 1.15,
  farFromBasketGapIncreaseMeters: 0.35,
  pointOfAttackGapAdjustmentMeters: 0.25,
  driveGapReductionMeters: 0.2,
  minimumGapMeters: 0.65,
  maximumGapMeters: 1.8,
  beatenThresholdMeters: 0.35,
  trailDistanceMeters: 0.75,
  containedDistanceMeters: 1.25,
} as const

export type OnBallSeparation = 'CONTAINED' | 'SLIGHT_SEPARATION' | 'BEATEN'

export interface OnBallDefensiveIntent {
  readonly defenderId: PlayerId
  readonly ballHandlerId: PlayerId
  readonly targetPosition: CourtPosition
  readonly context: 'containment' | 'drive'
  readonly separation: OnBallSeparation
}

/** Resolves current ball responsibility into a target; MG6 remains responsible for movement. */
export function resolveOnBallDefensiveIntent(input: {
  readonly attackingTeamId: TeamId
  readonly activeOffensiveLineup: readonly PlayerId[]
  readonly authority: DefensiveAuthority
  readonly defensiveProfiles: MatchPlayerProfiles['home']
  readonly defendingBasket: CourtPosition
  readonly spatial: SpatialState
  readonly driveIntent?: DriveIntent
}): OnBallDefensiveIntent | undefined {
  const ball = input.spatial.ball
  if (ball.kind !== 'playerControlled' || ball.teamId !== input.attackingTeamId
    || input.authority.attackingTeamId !== input.attackingTeamId
    || !input.activeOffensiveLineup.includes(ball.playerId)) return undefined

  const handler = input.spatial.players.find((player) => player.playerId === ball.playerId && player.teamId === input.attackingTeamId)
  const defenderId = getEffectiveDefender(input.authority, ball.playerId)
  const defender = defenderId === undefined
    ? undefined
    : input.spatial.players.find((player) => player.playerId === defenderId && player.teamId === input.authority.defendingTeamId)
  const defenderProfile = defenderId === undefined
    ? undefined
    : input.defensiveProfiles.find((profile) => profile.playerId === defenderId)
  if (handler === undefined || defenderId === undefined || defender === undefined || defenderProfile === undefined) return undefined

  const basketDistance = distanceBetween(handler.position, input.defendingBasket)
  if (basketDistance <= 1e-6) return undefined
  const towardBasket = {
    x: (input.defendingBasket.x - handler.position.x) / basketDistance,
    y: (input.defendingBasket.y - handler.position.y) / basketDistance,
  }
  const handlerToDefender = {
    x: defender.position.x - handler.position.x,
    y: defender.position.y - handler.position.y,
  }
  const defenderProgress = handlerToDefender.x * towardBasket.x + handlerToDefender.y * towardBasket.y
  const separationDistance = distanceBetween(handler.position, defender.position)
  const beaten = defenderProgress < -ON_BALL_DEFENSE_RULES_V1.beatenThresholdMeters
  const driveActive = input.driveIntent?.handlerId === ball.playerId && input.driveIntent.defenderId === defenderId
  const rating = clamp(defenderProfile.defense.pointOfAttack, 0, 100)
  const distanceAdjustment = clamp((basketDistance - 4) / 16, 0, 1) * ON_BALL_DEFENSE_RULES_V1.farFromBasketGapIncreaseMeters
  const ratingAdjustment = ((50 - rating) / 50) * ON_BALL_DEFENSE_RULES_V1.pointOfAttackGapAdjustmentMeters
  const driveAdjustment = driveActive ? ON_BALL_DEFENSE_RULES_V1.driveGapReductionMeters : 0
  const gap = clamp(
    ON_BALL_DEFENSE_RULES_V1.baseGapMeters + distanceAdjustment + ratingAdjustment - driveAdjustment,
    ON_BALL_DEFENSE_RULES_V1.minimumGapMeters,
    ON_BALL_DEFENSE_RULES_V1.maximumGapMeters,
  )
  const targetPosition = clampToCourt(beaten
    ? {
        x: handler.position.x - towardBasket.x * ON_BALL_DEFENSE_RULES_V1.trailDistanceMeters,
        y: handler.position.y - towardBasket.y * ON_BALL_DEFENSE_RULES_V1.trailDistanceMeters,
      }
    : {
        x: handler.position.x + towardBasket.x * gap,
        y: handler.position.y + towardBasket.y * gap,
      }, input.spatial)

  return {
    defenderId,
    ballHandlerId: ball.playerId,
    targetPosition,
    context: driveActive ? 'drive' : 'containment',
    separation: beaten
      ? 'BEATEN'
      : separationDistance <= ON_BALL_DEFENSE_RULES_V1.containedDistanceMeters
        ? 'CONTAINED'
        : 'SLIGHT_SEPARATION',
  }
}

function clampToCourt(position: CourtPosition, spatial: SpatialState): CourtPosition {
  return {
    x: clamp(position.x, 0, spatial.court.lengthMeters),
    y: clamp(position.y, 0, spatial.court.widthMeters),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
