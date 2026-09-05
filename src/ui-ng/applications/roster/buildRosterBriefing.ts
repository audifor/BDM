import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import { getPlayerAge } from '@/domain/player'
import type { TeamId } from '@/domain/ids'
import {
  getCurrentPlayerContract,
  getCurrentPlayerInjury,
  getTeamLineup,
  getTeamRoster,
  type GameWorld,
} from '@/domain/world'
import { getLineupSlotForPlayer } from '@/domain/tactics'

import {
  SUMMARY_SIGNAL_ORG_DIMENSION,
  buildRosterRatingEvaluationLookup,
} from '@/ui-ng/applications/roster/rosterRatingPresentation'

export const ROSTER_LANE_TARGET_MIN = 2
export const ROSTER_LANE_TARGET_MAX = 3

export type RosterLaneDiagnosis = 'shortage' | 'thin' | 'balanced' | 'overload' | 'critical'

export interface RosterBriefingLane {
  readonly position: BasketballPosition
  readonly count: number
  readonly diagnosis: RosterLaneDiagnosis
  readonly targetMin: number
  readonly targetMax: number
}

export function laneDiagnosis(count: number): RosterLaneDiagnosis {
  if (count <= 0) return 'shortage'
  if (count === 1) return 'thin'
  if (count <= ROSTER_LANE_TARGET_MAX) return 'balanced'
  if (count === 4) return 'overload'
  return 'critical'
}

export interface RosterBriefingModel {
  readonly rosterCount: number
  readonly unassignedCount: number
  readonly injuredCount: number
  readonly scholarshipCount: number
  readonly contractedCount: number
  readonly knownSignalPercent: number
  readonly ageMin: number | undefined
  readonly ageMax: number | undefined
  readonly lanes: readonly RosterBriefingLane[]
}

export function buildRosterBriefing(world: GameWorld, teamId: TeamId): RosterBriefingModel {
  const roster = getTeamRoster(world, teamId)
  const lineup = getTeamLineup(world, teamId)
  const lookup = buildRosterRatingEvaluationLookup(world, teamId)
  const dimensions = Object.values(SUMMARY_SIGNAL_ORG_DIMENSION)
  let knownSignals = 0
  let totalSignals = 0
  let unassignedCount = 0
  let injuredCount = 0
  let scholarshipCount = 0
  let contractedCount = 0
  const ages: number[] = []
  const counts = Object.fromEntries(BASKETBALL_POSITIONS.map((position) => [position, 0])) as Record<
    BasketballPosition,
    number
  >

  for (const player of roster) {
    counts[player.basketball.primaryPosition] += 1
    const age = getPlayerAge(world, player.id)
    if (age !== undefined) ages.push(age)
    if (lineup === undefined || getLineupSlotForPlayer(lineup, player.id) === undefined) {
      unassignedCount += 1
    }
    if (getCurrentPlayerInjury(world, player.id) !== undefined) injuredCount += 1
    if (getCurrentPlayerContract(world, player.id) === undefined) scholarshipCount += 1
    else contractedCount += 1
    for (const dimension of dimensions) {
      totalSignals += 1
      if (lookup(player, dimension).mode !== 'UNKNOWN') knownSignals += 1
    }
  }

  return {
    rosterCount: roster.length,
    unassignedCount,
    injuredCount,
    scholarshipCount,
    contractedCount,
    knownSignalPercent: totalSignals === 0 ? 0 : Math.round((knownSignals / totalSignals) * 100),
    ageMin: ages.length === 0 ? undefined : Math.min(...ages),
    ageMax: ages.length === 0 ? undefined : Math.max(...ages),
    lanes: BASKETBALL_POSITIONS.map((position) => ({
      position,
      count: counts[position],
      diagnosis: laneDiagnosis(counts[position]),
      targetMin: ROSTER_LANE_TARGET_MIN,
      targetMax: ROSTER_LANE_TARGET_MAX,
    })),
  }
}
