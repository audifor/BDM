import type { PlayerId, TeamId } from '@/domain/ids'
import type { CourtPosition } from '@/domain/court'
import type { MatchLineups } from './MatchEngine'
import { advancePlayerTowardTarget, getSpatialPossessionView, type SpatialState } from './SpatialState'

export interface TransitionSpatialTarget {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly position: CourtPosition
}

export interface TransitionSpatialTargets {
  readonly offense: readonly TransitionSpatialTarget[]
  readonly defense: readonly TransitionSpatialTarget[]
}

export interface TransitionSpatialInput {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly period: number
  readonly activeLineups: MatchLineups
  readonly spatial: SpatialState
}

/** Orients both teams toward the newly attacked basket before normal base spacing resumes. */
export function assignTransitionSpatialTargets(input: TransitionSpatialInput): TransitionSpatialTargets {
  const view = getSpatialPossessionView(input)
  const offenseLineup = view.offensiveTeamId === input.homeTeamId ? input.activeLineups.home : input.activeLineups.away
  const defenseLineup = view.defensiveTeamId === input.homeTeamId ? input.activeLineups.home : input.activeLineups.away
  const attacksRight = view.attackingBasket.x > input.spatial.court.lengthMeters / 2
  return {
    offense: targetsForLineup(offenseLineup, view.offensiveTeamId, input.spatial, attacksRight, 4),
    defense: targetsForLineup(defenseLineup, view.defensiveTeamId, input.spatial, !attacksRight, 3),
  }
}

/** Takes one bounded transition step; the next possession step returns to BaseSpacing. */
export function stepPlayersTowardTransitionTargets(input: TransitionSpatialInput, deltaTimeSeconds: number): SpatialState {
  const targets = assignTransitionSpatialTargets(input)
  return [...targets.offense, ...targets.defense].reduce(
    (spatial, target) => advancePlayerTowardTarget(spatial, target.playerId, target.position, deltaTimeSeconds),
    input.spatial,
  )
}

function targetsForLineup(
  lineup: readonly PlayerId[],
  teamId: TeamId,
  spatial: SpatialState,
  attacksRight: boolean,
  transitionDistanceMeters: number,
): readonly TransitionSpatialTarget[] {
  const direction = attacksRight ? 1 : -1
  return lineup.map((playerId) => {
    const current = spatial.players.find((player) => player.playerId === playerId)!.position
    return {
      playerId,
      teamId,
      position: {
        x: Math.min(spatial.court.lengthMeters, Math.max(0, current.x + direction * transitionDistanceMeters)),
        y: current.y,
      },
    }
  })
}
