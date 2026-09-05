import { BASKETBALL_POSITIONS, type BasketballPosition } from '@/domain/primitives'
import type { PlayerId, TeamId } from '@/domain/ids'
import { getTeamLineup, getTeamRoster, type GameWorld } from '@/domain/world'
import { getLineupSlotForPlayer, type LineupSlot } from '@/domain/tactics'
import { calculatePlayerImpact } from '@/engine/team'

export type LeagueQualityStars = 1 | 2 | 3 | 4 | 5
export type RosterDepthBand = 'starter' | 'rotation' | 'bench' | 'unassigned'
export type RosterLaneBalance = 'thin' | 'ok' | 'loaded'

export interface RosterDepthChartPlayer {
  readonly id: PlayerId
  readonly name: string
  readonly stars: LeagueQualityStars
  readonly band: RosterDepthBand
  readonly slot: LineupSlot | undefined
}

export interface RosterDepthChartLane {
  readonly position: BasketballPosition
  readonly count: number
  readonly balance: RosterLaneBalance
  readonly starterCount: number
  readonly rotationCount: number
  readonly benchCount: number
  readonly unassignedCount: number
  readonly players: readonly RosterDepthChartPlayer[]
}

export interface RosterDepthChartModel {
  readonly lanes: readonly RosterDepthChartLane[]
  readonly rosterCount: number
}

const BAND_ORDER: Readonly<Record<RosterDepthBand, number>> = {
  starter: 0,
  rotation: 1,
  bench: 2,
  unassigned: 3,
}

export function laneBalance(count: number): RosterLaneBalance {
  if (count <= 1) return 'thin'
  if (count >= 4) return 'loaded'
  return 'ok'
}

export function depthBandForSlot(slot: LineupSlot | undefined): RosterDepthBand {
  if (slot === undefined) return 'unassigned'
  if (BASKETBALL_POSITIONS.includes(slot as BasketballPosition)) return 'starter'
  if (slot === 'B1' || slot === 'B2' || slot === 'B3') return 'rotation'
  return 'bench'
}

function comparePlayers(left: RosterDepthChartPlayer, right: RosterDepthChartPlayer): number {
  return (
    BAND_ORDER[left.band] - BAND_ORDER[right.band] ||
    right.stars - left.stars ||
    left.name.localeCompare(right.name) ||
    left.id.localeCompare(right.id)
  )
}

export function leagueQualityStars(impact: number, leagueImpacts: readonly number[]): LeagueQualityStars {
  if (leagueImpacts.length <= 1) return 3
  const worse = leagueImpacts.filter((value) => value < impact).length
  const better = leagueImpacts.filter((value) => value > impact).length
  if (worse + better === 0) return 3
  const percentile = worse / (worse + better)
  if (percentile >= 0.88) return 5
  if (percentile >= 0.68) return 4
  if (percentile >= 0.38) return 3
  if (percentile >= 0.18) return 2
  return 1
}

function leagueTeamIds(world: GameWorld, teamId: TeamId): readonly TeamId[] {
  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  return season?.participantTeamIds ?? competition?.participantTeamIds ?? [teamId]
}

function leagueImpactsByPosition(world: GameWorld, teamIds: readonly TeamId[]): Record<BasketballPosition, number[]> {
  const pools = Object.fromEntries(BASKETBALL_POSITIONS.map((position) => [position, [] as number[]])) as Record<
    BasketballPosition,
    number[]
  >
  for (const id of teamIds) {
    const team = world.teams[id]
    if (team === undefined) continue
    for (const playerId of team.rosterPlayerIds) {
      const player = world.players[playerId]
      if (player === undefined) continue
      pools[player.basketball.primaryPosition].push(calculatePlayerImpact(player))
    }
  }
  return pools
}

export function buildRosterDepthChart(world: GameWorld, teamId: TeamId): RosterDepthChartModel {
  const roster = getTeamRoster(world, teamId)
  const lineup = getTeamLineup(world, teamId)
  const pools = leagueImpactsByPosition(world, leagueTeamIds(world, teamId))
  const grouped = Object.fromEntries(
    BASKETBALL_POSITIONS.map((position) => [position, [] as RosterDepthChartPlayer[]]),
  ) as Record<BasketballPosition, RosterDepthChartPlayer[]>

  for (const player of roster) {
    const impact = calculatePlayerImpact(player)
    const slot = lineup === undefined ? undefined : getLineupSlotForPlayer(lineup, player.id)
    grouped[player.basketball.primaryPosition].push({
      id: player.id,
      name: `${player.firstName} ${player.lastName}`,
      stars: leagueQualityStars(impact, pools[player.basketball.primaryPosition]),
      band: depthBandForSlot(slot),
      slot,
    })
  }

  const lanes = BASKETBALL_POSITIONS.map((position) => {
    const players = [...grouped[position]].sort(comparePlayers)
    return {
      position,
      count: players.length,
      balance: laneBalance(players.length),
      starterCount: players.filter((player) => player.band === 'starter').length,
      rotationCount: players.filter((player) => player.band === 'rotation').length,
      benchCount: players.filter((player) => player.band === 'bench').length,
      unassignedCount: players.filter((player) => player.band === 'unassigned').length,
      players,
    }
  })

  return {
    lanes,
    rosterCount: roster.length,
  }
}
