import type { GameId, OrganizationId, PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import type { ScoutingMission, ScoutingPriority, ScoutingTerritory, ScoutingTerritoryAssignment } from '@/domain/scouting'
import type { ScoutingTerritoryCoverage } from '@/engine/scouting/ScoutingTerritoryOperations'
import { getFreeAgents, getNextScheduledGame, type GameWorld } from '@/domain/world'
import { getEligibleScoutingEvaluators, requestScouting, updateScoutingAssignmentPriority as setAssignmentPriority, cancelScoutingAssignment as cancelAssignment } from '@/engine/scouting'
import { getTeamsInScoutingTerritory } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { getDraftCandidates } from '@/engine/draft/DraftEngine'
import { createScoutingTerritoryAssignment as createTerritoryOperation, endScoutingTerritoryAssignment as endTerritoryOperation, getScoutingTerritoryCoverage as deriveTerritoryCoverage } from '@/engine/scouting/ScoutingTerritoryOperations'

export type { ScoutingTerritoryCoverage } from '@/engine/scouting/ScoutingTerritoryOperations'

export interface RequestScoutingInput {
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly missionType: ScoutingMission
  readonly evaluatorStaffId?: StaffPersonId
  readonly priority?: ScoutingPriority
  readonly targetDimension?: string
  readonly gameId?: string
}

/** Publicly addressable candidates for this club, plus identities the organization already knows. */
export function getAddressableScoutingPlayerIds(world: GameWorld, teamId: TeamId): readonly PlayerId[] {
  const team = world.teams[teamId]
  if (team === undefined) return []
  const ids = new Set<PlayerId>([
    ...team.rosterPlayerIds,
    ...world.organizationKnowledge.filter((entry) => entry.organizationId === team.organizationId).map((entry) => entry.subjectPlayerId),
    ...Object.values(world.organizationPlayerAwarenessById).filter((entry) => entry.organizationId === team.organizationId).map((entry) => entry.playerId),
    ...world.marketKnowledge.filter((entry) => entry.organizationId === team.organizationId).map((entry) => entry.playerId),
    ...getFreeAgents(world).map((player) => player.id),
  ])
  const nextGame = getNextScheduledGame(world, teamId)
  if (nextGame !== undefined) {
    const opponentId = nextGame.homeTeamId === teamId ? nextGame.awayTeamId : nextGame.homeTeamId
    for (const playerId of world.teams[opponentId]?.rosterPlayerIds ?? []) ids.add(playerId)
    const ecosystemId = world.competitions[nextGame.competitionId]?.ecosystemId
    for (const draft of Object.values(world.draftsById)) if (draft.ecosystemId === ecosystemId && (draft.status === 'scheduled' || draft.status === 'inProgress')) for (const playerId of getDraftCandidates(world, draft.id)) ids.add(playerId)
  }
  for (const board of world.recruitingBoards) {
    if (board.programTeamId !== teamId) continue
    const profile = world.recruitProfilesById[board.recruitId]
    if (profile?.status === 'open') ids.add(profile.playerId)
  }
  return [...ids].filter((playerId) => world.players[playerId] !== undefined).sort((a, b) => a.localeCompare(b))
}

export function getScoutingCandidatesForUser(world: GameWorld): readonly PlayerId[] {
  const team = getUserTeam(world)
  return team === undefined ? [] : getAddressableScoutingPlayerIds(world, team.id)
}

export function getAvailableScoutingEvaluators(world: GameWorld, teamId: TeamId, missionType: ScoutingMission): readonly StaffPersonId[] {
  return getEligibleScoutingEvaluators(world, teamId, missionType)
}

export function requestPlayerScouting(world: GameWorld, input: RequestScoutingInput): GameWorld {
  const team = world.teams[input.teamId]
  if (team === undefined || team.coachId !== world.userCoachId) throw new Error('Scouting requests must come from the user-controlled team')
  if (!getAddressableScoutingPlayerIds(world, team.id).includes(input.playerId)) throw new Error('Player is not currently addressable to this organization')
  if (Object.values(world.scoutingAssignmentsById).some((assignment) => assignment.organizationId === team.organizationId && assignment.subjectPlayerId === input.playerId && assignment.status !== 'COMPLETED' && assignment.status !== 'CANCELLED')) throw new Error('This Player already has an active or queued Scouting assignment')
  const eligible = getAvailableScoutingEvaluators(world, team.id, input.missionType)
  if (eligible.length === 0) throw new Error('No eligible Scout has capacity for this mission')
  if (input.evaluatorStaffId !== undefined && !eligible.includes(input.evaluatorStaffId)) throw new Error('Selected Staff is not eligible for this mission or lacks capacity')
  if (input.missionType === 'LIVE_GAME') {
    const playerTeam = Object.values(world.teams).find((candidate) => candidate.rosterPlayerIds.includes(input.playerId))
    const game = input.gameId === undefined ? undefined : world.games[input.gameId as GameId]
    if (playerTeam === undefined || game?.status !== 'scheduled' || game.date <= world.currentDate || (game.homeTeamId !== playerTeam.id && game.awayTeamId !== playerTeam.id)) throw new Error('Choose an upcoming scheduled game involving this Player')
  }
  return requestScouting(world, { organizationId: team.organizationId, teamContextId: team.id, playerId: input.playerId, missionType: input.missionType, evaluatorStaffId: input.evaluatorStaffId, priority: input.priority, targetDimension: input.targetDimension, gameId: input.gameId, requestedBy: 'HEAD_COACH' })
}

export function updateScoutingAssignmentPriority(world: GameWorld, assignmentId: string, priority: ScoutingPriority): GameWorld {
  return setAssignmentPriority(world, assignmentId, priority)
}

export function cancelScoutingAssignment(world: GameWorld, assignmentId: string): GameWorld {
  return cancelAssignment(world, assignmentId)
}

export function createScoutingTerritoryAssignment(world: GameWorld, input: { readonly requestingTeamId: TeamId; readonly scoutStaffId: StaffPersonId; readonly territory: ScoutingTerritory }): GameWorld {
  return createTerritoryOperation(world, input)
}

export function endScoutingTerritoryAssignment(world: GameWorld, assignmentId: string): GameWorld {
  return endTerritoryOperation(world, assignmentId)
}

export function getScoutingTerritoryAssignments(world: GameWorld, teamId: TeamId): readonly ScoutingTerritoryAssignment[] {
  return Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.requestingTeamId === teamId).sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id))
}

export function getOrganizationPlayerAwareness(world: GameWorld, organizationId: OrganizationId, playerId?: PlayerId) {
  return Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId && (playerId === undefined || item.playerId === playerId)).sort((a, b) => a.discoveredAt.localeCompare(b.discoveredAt) || a.playerId.localeCompare(b.playerId))
}

export function getScoutingTerritoryCoverage(world: GameWorld, organizationId: OrganizationId, territory: ScoutingTerritory): ScoutingTerritoryCoverage {
  return deriveTerritoryCoverage(world, organizationId, territory)
}

export function getValidScoutingTerritories(world: GameWorld): readonly ScoutingTerritory[] {
  const countries = new Set(Object.values(world.teams).map((team) => team.countryId).filter((id) => Object.values(world.teams).some((team) => team.countryId === id && team.rosterPlayerIds.length > 0)))
  const territories: ScoutingTerritory[] = [...countries].sort().map((countryId) => ({ kind: 'COUNTRY', countryId }))
  for (const competition of Object.values(world.competitions).filter((item) => getTeamsInScoutingTerritory(world, { kind: 'COMPETITION', competitionId: item.id }).length > 0).sort((a, b) => a.id.localeCompare(b.id))) territories.push({ kind: 'COMPETITION', competitionId: competition.id })
  return territories
}
