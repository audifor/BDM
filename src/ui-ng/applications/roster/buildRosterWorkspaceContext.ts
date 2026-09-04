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

export function buildRosterWorkspaceContext(world: GameWorld): RosterWorkspaceContextModel | null {
  const team = getUserTeam(world)
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

/** Resolve team for roster when user team exists. */
export function rosterTeamForWorld(world: GameWorld) {
  return getUserTeam(world)
}

export { findTeamForPlayer }
