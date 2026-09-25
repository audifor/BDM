import { distanceBetween, distanceFromBasket, isInsideCourt, type CourtPosition } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { SpatialState } from './SpatialState'

export const POST_UP_MOVEMENT_V1 = {
  maximumBasketDistanceMeters: 6.5,
  maximumDefenderDistanceMeters: 4,
  backDownAdvanceMeters: 0.75,
  minimumBasketDistanceMeters: 1.8,
  courtMarginMeters: 0.6,
} as const

/** A post action is spatially credible near the basket and with its assigned defender present. */
export function isPostUpContextValid(input: {
  readonly postPlayerId: PlayerId
  readonly defenderId: PlayerId
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): boolean {
  const postPlayer = input.spatial.players.find((player) => player.playerId === input.postPlayerId)
  const defender = input.spatial.players.find((player) => player.playerId === input.defenderId)
  return postPlayer !== undefined
    && defender !== undefined
    && postPlayer.teamId !== defender.teamId
    && isInsideCourt(postPlayer.position, input.spatial.court)
    && isInsideCourt(defender.position, input.spatial.court)
    && distanceFromBasket(postPlayer.position, input.attackingBasket) <= POST_UP_MOVEMENT_V1.maximumBasketDistanceMeters
}

/** Creates a short legal target toward the basket; MG6 applies all movement and ball-following. */
export function createBackDownTarget(input: {
  readonly postPlayerId: PlayerId
  readonly defenderId: PlayerId
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): CourtPosition | undefined {
  const postPlayer = input.spatial.players.find((player) => player.playerId === input.postPlayerId)
  const defender = input.spatial.players.find((player) => player.playerId === input.defenderId)
  if (postPlayer === undefined || defender === undefined || distanceBetween(postPlayer.position, defender.position) > POST_UP_MOVEMENT_V1.maximumDefenderDistanceMeters) return undefined

  const toBasket = { x: input.attackingBasket.x - postPlayer.position.x, y: input.attackingBasket.y - postPlayer.position.y }
  const rimDistance = Math.hypot(toBasket.x, toBasket.y)
  const advance = Math.min(POST_UP_MOVEMENT_V1.backDownAdvanceMeters, rimDistance - POST_UP_MOVEMENT_V1.minimumBasketDistanceMeters)
  if (advance <= 0) return undefined

  const target = {
    x: postPlayer.position.x + toBasket.x / rimDistance * advance,
    y: postPlayer.position.y + toBasket.y / rimDistance * advance,
  }
  const margin = POST_UP_MOVEMENT_V1.courtMarginMeters
  const boundedTarget = {
    x: clamp(target.x, margin, input.spatial.court.lengthMeters - margin),
    y: clamp(target.y, margin, input.spatial.court.widthMeters - margin),
  }
  return isInsideCourt(boundedTarget, input.spatial.court) ? boundedTarget : undefined
}

function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
