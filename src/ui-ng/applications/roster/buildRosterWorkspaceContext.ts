import type { TeamId } from '@/domain/ids'
import { getUserTeam } from '@/engine/calendar'
import type { GameWorld } from '@/domain/world'

import { findTeamForPlayer, teamShortCode } from '@/ui-ng/applications/player/data/presentationHelpers'
import { resolveSeasonLabelForYear } from '@/ui-ng/applications/player/data/buildPlayerContractModel'

export interface RosterWorkspaceContextModel {
  readonly teamName: string
  readonly teamShortCode: string
  readonly rosterCount: number
  readonly competitionLabel: string | null
  readonly seasonLabel: string | null
}

export function buildRosterWorkspaceContext(
  world: GameWorld,
  teamId?: TeamId | null,
): RosterWorkspaceContextModel | null {
  const team = rosterTeamForWorld(world, teamId)
  if (team === undefined) return null

  const season = world.seasons[world.currentSeasonId]
  const competition = season === undefined ? undefined : world.competitions[season.competitionId]
  const seasonLabel = season?.label ?? resolveSeasonLabelForYear(world, Number(world.currentDate.slice(0, 4)))

  return {
    teamName: team.name,
    teamShortCode: teamShortCode(team.name),
    rosterCount: team.rosterPlayerIds.length,
    competitionLabel: competition?.name ?? null,
    seasonLabel: seasonLabel ?? null,
  }
}

/** Resolve the requested team, falling back to the user club. */
export function rosterTeamForWorld(world: GameWorld, teamId?: TeamId | null) {
  if (teamId !== undefined && teamId !== null && world.teams[teamId] !== undefined) {
    return world.teams[teamId]
  }
  return getUserTeam(world)
}

export { findTeamForPlayer }
