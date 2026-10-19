import { getTeamLineup, updateGameWorld, type GameWorld } from '@/domain/world'
import { assignLineupSlot, clearLineupSlot as clearSlot, type LineupSlot, type TeamLineup } from '@/domain/tactics'
import type { PlayerId, TeamId } from '@/domain/ids'
import { assertLineupCandidate } from './LineupAvailability'

/**
 * Assigns `playerId` to `slot` in the team's canonical lineup, deterministically
 * vacating any other slot the player held and displacing (unassigning) whoever
 * previously occupied `slot`. The single source of truth for starters/bench across
 * Plantilla, Tactics and the match preparation. Only players who can actually play the
 * team's next game (roster member, active, healthy, eligible) may be selected: a rejected
 * selection throws a `LineupSelectionError` and leaves the world untouched.
 */
export function setLineupSlot(world: GameWorld, teamId: TeamId, slot: LineupSlot, playerId: PlayerId): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new Error(`Unknown team: ${teamId}`)
  if (!team.rosterPlayerIds.includes(playerId)) throw new Error(`Player ${playerId} is not on team ${teamId}'s roster`)
  assertLineupCandidate(world, teamId, playerId)

  const lineup = getTeamLineup(world, teamId)
  return withLineup(world, teamId, assignLineupSlot(lineup, slot, playerId))
}

/** Vacates `slot`, leaving its former occupant (if any) unassigned. */
export function clearLineupSlot(world: GameWorld, teamId: TeamId, slot: LineupSlot): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new Error(`Unknown team: ${teamId}`)

  const lineup = getTeamLineup(world, teamId)
  return withLineup(world, teamId, clearSlot(lineup, slot))
}

function withLineup(world: GameWorld, teamId: TeamId, lineup: TeamLineup): GameWorld {
  return updateGameWorld(world, { lineupsByTeamId: { ...world.lineupsByTeamId, [teamId]: lineup } })
}
