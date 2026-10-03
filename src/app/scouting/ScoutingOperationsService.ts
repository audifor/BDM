import type { OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { ScoutingTerritory, ScoutingTerritoryAssignment } from '@/domain/scouting'
import { scoutingTerritoryKey } from '@/domain/scouting'
import { getPlayersInScoutingTerritory, getTeamsInScoutingTerritory, isStaffRoleSuitableForScoutingTerritory, updateGameWorld, type GameWorld } from '@/domain/world'

export interface ScoutingTerritoryCoverage {
  readonly territory: ScoutingTerritory
  readonly eligiblePlayerCount: number
  readonly discoveredPlayerCount: number
  readonly knownPlayerCount: number
  readonly coverage: number
}

export function createScoutingTerritoryAssignment(world: GameWorld, input: { readonly requestingTeamId: TeamId; readonly scoutStaffId: StaffPersonId; readonly territory: ScoutingTerritory }): GameWorld {
  const team = world.teams[input.requestingTeamId]
  if (team === undefined) throw new RangeError(`Unknown requesting Team ${input.requestingTeamId}`)
  const staff = world.staffPeopleById[input.scoutStaffId]
  if (staff === undefined) throw new RangeError(`Unknown Scout ${input.scoutStaffId}`)
  const employment = world.staffEmploymentByStaffId[input.scoutStaffId]
  const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.staffPersonId === input.scoutStaffId)
  if (employment?.status !== 'employed' || employment.teamId !== team.id || assignment === undefined) throw new RangeError('Scout must be employed and assigned to the requesting Team')
  if (!isStaffRoleSuitableForScoutingTerritory(world, team.id, assignment.role, input.territory)) throw new RangeError(`Staff role ${assignment.role} is not suitable for ${input.territory.kind} scouting`)
  if (getTeamsInScoutingTerritory(world, input.territory).length === 0) throw new RangeError('Scouting territory has no current basketball context')
  if (Object.values(world.scoutingTerritoryAssignmentsById).some((item) => item.organizationId === team.organizationId && item.requestingTeamId === team.id && item.scoutStaffId === input.scoutStaffId && item.status === 'ACTIVE' && scoutingTerritoryKey(item.territory) === scoutingTerritoryKey(input.territory))) return world
  const prefix = `scouting-territory:${team.id}:${input.scoutStaffId}:${scoutingTerritoryKey(input.territory)}:${world.currentDate}`
  let sequence = 1
  while (world.scoutingTerritoryAssignmentsById[`${prefix}:${sequence}`] !== undefined) sequence += 1
  const record: ScoutingTerritoryAssignment = { id: `${prefix}:${sequence}`, organizationId: team.organizationId, requestingTeamId: team.id, scoutStaffId: input.scoutStaffId, territory: input.territory, startedAt: world.currentDate, status: 'ACTIVE' }
  return updateGameWorld(world, { scoutingTerritoryAssignments: [...Object.values(world.scoutingTerritoryAssignmentsById), record] })
}

export function endScoutingTerritoryAssignment(world: GameWorld, assignmentId: string): GameWorld {
  const assignment = world.scoutingTerritoryAssignmentsById[assignmentId]
  if (assignment === undefined || assignment.status === 'ENDED') return world
  return updateGameWorld(world, { scoutingTerritoryAssignments: Object.values(world.scoutingTerritoryAssignmentsById).map((item) => item.id === assignmentId ? { ...item, status: 'ENDED', endedAt: world.currentDate } : item) })
}

export function getScoutingTerritoryAssignments(world: GameWorld, teamId: TeamId): readonly ScoutingTerritoryAssignment[] {
  return Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.requestingTeamId === teamId).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
}

export function getOrganizationPlayerAwareness(world: GameWorld, organizationId: OrganizationId, playerId?: PlayerId) {
  return Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId && (playerId === undefined || item.playerId === playerId)).sort((a, b) => a.discoveredAt.localeCompare(b.discoveredAt) || a.playerId.localeCompare(b.playerId))
}

export function getScoutingTerritoryCoverage(world: GameWorld, organizationId: OrganizationId, territory: ScoutingTerritory): ScoutingTerritoryCoverage {
  const eligible = getPlayersInScoutingTerritory(world, territory)
  const eligibleSet = new Set(eligible)
  const discovered = new Set(Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId && eligibleSet.has(item.playerId)).map((item) => item.playerId))
  const evaluated = new Set(world.organizationKnowledge.filter((item) => item.organizationId === organizationId && eligibleSet.has(item.subjectPlayerId)).map((item) => item.subjectPlayerId))
  const ownPlayers = new Set(Object.values(world.teams).filter((team) => team.organizationId === organizationId).flatMap((team) => team.rosterPlayerIds).filter((playerId) => eligibleSet.has(playerId)))
  const known = new Set([...discovered, ...evaluated, ...ownPlayers])
  return Object.freeze({ territory, eligiblePlayerCount: eligible.length, discoveredPlayerCount: discovered.size, knownPlayerCount: known.size, coverage: eligible.length === 0 ? 0 : known.size / eligible.length })
}
