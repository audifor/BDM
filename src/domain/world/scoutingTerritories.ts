import type { CompetitionId, CountryId, PlayerId, TeamId } from '@/domain/ids'
import { SCOUTING_TERRITORY_ROLES, type ScoutingTerritory } from '@/domain/scouting'
import type { StaffRoleId } from '@/domain/staff'
import type { GameWorld } from './GameWorld'

export function getTeamsInScoutingTerritory(world: GameWorld, territory: ScoutingTerritory) {
  if (territory.kind === 'COUNTRY') return Object.values(world.teams).filter((team) => team.countryId === territory.countryId).sort((a, b) => a.id.localeCompare(b.id))
  const competition = world.competitions[territory.competitionId]
  return competition === undefined ? [] : competition.participantTeamIds.flatMap((id) => world.teams[id] === undefined ? [] : [world.teams[id]!]).sort((a, b) => a.id.localeCompare(b.id))
}

export function getPlayersInScoutingTerritory(world: GameWorld, territory: ScoutingTerritory): readonly PlayerId[] {
  return [...new Set(getTeamsInScoutingTerritory(world, territory).flatMap((team) => team.rosterPlayerIds).filter((id) => world.players[id] !== undefined))].sort()
}

export function resolveTerritoryCountry(world: GameWorld, territory: ScoutingTerritory): CountryId | undefined {
  if (territory.kind === 'COUNTRY') return world.countries[territory.countryId] === undefined ? undefined : territory.countryId
  const countryIds = [...new Set(getTeamsInScoutingTerritory(world, territory).map((team) => team.countryId))]
  return countryIds.length === 1 && world.countries[countryIds[0]!] !== undefined ? countryIds[0] : undefined
}

export function isPlayerCurrentlyInTerritory(world: GameWorld, playerId: PlayerId, territory: ScoutingTerritory): boolean {
  return world.players[playerId] !== undefined && getTeamsInScoutingTerritory(world, territory).some((team) => team.rosterPlayerIds.includes(playerId))
}

export function isStaffRoleSuitableForScoutingTerritory(world: GameWorld, teamId: TeamId, roleId: StaffRoleId, territory: ScoutingTerritory): boolean {
  if (!SCOUTING_TERRITORY_ROLES[territory.kind].includes(roleId)) return false
  if (territory.kind === 'COUNTRY') {
    if (world.countries[territory.countryId] === undefined) return false
    return roleId !== 'internationalScout' || world.teams[teamId]?.countryId !== territory.countryId
  }
  const competition = world.competitions[territory.competitionId]
  if (competition === undefined || getTeamsInScoutingTerritory(world, territory).length === 0) return false
  const ecosystemKind = world.ecosystems[competition.ecosystemId]?.kind
  if (roleId === 'collegeScout') return ecosystemKind === 'ncaaLike'
  if (roleId === 'proScout') return ecosystemKind === 'fibaLike' || ecosystemKind === 'nbaLike'
  if (roleId === 'internationalScout') return getTeamsInScoutingTerritory(world, territory).some((team) => team.countryId !== world.teams[teamId]?.countryId)
  return true
}

export function scoutingTerritoryForCompetition(competitionId: CompetitionId): ScoutingTerritory {
  return { kind: 'COMPETITION', competitionId }
}
