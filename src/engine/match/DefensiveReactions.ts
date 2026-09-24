import type { CourtPosition } from '@/domain/court'
import { distanceBetween, isInsideCourt } from '@/domain/court'
import type { PlayerId } from '@/domain/ids'
import type { BaseSpatialTarget, BaseSpacingTargets } from './BaseSpacing'
import type { PlayerMatchup } from './Matchups'
import type { SpatialState } from './SpatialState'

export const DEFENSIVE_REACTION_RULES_V1 = {
  driveHelpZoneMeters: 7.5,
  cutHelpZoneMeters: 6.5,
  rollHelpZoneMeters: 7.5,
  helpOffsetFromThreatMeters: 2,
  rotationOffsetFromAssignmentMeters: 1.5,
  recoveryThresholdMeters: 0.65,
} as const

export type DefensiveThreatType = 'drive' | 'rimCut' | 'roll'
export type DefensiveReactionPhase = 'HELP' | 'RECOVER'

export interface DefensiveThreat {
  readonly playerId: PlayerId
  readonly type: DefensiveThreatType
  readonly target: CourtPosition
}

/** Ephemeral reaction for one helper and, optionally, one bounded secondary rotation. */
export interface DefensiveReaction {
  readonly defenderId: PlayerId
  readonly protectedPlayerId: PlayerId
  readonly threatPlayerId: PlayerId
  readonly type: DefensiveThreatType
  readonly target: CourtPosition
  readonly phase: DefensiveReactionPhase
  readonly rotationDefenderId?: PlayerId
  readonly rotationProtectedPlayerId?: PlayerId
  readonly rotationTarget?: CourtPosition
}

export interface DefensiveReactionResolution {
  readonly reaction?: DefensiveReaction
  readonly targetOverrides: readonly { readonly playerId: PlayerId; readonly position: CourtPosition }[]
}

/** Resolves help from real positions and primary assignments; no schemes or RNG are involved. */
export function resolveDefensiveReaction(input: {
  readonly threat?: DefensiveThreat
  readonly previous?: DefensiveReaction
  readonly assignments: readonly PlayerMatchup[]
  readonly defensiveLineup: readonly PlayerId[]
  readonly excludedDefenderIds?: readonly PlayerId[]
  readonly baseTargets: BaseSpacingTargets
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): DefensiveReactionResolution {
  const threat = input.threat
  const excludedDefenders = new Set(input.excludedDefenderIds ?? [])
  if (threat !== undefined) {
    const threatPlayer = input.spatial.players.find((player) => player.playerId === threat.playerId)
    const primaryDefenderId = input.assignments.find((assignment) => assignment.offensivePlayerId === threat.playerId)?.defensivePlayerId
    if (threatPlayer !== undefined && primaryDefenderId !== undefined) {
      const helpTarget = pointToward(threatPlayer.position, input.attackingBasket, DEFENSIVE_REACTION_RULES_V1.helpOffsetFromThreatMeters)
      if (isInsideCourt(helpTarget, input.spatial.court)) {
        const previousCanHelp = input.previous?.phase === 'HELP'
          && input.previous.threatPlayerId === threat.playerId
          && input.defensiveLineup.includes(input.previous.defenderId)
          && !excludedDefenders.has(input.previous.defenderId)
        const helperId = previousCanHelp
          ? input.previous!.defenderId
          : closestTo(input.defensiveLineup.filter((id) => id !== primaryDefenderId && !excludedDefenders.has(id)), helpTarget, input.spatial)
        if (helperId !== undefined) {
          const protectedAssignment = input.assignments.find((assignment) => assignment.defensivePlayerId === helperId)
          if (protectedAssignment !== undefined && protectedAssignment.offensivePlayerId !== threat.playerId) {
            const rotationId = previousCanHelp
              ? validRotation(input.previous, input.defensiveLineup, helperId, primaryDefenderId, excludedDefenders)
              : closestTo(input.defensiveLineup.filter((id) => id !== primaryDefenderId && id !== helperId && !excludedDefenders.has(id)), positionOf(protectedAssignment.offensivePlayerId, input.spatial), input.spatial)
            const rotationAssignment = rotationId === undefined ? undefined : input.assignments.find((assignment) => assignment.defensivePlayerId === rotationId)
            const rotationTarget = rotationAssignment === undefined
              ? undefined
              : pointToward(positionOf(protectedAssignment.offensivePlayerId, input.spatial), input.attackingBasket, DEFENSIVE_REACTION_RULES_V1.rotationOffsetFromAssignmentMeters)
            const rotationTargetInsideCourt = rotationTarget !== undefined && isInsideCourt(rotationTarget, input.spatial.court)
            const reaction: DefensiveReaction = {
              defenderId: helperId,
              protectedPlayerId: protectedAssignment.offensivePlayerId,
              threatPlayerId: threat.playerId,
              type: threat.type,
              target: helpTarget,
              phase: 'HELP',
              ...(rotationAssignment === undefined || !rotationTargetInsideCourt ? {} : {
                rotationDefenderId: rotationId,
                rotationProtectedPlayerId: protectedAssignment.offensivePlayerId,
                rotationTarget,
              }),
            }
            return {
              reaction,
              targetOverrides: [
                { playerId: reaction.defenderId, position: reaction.target },
                ...(reaction.rotationDefenderId === undefined || reaction.rotationTarget === undefined ? [] : [{ playerId: reaction.rotationDefenderId, position: reaction.rotationTarget }]),
              ],
            }
          }
        }
      }
    }
  }

  if (input.previous === undefined) return { targetOverrides: [] }
  if (input.previous.phase === 'HELP') return { reaction: { ...input.previous, phase: 'RECOVER' }, targetOverrides: [] }

  const helperHome = targetFor(input.baseTargets.defensive, input.previous.defenderId)
  const rotationHome = input.previous.rotationDefenderId === undefined ? undefined : targetFor(input.baseTargets.defensive, input.previous.rotationDefenderId)
  const helperRecovered = helperHome === undefined || distanceBetween(positionOf(input.previous.defenderId, input.spatial), helperHome) <= DEFENSIVE_REACTION_RULES_V1.recoveryThresholdMeters
  const rotationRecovered = rotationHome === undefined || distanceBetween(positionOf(input.previous.rotationDefenderId!, input.spatial), rotationHome) <= DEFENSIVE_REACTION_RULES_V1.recoveryThresholdMeters
  return helperRecovered && rotationRecovered ? { targetOverrides: [] } : { reaction: input.previous, targetOverrides: [] }
}

export function detectDefensiveThreat(input: {
  readonly drive?: { readonly playerId: PlayerId; readonly target: CourtPosition }
  readonly cut?: { readonly playerId: PlayerId; readonly type: 'rimCut' | 'spaceCut'; readonly target: CourtPosition }
  readonly roll?: { readonly playerId: PlayerId; readonly action: 'roll' | 'pop'; readonly target: CourtPosition }
  readonly spatial: SpatialState
  readonly attackingBasket: CourtPosition
}): DefensiveThreat | undefined {
  const eligible: readonly DefensiveThreat[] = [
    ...(input.drive === undefined ? [] : [{ playerId: input.drive.playerId, type: 'drive' as const, target: input.drive.target }]),
    ...(input.roll?.action === 'roll' ? [{ playerId: input.roll.playerId, type: 'roll' as const, target: input.roll.target }] : []),
    ...(input.cut?.type === 'rimCut' ? [{ playerId: input.cut.playerId, type: 'rimCut' as const, target: input.cut.target } ] : []),
  ]
  return eligible.find((threat) => {
    const player = input.spatial.players.find((candidate) => candidate.playerId === threat.playerId)
    if (player === undefined) return false
    const range = threat.type === 'drive' ? DEFENSIVE_REACTION_RULES_V1.driveHelpZoneMeters
      : threat.type === 'roll' ? DEFENSIVE_REACTION_RULES_V1.rollHelpZoneMeters
        : DEFENSIVE_REACTION_RULES_V1.cutHelpZoneMeters
    return distanceBetween(player.position, input.attackingBasket) <= range
      && distanceBetween(threat.target, input.attackingBasket) < distanceBetween(player.position, input.attackingBasket)
  })
}

function closestTo(playerIds: readonly PlayerId[], target: CourtPosition, spatial: SpatialState): PlayerId | undefined {
  return [...playerIds].sort((left, right) => distanceBetween(positionOf(left, spatial), target) - distanceBetween(positionOf(right, spatial), target) || compareIds(left, right))[0]
}

function validRotation(reaction: DefensiveReaction | undefined, lineup: readonly PlayerId[], helperId: PlayerId, primaryDefenderId: PlayerId, excludedDefenders: ReadonlySet<PlayerId>): PlayerId | undefined {
  const defenderId = reaction?.rotationDefenderId
  return defenderId !== undefined && defenderId !== helperId && defenderId !== primaryDefenderId && !excludedDefenders.has(defenderId) && lineup.includes(defenderId) ? defenderId : undefined
}

function targetFor(targets: readonly BaseSpatialTarget[], playerId: PlayerId): CourtPosition | undefined {
  return targets.find((target) => target.playerId === playerId)?.position
}

function positionOf(playerId: PlayerId, spatial: SpatialState): CourtPosition {
  const player = spatial.players.find((candidate) => candidate.playerId === playerId)
  if (player === undefined) throw new Error(`Defensive reaction participant ${playerId} is not active in SpatialState`)
  return player.position
}

function pointToward(from: CourtPosition, target: CourtPosition, offsetMeters: number): CourtPosition {
  const distance = distanceBetween(from, target)
  if (distance <= offsetMeters) return { x: (from.x + target.x) / 2, y: (from.y + target.y) / 2 }
  const ratio = offsetMeters / distance
  return { x: from.x + (target.x - from.x) * ratio, y: from.y + (target.y - from.y) * ratio }
}

function compareIds(left: PlayerId, right: PlayerId): number { return left < right ? -1 : left > right ? 1 : 0 }
