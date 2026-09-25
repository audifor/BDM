import { distanceBetween, isInsideCourt, type CourtPosition } from '@/domain/court'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { RandomSource } from '@/engine/random'
import type { OffensiveAction } from './OffensiveActions'
import { createDriveIntent, driveOpportunity, type DriveIntent } from './DribbleDrives'
import type { MatchPlayerProfile } from './MatchPlayerProfile'
import { calculatePassingLaneContext } from './PassingResolution'
import { calculateShotLocation, SPATIAL_CONTEST_V1 } from './ShotResolution'
import type { SpatialState } from './SpatialState'
import { chooseWeighted } from './WeightedChoice'

export const TRANSITION_OFFENSE_RULES_V1 = {
  minimumAttackDistanceMeters: 4,
  runnerAheadMarginMeters: 1,
  minimumRunnerProjectionMeters: 1.5,
  maximumLanePressure: 0.8,
  laneHalfWidthMeters: 4.5,
} as const

export type TransitionContinuation = 'ATTACK_RIM' | 'PASS_AHEAD' | 'EARLY_SHOT' | 'SETTLE'

export interface TransitionOpportunity {
  readonly hasAdvantage: boolean
  readonly defenseSet: boolean
  readonly runnersAhead: number
  readonly defendersAhead: number
  readonly passTargetId?: PlayerId
}

export interface TransitionRead {
  readonly continuation: TransitionContinuation
  readonly driveIntent?: DriveIntent
  readonly passTargetId?: PlayerId
}

/** TRANSITION is valid only while its initiator remains the canonical active ball owner. */
export function isTransitionActionValid(input: {
  readonly action: OffensiveAction | undefined
  readonly teamId: TeamId
  readonly activeLineup: readonly PlayerId[]
  readonly handlerId: PlayerId | undefined
  readonly spatial: SpatialState
}): boolean {
  const action = input.action
  const ball = input.spatial.ball
  if (action?.kind !== 'TRANSITION' || action.teamId !== input.teamId || input.handlerId === undefined
    || action.initiatorId !== input.handlerId || action.participantIds.length === 0
    || new Set(action.participantIds).size !== action.participantIds.length
    || !action.participantIds.includes(action.initiatorId)
    || action.participantIds.some((playerId) => !input.activeLineup.includes(playerId))) return false
  if (ball.kind !== 'playerControlled' || ball.teamId !== input.teamId || ball.playerId !== input.handlerId) return false
  return action.participantIds.every((playerId) => input.spatial.players.some((player) => player.playerId === playerId && player.teamId === input.teamId))
}

/** Reads numerical and lane advantage from live players; it stores no runner roster or advantage state. */
export function inspectTransitionOpportunity(input: {
  readonly handlerId: PlayerId
  readonly teamId: TeamId
  readonly activeLineup: readonly PlayerId[]
  readonly defendingLineup: readonly PlayerId[]
  readonly defendingProfiles: readonly MatchPlayerProfile[]
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): TransitionOpportunity {
  const handler = input.spatial.players.find((player) => player.playerId === input.handlerId)
  if (handler === undefined || handler.teamId !== input.teamId || !input.activeLineup.includes(input.handlerId)) {
    return { hasAdvantage: false, defenseSet: true, runnersAhead: 0, defendersAhead: input.defendingLineup.length }
  }

  const vector = { x: input.attackingBasket.x - handler.position.x, y: input.attackingBasket.y - handler.position.y }
  const basketDistance = Math.hypot(vector.x, vector.y)
  const direction = basketDistance > 0 ? { x: vector.x / basketDistance, y: vector.y / basketDistance } : { x: 1, y: 0 }
  const projection = (position: CourtPosition) => (position.x - handler.position.x) * direction.x + (position.y - handler.position.y) * direction.y
  const lateralDistance = (position: CourtPosition) => Math.abs((position.x - handler.position.x) * -direction.y + (position.y - handler.position.y) * direction.x)
  const runnersAhead = input.activeLineup.filter((playerId) => {
    if (playerId === input.handlerId) return false
    const player = input.spatial.players.find((candidate) => candidate.playerId === playerId && candidate.teamId === input.teamId)
    return player !== undefined
      && projection(player.position) >= TRANSITION_OFFENSE_RULES_V1.minimumRunnerProjectionMeters
      && distanceBetween(player.position, input.attackingBasket) < basketDistance - TRANSITION_OFFENSE_RULES_V1.runnerAheadMarginMeters
  }).length
  const defendersAhead = input.defendingLineup.filter((playerId) => {
    const player = input.spatial.players.find((candidate) => candidate.playerId === playerId && candidate.teamId !== input.teamId)
    if (player === undefined) return false
    const alongLane = projection(player.position)
    return alongLane >= -0.5
      && alongLane < basketDistance
      && lateralDistance(player.position) <= TRANSITION_OFFENSE_RULES_V1.laneHalfWidthMeters
  }).length
  const laneDefenders = input.spatial.players
    .filter((player) => input.defendingLineup.includes(player.playerId) && player.teamId !== input.teamId)
    .map((player) => {
      const profile = input.defendingProfiles.find((candidate) => candidate.playerId === player.playerId)
      return { playerId: player.playerId, position: player.position, stealAbility: profile?.defense.steal ?? profile?.defense.pointOfAttack ?? 50 }
    })
  const passTargetId = input.activeLineup
    .filter((playerId) => playerId !== input.handlerId)
    .map((playerId) => input.spatial.players.find((player) => player.playerId === playerId && player.teamId === input.teamId))
    .filter((player): player is NonNullable<typeof player> => player !== undefined)
    .map((player) => {
      const lane = calculatePassingLaneContext(handler.position, player.position, laneDefenders)
      const rimProgress = basketDistance - distanceBetween(player.position, input.attackingBasket)
      return { playerId: player.playerId, rimProgress, lanePressure: lane.lanePressure, forwardProjection: projection(player.position) }
    })
    .filter((candidate) => candidate.forwardProjection >= TRANSITION_OFFENSE_RULES_V1.minimumRunnerProjectionMeters
      && candidate.rimProgress >= TRANSITION_OFFENSE_RULES_V1.runnerAheadMarginMeters
      && candidate.lanePressure < TRANSITION_OFFENSE_RULES_V1.maximumLanePressure)
    .sort((left, right) => right.rimProgress - left.rimProgress
      || left.lanePressure - right.lanePressure
      || comparePlayerIds(left.playerId, right.playerId))[0]?.playerId

  const numbersAdvantage = 1 + runnersAhead > defendersAhead
  const hasAdvantage = basketDistance > TRANSITION_OFFENSE_RULES_V1.minimumAttackDistanceMeters
    && (defendersAhead === 0 || numbersAdvantage)
  const defenseSet = defendersAhead >= 3 || (defendersAhead >= 2 && runnersAhead === 0)
  return { hasAdvantage, defenseSet, runnersAhead, defendersAhead, ...(passTargetId === undefined ? {} : { passTargetId }) }
}

/** Selects the transition continuation; movement and shot/pass/drive execution stay in their existing systems. */
export function selectTransitionContinuation(input: {
  readonly handler: MatchPlayerProfile
  readonly teamId: TeamId
  readonly activeLineup: readonly PlayerId[]
  readonly defendingLineup: readonly PlayerId[]
  readonly defendingProfiles: readonly MatchPlayerProfile[]
  readonly defenderId: PlayerId
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
  readonly random: RandomSource
}): TransitionRead {
  const handler = input.spatial.players.find((player) => player.playerId === input.handler.playerId)
  const ball = input.spatial.ball
  if (!input.activeLineup.includes(input.handler.playerId) || handler?.teamId !== input.teamId
    || !isInsideCourt(handler.position, input.spatial.court)
    || ball.kind !== 'playerControlled' || ball.teamId !== input.teamId || ball.playerId !== input.handler.playerId) return { continuation: 'SETTLE' }

  const opportunity = inspectTransitionOpportunity({
    handlerId: input.handler.playerId,
    teamId: input.teamId,
    activeLineup: input.activeLineup,
    defendingLineup: input.defendingLineup,
    defendingProfiles: input.defendingProfiles,
    spatial: input.spatial,
    attackingBasket: input.attackingBasket,
  })
  const options: { readonly item: Exclude<TransitionContinuation, 'SETTLE'>; readonly weight: number }[] = []
  const rimDistance = distanceBetween(handler.position, input.attackingBasket)
  const driveScore = driveOpportunity({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }) ?? 0
  const attackFrequency = Math.max(input.handler.tendencies.TRANSITION_ATTACK_FREQUENCY, input.handler.tendencies.DRIVE_FREQUENCY)
  if (opportunity.hasAdvantage && rimDistance > 1 && attackFrequency > 0 && driveScore > 0) {
    options.push({ item: 'ATTACK_RIM', weight: attackFrequency * driveScore })
  }

  if (opportunity.hasAdvantage && opportunity.passTargetId !== undefined && input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY > 0) {
    options.push({ item: 'PASS_AHEAD', weight: input.handler.tendencies.ADVANTAGE_PASS_FREQUENCY })
  }

  const shotLocation = calculateShotLocation(handler.position, input.attackingBasket, input.spatial.court)
  const shotFrequency = Math.max(input.handler.tendencies.SHOT_FREQUENCY, input.handler.tendencies.PULLUP_FREQUENCY,
    shotLocation.shotZone === 'rim' ? input.handler.tendencies.RIM_ATTEMPT_FREQUENCY
      : shotLocation.shotZone === 'midRange' ? input.handler.tendencies.MIDRANGE_FREQUENCY
        : input.handler.tendencies.THREE_POINT_FREQUENCY)
  if (!opportunity.defenseSet && shotFrequency > 0) {
    const contestingDefender = input.spatial.players.find((player) => player.playerId === input.defenderId)
    const nearestDefenderDistance = contestingDefender === undefined
      ? SPATIAL_CONTEST_V1.noContestDistanceMeters
      : distanceBetween(handler.position, contestingDefender.position)
    const contestFactor = Math.max(0.25, Math.min(1, (nearestDefenderDistance - SPATIAL_CONTEST_V1.fullContestDistanceMeters)
      / (SPATIAL_CONTEST_V1.noContestDistanceMeters - SPATIAL_CONTEST_V1.fullContestDistanceMeters)))
    options.push({ item: 'EARLY_SHOT', weight: shotFrequency * contestFactor })
  }

  if (options.length === 0) return { continuation: 'SETTLE' }
  const settleWeight = opportunity.hasAdvantage ? 10 : 100
  const continuation = chooseWeighted<TransitionContinuation>([...options, { item: 'SETTLE', weight: settleWeight }], input.random)
  if (continuation === 'ATTACK_RIM') {
    return { continuation, driveIntent: createDriveIntent({ handlerId: input.handler.playerId, defenderId: input.defenderId, spatial: input.spatial, attackingBasket: input.attackingBasket }) }
  }
  return continuation === 'PASS_AHEAD'
    ? { continuation, passTargetId: opportunity.passTargetId }
    : { continuation }
}

function comparePlayerIds(left: PlayerId, right: PlayerId): number {
  const leftKey = String(left)
  const rightKey = String(right)
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
}
