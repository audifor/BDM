import { getTeamLineup, updateGameWorld, type GameWorld } from '@/domain/world'
import { assignLineupSlot, clearLineupSlot as clearSlot, type LineupSlot } from '@/domain/tactics'
import type { PlayerId, TeamId } from '@/domain/ids'

/**
 * Assigns `playerId` to `slot` in the team's canonical lineup, deterministically
 * vacating any other slot the player held and displacing (unassigning) whoever
 * previously occupied `slot`. The single source of truth for starters/bench across
 * Plantilla and Tactics.
 */
export function setLineupSlot(world: GameWorld, teamId: TeamId, slot: LineupSlot, playerId: PlayerId): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new Error(`Unknown team: ${teamId}`)
  if (!team.rosterPlayerIds.includes(playerId)) throw new Error(`Player ${playerId} is not on team ${teamId}'s roster`)

  const lineup = getTeamLineup(world, teamId)
  const next = assignLineupSlot(lineup, slot, playerId)
  return updateGameWorld(world, { lineupsByTeamId: { ...world.lineupsByTeamId, [teamId]: next } })
}

/** Vacates `slot`, leaving its former occupant (if any) unassigned. */
export function clearLineupSlot(world: GameWorld, teamId: TeamId, slot: LineupSlot): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined) throw new Error(`Unknown team: ${teamId}`)

  const lineup = getTeamLineup(world, teamId)
  const next = clearSlot(lineup, slot)
  return updateGameWorld(world, { lineupsByTeamId: { ...world.lineupsByTeamId, [teamId]: next } })
}
