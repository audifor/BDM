import type { PlayerId, TeamId } from '@/domain/ids'
import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import type { CourtGeometry, CourtPosition } from '@/domain/court'

import type { MatchLineups } from './MatchEngine'
import { calculateDefensiveAssignments, type DefensiveMatchupOverride } from './Matchups'
import type { MatchPlayerProfile, MatchPlayerProfiles } from './MatchPlayerProfile'
import { advancePlayerTowardTarget, getSpatialPossessionView, type SpatialState } from './SpatialState'

const SPATIAL_ROLES: readonly BasketballPosition[] = BASKETBALL_POSITIONS
// Fractions of the court length (attacking end = 1). BT1: the top-of-the-key and wing spots used to sit 12 m
// (PG at midcourt) and 10 m from the basket, so 50-68% of all shots were taken from more than 9 m out; they now
// sit just beyond the arc (about 8 m) like a real half-court set.
const OFFENSIVE_SPOTS: Readonly<Record<BasketballPosition, CourtPosition>> = {
  PG: { x: 0.66, y: 0.5 },
  SG: { x: 0.72, y: 0.16 },
  SF: { x: 0.72, y: 0.84 },
  PF: { x: 0.77, y: 0.3 },
  C: { x: 0.82, y: 0.7 },
}
const DEFENDER_DISTANCE_FROM_BASKET = 0.55
/** The defender of the ball handler stands this far from his man, on the line toward the basket (ball pressure). */
const ON_BALL_DEFENDER_OFFSET_METERS = 1.5

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
  /** Manual defensive matchups of the defending team; the same overrides the engine's own assignments use. */
  readonly defensiveMatchupOverrides?: readonly DefensiveMatchupOverride[]
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
  // Each defender is placed relative to the offensive player he is ASSIGNED to guard (the engine's own
  // calculateDefensiveAssignments, the one shot contests, steals and blocks are resolved with), not to
  // whoever happens to stand in the slot with the same role. Pairing by role made the assigned defender
  // stand 10+ m from his man while another defender stood next to him (BT1 seed 424242: on-ball
  // defender 9 m from the ball handler, 56-78% of shots "open" although a defender was right there).
  const assignments = defensiveAssignmentsFor(offenseLineup, defenseLineup, [...input.playerProfiles.home, ...input.playerProfiles.away], input.defensiveMatchupOverrides ?? [], offenseRoles, defenseRoles)
  const manSlotByOffensiveId = new Map(offensive.map((target) => [target.playerId, target.position]))
  const defenderRoleById = new Map(defenseRoles.map((entry) => [entry.playerId, entry.role]))
  const defensive = assignments.map(({ offensivePlayerId, defensivePlayerId }) => {
    const manSlot = manSlotByOffensiveId.get(offensivePlayerId)!
    const towardBasket = {
      x: view.attackingBasket.x - manSlot.x,
      y: view.attackingBasket.y - manSlot.y,
    }
    const distanceToBasket = Math.hypot(towardBasket.x, towardBasket.y)
    // Ball pressure for the handler's defender; everyone else keeps the compact shell shading toward the basket.
    const onBallOffset = Math.min(ON_BALL_DEFENDER_OFFSET_METERS, distanceToBasket * (1 - DEFENDER_DISTANCE_FROM_BASKET))
    const shellRatio = offensivePlayerId === ballHandlerId && distanceToBasket > 0 ? 1 - onBallOffset / distanceToBasket : DEFENDER_DISTANCE_FROM_BASKET
    return {
      playerId: defensivePlayerId,
      teamId: view.defensiveTeamId,
      role: defenderRoleById.get(defensivePlayerId)!,
      position: {
        x: view.attackingBasket.x - towardBasket.x * shellRatio,
        y: view.attackingBasket.y - towardBasket.y * shellRatio,
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

/**
 * The engine's own defensive assignment. When a profile is missing (degenerate fixtures only) the assignment
 * cannot be derived, so defenders fall back to guarding the offensive player who holds the same spatial role.
 */
function defensiveAssignmentsFor(
  offenseLineup: readonly PlayerId[],
  defenseLineup: readonly PlayerId[],
  profiles: readonly MatchPlayerProfile[],
  overrides: readonly DefensiveMatchupOverride[],
  offenseRoles: readonly { readonly playerId: PlayerId; readonly role: BasketballPosition }[],
  defenseRoles: readonly { readonly playerId: PlayerId; readonly role: BasketballPosition }[],
): readonly { readonly offensivePlayerId: PlayerId; readonly defensivePlayerId: PlayerId }[] {
  try {
    return calculateDefensiveAssignments(offenseLineup, defenseLineup, profiles, overrides)
  } catch {
    const defenderByRole = new Map(defenseRoles.map((entry) => [entry.role, entry.playerId]))
    return offenseRoles.map((entry) => ({ offensivePlayerId: entry.playerId, defensivePlayerId: defenderByRole.get(entry.role)! }))
  }
}
