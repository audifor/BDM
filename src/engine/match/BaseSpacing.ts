import type { PlayerId, TeamId } from '@/domain/ids'
import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import type { CourtGeometry, CourtPosition } from '@/domain/court'

import type { MatchLineups } from './MatchEngine'
import type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
import { advancePlayerTowardTarget, getSpatialPossessionView, type SpatialState } from './SpatialState'

const SPATIAL_ROLES: readonly BasketballPosition[] = BASKETBALL_POSITIONS
const OFFENSIVE_SPOTS: Readonly<Record<BasketballPosition, CourtPosition>> = {
  PG: { x: 0.52, y: 0.5 },
  SG: { x: 0.64, y: 0.16 },
  SF: { x: 0.64, y: 0.84 },
  PF: { x: 0.77, y: 0.3 },
  C: { x: 0.82, y: 0.7 },
}
const DEFENDER_DISTANCE_FROM_BASKET = 0.55

export interface BaseSpatialTarget {
  readonly playerId: PlayerId
  readonly teamId: TeamId
  readonly role: BasketballPosition
  readonly position: CourtPosition
}

export interface BaseSpacingTargets {
  readonly offensive: readonly BaseSpatialTarget[]
  readonly defensive: readonly BaseSpatialTarget[]
}

export interface BaseSpacingInput {
  readonly homeTeamId: TeamId
  readonly awayTeamId: TeamId
  readonly attackingTeamId: TeamId
  readonly period: number
  readonly activeLineups: MatchLineups
  readonly playerProfiles: MatchPlayerProfiles
  readonly spatial: SpatialState
  readonly ballHandlerId?: PlayerId
}

/** Derives role-based offense and defense targets from possession and canonical court direction. */
export function assignBaseSpatialTargets(input: BaseSpacingInput): BaseSpacingTargets {
  const view = getSpatialPossessionView(input)
  const attackingRight = view.attackingBasket.x > input.spatial.court.lengthMeters / 2
  const offenseLineup = view.offensiveTeamId === input.homeTeamId ? input.activeLineups.home : input.activeLineups.away
  const defenseLineup = view.defensiveTeamId === input.homeTeamId ? input.activeLineups.home : input.activeLineups.away
  const offenseProfiles = view.offensiveTeamId === input.homeTeamId ? input.playerProfiles.home : input.playerProfiles.away
  const defenseProfiles = view.defensiveTeamId === input.homeTeamId ? input.playerProfiles.home : input.playerProfiles.away
  const ballHandlerId = input.ballHandlerId ?? view.ballHandlerId
  const offenseRoles = assignLineupRoles(offenseLineup, offenseProfiles, ballHandlerId)
  const defenseRoles = assignLineupRoles(defenseLineup, defenseProfiles)
  const court = input.spatial.court

  const offensive = offenseRoles.map(({ playerId, role }) => ({
    playerId,
    teamId: view.offensiveTeamId,
    role,
    position: orientPosition(OFFENSIVE_SPOTS[role], court, attackingRight),
  }))
  const targetByRole = new Map(offensive.map((target) => [target.role, target.position]))
  const defensive = defenseRoles.map(({ playerId, role }) => {
    const offensivePosition = targetByRole.get(role)!
    return {
      playerId,
      teamId: view.defensiveTeamId,
      role,
      position: {
        x: view.attackingBasket.x + (offensivePosition.x - view.attackingBasket.x) * DEFENDER_DISTANCE_FROM_BASKET,
        y: view.attackingBasket.y + (offensivePosition.y - view.attackingBasket.y) * DEFENDER_DISTANCE_FROM_BASKET,
      },
    }
  })

  return { offensive, defensive }
}

/** Advances all ten active players one bounded step toward the current base-spacing targets. */
export function stepPlayersTowardBaseSpacing(
  input: BaseSpacingInput,
  deltaTimeSeconds: number,
  targetOverrides: readonly { readonly playerId: PlayerId; readonly position: CourtPosition }[] = [],
): SpatialState {
  const targets = assignBaseSpatialTargets(input)
  const overrideByPlayerId = new Map<PlayerId, CourtPosition>()
  for (const override of targetOverrides) overrideByPlayerId.set(override.playerId, override.position)
  return [...targets.offensive, ...targets.defensive].reduce(
    (spatial, target) => {
      const profile = [...input.playerProfiles.home, ...input.playerProfiles.away].find((candidate) => candidate.playerId === target.playerId)
      if (profile === undefined) throw new Error(`Match player profile ${target.playerId} is missing`)
      return advancePlayerTowardTarget(spatial, target.playerId, overrideByPlayerId.get(target.playerId) ?? target.position, deltaTimeSeconds, profile.kinematics)
    },
    input.spatial,
  )
}

function assignLineupRoles(
  lineup: readonly PlayerId[],
  profiles: readonly MatchPlayerProfile[],
  ballHandlerId?: PlayerId,
): readonly { readonly playerId: PlayerId; readonly role: BasketballPosition }[] {
  const available = [...SPATIAL_ROLES]
  const assigned = lineup.map((playerId) => {
    const preferred = profiles.find((profile) => profile.playerId === playerId)?.primaryPosition
    const preferredIndex = preferred === undefined ? -1 : available.indexOf(preferred)
    const roleIndex = preferredIndex >= 0 ? preferredIndex : 0
    const role = available.splice(roleIndex, 1)[0]!
    return { playerId, role }
  })

  const handlerIndex = assigned.findIndex((assignment) => assignment.playerId === ballHandlerId)
  const primaryGuardIndex = assigned.findIndex((assignment) => assignment.role === 'PG')
  if (handlerIndex >= 0 && primaryGuardIndex >= 0 && handlerIndex !== primaryGuardIndex) {
    const handlerRole = assigned[handlerIndex]!.role
    assigned[handlerIndex] = { ...assigned[handlerIndex]!, role: 'PG' }
    assigned[primaryGuardIndex] = { ...assigned[primaryGuardIndex]!, role: handlerRole }
  }
  return assigned
}

function orientPosition(position: CourtPosition, court: CourtGeometry, attackingRight: boolean): CourtPosition {
  return { x: attackingRight ? position.x * court.lengthMeters : court.lengthMeters - position.x * court.lengthMeters, y: position.y * court.widthMeters }
}
