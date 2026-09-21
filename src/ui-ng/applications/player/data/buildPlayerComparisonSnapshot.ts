import type { PlayerTruthRatingKey, PlayerTruthRatings, Player } from '@/domain/player'
import { PLAYER_TRUTH_RATING_KEYS } from '@/domain/player'
import type { PlayerId } from '@/domain/ids'
import { getPlayerAge } from '@/domain/player'
import { getPlayerRosterTeamId, type GameWorld } from '@/domain/world'

/** One selectable rival in the comparison picker. */
export interface ComparablePlayerOption {
  readonly id: PlayerId
  readonly name: string
  readonly position: string
  readonly teamName: string
}

/** Everything the comparison panel needs about the other player, and nothing it does not. */
export interface PlayerComparisonSnapshot {
  readonly playerId: PlayerId
  readonly name: string
  readonly position: string
  readonly teamName: string
  readonly age: number
  readonly ratings: PlayerTruthRatings
}

function displayName(player: Player): string {
  return `${player.firstName} ${player.lastName}`
}

function teamNameFor(world: GameWorld, playerId: PlayerId): string {
  const teamId = getPlayerRosterTeamId(world, playerId)
  const team = teamId === undefined ? undefined : world.teams[teamId]
  return team?.name ?? 'Free agent'
}

/**
 * Every player that can be put side by side with the inspected one.
 *
 * The whole world is offered on purpose: scouting a rival outside your roster is the point of the
 * comparison, and the panel filters by name rather than by squad.
 */
export function comparablePlayerOptions(
  world: GameWorld,
  inspectedPlayerId: PlayerId,
): readonly ComparablePlayerOption[] {
  return Object.values(world.players)
    .filter((player) => player.id !== inspectedPlayerId)
    .map((player) => ({
      id: player.id,
      name: displayName(player),
      position: player.basketball.primaryPosition,
      teamName: teamNameFor(world, player.id),
    }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
}

export function buildPlayerComparisonSnapshot(
  world: GameWorld,
  playerId: PlayerId,
): PlayerComparisonSnapshot | undefined {
  const player = world.players[playerId]
  if (player === undefined) return undefined

  return {
    playerId,
    name: displayName(player),
    position: player.basketball.primaryPosition,
    teamName: teamNameFor(world, playerId),
    age: getPlayerAge(world, playerId),
    ratings: Object.fromEntries(
      PLAYER_TRUTH_RATING_KEYS.map((key) => [key, player.basketball.ratings[key]]),
    ) as Readonly<Record<PlayerTruthRatingKey, number>>,
  }
}
