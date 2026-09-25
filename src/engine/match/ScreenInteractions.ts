import type { PlayerId } from '@/domain/ids'
import { isInsideCourt, type CourtPosition } from '@/domain/court'
import type { RandomSource } from '@/engine/random'
import { chooseWeighted } from './WeightedChoice'
import type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
import type { SpatialState } from './SpatialState'

export const SCREEN_RULES_V1 = {
  maximumApproachSteps: 2,
  setDurationSteps: 2,
  setThresholdMeters: 0.45,
  postScreenCompletionThresholdMeters: 0.45,
  maximumPostScreenSteps: 4,
  rollTargetBasketDistanceMeters: 2,
  popTargetThreePointOffsetMeters: 0.45,
  influenceRadiusMeters: 1.25,
  defenderMovementFactor: 0.65,
  targetForwardOffsetMeters: 0.9,
  targetLateralOffsetMeters: 0.8,
  courtMarginMeters: 0.6,
} as const

export interface ScreenIntent {
  readonly screenerId: PlayerId
  readonly ballHandlerId: PlayerId
  readonly defenderId: PlayerId
  readonly screenerDefenderId?: PlayerId
  readonly target: CourtPosition
  readonly phase: 'approach' | 'set' | 'postScreen'
  readonly stepsRemaining: number
  readonly postScreenAction?: 'roll' | 'pop'
  readonly postScreenTarget?: CourtPosition
}

/** Selects an active teammate other than the handler/current cutter using on-ball-screen tendency. */
export function selectScreenScreener(
  lineup: readonly PlayerId[],
  profiles: readonly MatchPlayerProfile[],
  ballHandlerId: PlayerId,
  currentCutterId: PlayerId | undefined,
  random: RandomSource,
): PlayerId | undefined {
  const candidates = lineup
    .filter((playerId) => playerId !== ballHandlerId && playerId !== currentCutterId)
    .map((playerId) => profiles.find((profile) => profile.playerId === playerId))
    .filter((profile): profile is MatchPlayerProfile => profile !== undefined)
  if (candidates.length === 0) return undefined

  const highestFrequency = Math.max(...candidates.map((profile) => profile.tendencies.ON_BALL_SCREENING_FREQUENCY))
  if (!random.chance(highestFrequency / 100)) return undefined
  return chooseWeighted(candidates.map((profile) => ({ item: profile.playerId, weight: profile.tendencies.ON_BALL_SCREENING_FREQUENCY })), random)
}

/** Places the screener ahead of the handler on their basketward route, on the defender's side. */
export function createScreenIntent(input: {
  readonly screenerId: PlayerId
  readonly ballHandlerId: PlayerId
  readonly defenderId: PlayerId
  readonly screenerDefenderId?: PlayerId
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): ScreenIntent {
  const handler = input.spatial.players.find((player) => player.playerId === input.ballHandlerId)
  const defender = input.spatial.players.find((player) => player.playerId === input.defenderId)
  if (handler === undefined || defender === undefined || !input.spatial.players.some((player) => player.playerId === input.screenerId)) {
    throw new Error('Screen participants must be active in SpatialState')
  }

  let attackX = input.attackingBasket.x - handler.position.x
  let attackY = input.attackingBasket.y - handler.position.y
  const attackLength = Math.hypot(attackX, attackY)
  if (attackLength === 0) attackX = input.attackingBasket.x >= input.spatial.court.lengthMeters / 2 ? 1 : -1
  else { attackX /= attackLength; attackY /= attackLength }
  const perpendicular = { x: -attackY, y: attackX }
  const defenderSide = (defender.position.x - handler.position.x) * perpendicular.x + (defender.position.y - handler.position.y) * perpendicular.y >= 0 ? 1 : -1
  const margin = SCREEN_RULES_V1.courtMarginMeters
  const target = {
    x: clamp(handler.position.x + attackX * SCREEN_RULES_V1.targetForwardOffsetMeters + perpendicular.x * defenderSide * SCREEN_RULES_V1.targetLateralOffsetMeters, margin, input.spatial.court.lengthMeters - margin),
    y: clamp(handler.position.y + attackY * SCREEN_RULES_V1.targetForwardOffsetMeters + perpendicular.y * defenderSide * SCREEN_RULES_V1.targetLateralOffsetMeters, margin, input.spatial.court.widthMeters - margin),
  }
  return { screenerId: input.screenerId, ballHandlerId: input.ballHandlerId, defenderId: input.defenderId, ...(input.screenerDefenderId === undefined ? {} : { screenerDefenderId: input.screenerDefenderId }), target, phase: 'approach', stepsRemaining: SCREEN_RULES_V1.maximumApproachSteps }
}

/** Advances the small approach/set lifecycle from canonical positions, without wall-clock timers. */
export function advanceScreenIntent(intent: ScreenIntent | undefined, spatial: SpatialState): ScreenIntent | undefined {
  if (intent === undefined) return undefined
  if (intent.phase === 'approach') {
    const screener = spatial.players.find((player) => player.playerId === intent.screenerId)
    if (screener === undefined || intent.stepsRemaining <= 0) return undefined
    if (distance(screener.position, intent.target) <= SCREEN_RULES_V1.setThresholdMeters) {
      return { ...intent, phase: 'set', stepsRemaining: SCREEN_RULES_V1.setDurationSteps }
    }
    return intent.stepsRemaining <= 1 ? undefined : { ...intent, stepsRemaining: intent.stepsRemaining - 1 }
  }
  if (intent.phase === 'set') return intent.stepsRemaining <= 1 ? undefined : { ...intent, stepsRemaining: intent.stepsRemaining - 1 }
  const screener = spatial.players.find((player) => player.playerId === intent.screenerId)
  if (screener === undefined || intent.stepsRemaining <= 1 || (intent.postScreenTarget !== undefined && distance(screener.position, intent.postScreenTarget) <= SCREEN_RULES_V1.postScreenCompletionThresholdMeters)) return undefined
  return { ...intent, stepsRemaining: intent.stepsRemaining - 1 }
}

/** Starts the screener's one post-screen action after the SET window expires. */
export function createPostScreenIntent(input: {
  readonly intent: ScreenIntent
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly action: 'roll' | 'pop'
}): ScreenIntent {
  const target = createPostScreenTarget({ action: input.action, intent: input.intent, spatial: input.spatial, attackingBasket: input.attackingBasket })
  return {
    ...input.intent,
    phase: 'postScreen',
    stepsRemaining: SCREEN_RULES_V1.maximumPostScreenSteps,
    postScreenAction: input.action,
    postScreenTarget: target,
  }
}

/** Uses basket and live participant geometry; pop radius follows this court's three-point arc. */
export function createPostScreenTarget(input: {
  readonly action: 'roll' | 'pop'
  readonly intent: ScreenIntent
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): CourtPosition {
  const screener = input.spatial.players.find((player) => player.playerId === input.intent.screenerId)
  const handler = input.spatial.players.find((player) => player.playerId === input.intent.ballHandlerId)
  if (screener === undefined || handler === undefined) throw new Error('Post-screen participants must be active in SpatialState')

  const reference = {
    x: (screener.position.x + handler.position.x) / 2,
    y: (screener.position.y + handler.position.y) / 2,
  }
  let dx = reference.x - input.attackingBasket.x
  let dy = reference.y - input.attackingBasket.y
  const attacksRight = input.attackingBasket.x > input.spatial.court.lengthMeters / 2
  const inwardX = attacksRight ? -1 : 1
  if (dx * inwardX < 0) dx = -dx
  let length = Math.hypot(dx, dy)
  if (length < 1e-6) { dx = inwardX; dy = 0; length = 1 }
  const radius = input.action === 'roll'
    ? SCREEN_RULES_V1.rollTargetBasketDistanceMeters
    : input.spatial.court.threePointLine.arcRadiusMeters + SCREEN_RULES_V1.popTargetThreePointOffsetMeters
  const margin = SCREEN_RULES_V1.courtMarginMeters
  const target = {
    x: clamp(input.attackingBasket.x + dx / length * radius, margin, input.spatial.court.lengthMeters - margin),
    y: clamp(input.attackingBasket.y + dy / length * radius, margin, input.spatial.court.widthMeters - margin),
  }
  if (!isInsideCourt(target, input.spatial.court)) throw new Error('Post-screen target must be inside the court')
  return target
}

/** Returns whether the assigned defender's current-to-spacing movement crosses the screen zone. */
export function screenIntersectsDefenderRoute(input: {
  readonly screen: ScreenIntent
  readonly spatial: SpatialState
  readonly defenderTarget: CourtPosition | undefined
}): boolean {
  const defender = input.spatial.players.find((player) => player.playerId === input.screen.defenderId)
  const screener = input.spatial.players.find((player) => player.playerId === input.screen.screenerId)
  if (defender === undefined || screener === undefined || input.defenderTarget === undefined) return false
  return distanceToSegment(screener.position, defender.position, input.defenderTarget) <= SCREEN_RULES_V1.influenceRadiusMeters
}

/** Applies a bounded, temporary movement-efficiency reduction to the affected defender only. */
export function reduceScreenedDefenderMovement(profiles: MatchPlayerProfiles, defenderId: PlayerId): MatchPlayerProfiles {
  return {
    home: profiles.home.map((profile) => applyMovementFactor(profile, defenderId)),
    away: profiles.away.map((profile) => applyMovementFactor(profile, defenderId)),
  }
}

function applyMovementFactor(profile: MatchPlayerProfile, playerId: PlayerId): MatchPlayerProfile {
  if (profile.playerId !== playerId) return profile
  return { ...profile, kinematics: { ...profile.kinematics, maxSpeedMps: profile.kinematics.maxSpeedMps * SCREEN_RULES_V1.defenderMovementFactor, accelerationMps2: profile.kinematics.accelerationMps2 * SCREEN_RULES_V1.defenderMovementFactor } }
}

function distanceToSegment(point: CourtPosition, start: CourtPosition, end: CourtPosition): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  const projection = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  return distance(point, { x: start.x + projection * dx, y: start.y + projection * dy })
}

function distance(a: CourtPosition, b: CourtPosition): number { return Math.hypot(a.x - b.x, a.y - b.y) }
function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)) }
