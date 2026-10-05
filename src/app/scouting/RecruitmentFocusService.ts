import type { PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { calculateAge } from '@/domain/player'
import { getOrganizationRatingEvaluation } from '@/domain/intelligence'
import { createScoutingRecruitmentFocus, type RecruitmentFocusDuration, type ScoutingMission, type ScoutingPriority, type ScoutingTerritory } from '@/domain/scouting'
import type { BasketballPosition } from '@/domain/primitives'
import { calculateStaffWorkload, getPlayersInScoutingTerritory, isStaffRoleSuitableForScoutingTerritory, updateGameWorld, type GameWorld } from '@/domain/world'
import { createScoutingTerritoryAssignment, endScoutingTerritoryAssignment } from '@/engine/scouting/ScoutingTerritoryOperations'
import { getAddressableScoutingPlayerIds } from './ScoutingOperationsService'

export interface CreateRecruitmentFocusInput {
  readonly name: string
  readonly positions: readonly BasketballPosition[]
  readonly minimumAge?: number
  readonly maximumAge?: number
  readonly knowledgeState?: 'ANY' | 'DISCOVERED' | 'EVALUATED'
  readonly evaluationDimension?: 'finishing' | 'shooting' | 'creation' | 'perimeterDefense' | 'interiorDefense' | 'rebounding' | 'physical'
  readonly minimumCurrentLevel?: number
  readonly minimumPotentialLevel?: number
  readonly territories: readonly ScoutingTerritory[]
  readonly scoutStaffIds: readonly StaffPersonId[]
  readonly priority: ScoutingPriority
  readonly duration: RecruitmentFocusDuration
}

export interface RecruitmentFocusCandidate {
  readonly playerId: PlayerId
  readonly name: string
  readonly position: BasketballPosition
  readonly age: number
  readonly teamName: string
  readonly competitionName: string
  readonly knowledge: 'DISCOVERED' | 'EVALUATED'
  readonly fit: 'UNKNOWN' | 'ESTIMATED'
  readonly confidence: number
  readonly reasons: readonly string[]
  readonly scoutingStatus: 'NOT_SCOUTED' | 'IN_PROGRESS' | 'REPORTED'
  readonly activeMission?: ScoutingMission
  readonly activeScoutName?: string
}

export function createRecruitmentFocus(world: GameWorld, teamId: TeamId, input: CreateRecruitmentFocusInput): GameWorld {
  const team = world.teams[teamId]
  if (team === undefined || team.coachId !== world.userCoachId) throw new Error('Recruitment Focuses are managed by the user-controlled team')
  const scoutStaffIds = [...new Set(input.scoutStaffIds)]
  if (scoutStaffIds.length === 0) throw new Error('Assign at least one Scout')
  const focusId = `recruitment-focus:${team.id}:${world.currentDate}:${Object.keys(world.scoutingRecruitmentFocusesById).length + 1}`
  let next = updateGameWorld(world, { scoutingRecruitmentFocuses: [...Object.values(world.scoutingRecruitmentFocusesById), createScoutingRecruitmentFocus({ id: focusId, organizationId: team.organizationId, requestingTeamId: team.id, name: input.name, positions: input.positions, minimumAge: input.minimumAge, maximumAge: input.maximumAge, knowledgeState: input.knowledgeState, evaluationDimension: input.evaluationDimension, minimumCurrentLevel: input.minimumCurrentLevel, minimumPotentialLevel: input.minimumPotentialLevel, territories: input.territories, scoutStaffIds, priority: input.priority, duration: input.duration, daysActive: 0, status: 'ACTIVE', createdAt: world.currentDate, lastProcessedAt: world.currentDate })] })
  for (const staffId of scoutStaffIds) {
    const staffAssignment = Object.values(next.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.staffPersonId === staffId)
    if (staffAssignment === undefined || next.staffEmploymentByStaffId[staffId]?.status !== 'employed') throw new Error('Every selected Scout must be employed by the team')
    for (const territory of input.territories) {
      if (!isStaffRoleSuitableForScoutingTerritory(next, team.id, staffAssignment.role, territory)) throw new Error(`Selected Scout is not suitable for ${territory.kind} scouting`)
      next = createScoutingTerritoryAssignment(next, { requestingTeamId: team.id, scoutStaffId: staffId, territory, recruitmentFocusId: focusId, priority: input.priority })
    }
  }
  return next
}

export function updateRecruitmentFocusPriority(world: GameWorld, focusId: string, priority: ScoutingPriority): GameWorld {
  const focus = world.scoutingRecruitmentFocusesById[focusId]
  if (focus === undefined || focus.status !== 'ACTIVE') throw new Error('Active Recruitment Focus not found')
  return updateGameWorld(world, { scoutingRecruitmentFocuses: Object.values(world.scoutingRecruitmentFocusesById).map((item) => item.id === focusId ? { ...item, priority } : item), scoutingTerritoryAssignments: Object.values(world.scoutingTerritoryAssignmentsById).map((item) => item.recruitmentFocusId === focusId && item.status === 'ACTIVE' ? { ...item, priority } : item) })
}

export function editRecruitmentFocusCriteria(world: GameWorld, focusId: string, criteria: Pick<CreateRecruitmentFocusInput, 'name' | 'positions' | 'minimumAge' | 'maximumAge' | 'knowledgeState' | 'evaluationDimension' | 'minimumCurrentLevel' | 'minimumPotentialLevel'>): GameWorld {
  const focus = world.scoutingRecruitmentFocusesById[focusId]
  if (focus === undefined || focus.status !== 'ACTIVE') throw new Error('Active Recruitment Focus not found')
  const updated = createScoutingRecruitmentFocus({ ...focus, ...criteria })
  return updateGameWorld(world, { scoutingRecruitmentFocuses: Object.values(world.scoutingRecruitmentFocusesById).map((item) => item.id === focusId ? updated : item) })
}

export function cancelRecruitmentFocus(world: GameWorld, focusId: string): GameWorld {
  const focus = world.scoutingRecruitmentFocusesById[focusId]
  if (focus === undefined || focus.status !== 'ACTIVE') return world
  let next = updateGameWorld(world, { scoutingRecruitmentFocuses: Object.values(world.scoutingRecruitmentFocusesById).map((item) => item.id === focusId ? { ...item, status: 'CANCELLED', cancelledAt: world.currentDate } : item) })
  for (const operation of Object.values(next.scoutingTerritoryAssignmentsById).filter((item) => item.recruitmentFocusId === focusId && item.status === 'ACTIVE')) next = endScoutingTerritoryAssignment(next, operation.id)
  return next
}

export function dismissRecruitmentFocusCandidate(world: GameWorld, focusId: string, playerId: import('@/domain/ids').PlayerId): GameWorld {
  const focus = world.scoutingRecruitmentFocusesById[focusId]
  if (focus === undefined) throw new Error('Recruitment Focus not found')
  if (!getRecruitmentFocusCandidates(world, focusId).some((candidate) => candidate.playerId === playerId)) throw new Error('Player is not a current candidate for this Recruitment Focus')
  return updateGameWorld(world, { scoutingRecruitmentFocuses: Object.values(world.scoutingRecruitmentFocusesById).map((item) => item.id === focusId ? { ...item, dismissedPlayerIds: [...new Set([...(item.dismissedPlayerIds ?? []), playerId])] } : item) })
}

export function getRecruitmentFocusCandidates(world: GameWorld, focusId: string): readonly RecruitmentFocusCandidate[] {
  const focus = world.scoutingRecruitmentFocusesById[focusId]
  if (focus === undefined) return []
  const eligible = new Set(focus.territories.flatMap((territory) => getPlayersInScoutingTerritory(world, territory)))
  const addressable = new Set(getAddressableScoutingPlayerIds(world, focus.requestingTeamId))
  const dismissed = new Set(focus.dismissedPlayerIds ?? [])
  return [...eligible].filter((id) => addressable.has(id) && !dismissed.has(id)).flatMap((id) => {
    const player = world.players[id]!
    const age = calculateAge(player.bio.dateOfBirth, world.currentDate)
    if (!focus.positions.includes(player.basketball.primaryPosition) || (focus.minimumAge !== undefined && age < focus.minimumAge) || (focus.maximumAge !== undefined && age > focus.maximumAge)) return []
    const awareness = Object.values(world.organizationPlayerAwarenessById).some((item) => item.organizationId === focus.organizationId && item.playerId === id)
    const knowledge = world.organizationKnowledge.some((item) => item.organizationId === focus.organizationId && item.subjectPlayerId === id)
    if (!awareness && !knowledge) return []
    const currentKnowledgeState = knowledge ? 'EVALUATED' : 'DISCOVERED'
    if (focus.knowledgeState !== undefined && focus.knowledgeState !== 'ANY' && focus.knowledgeState !== currentKnowledgeState) return []
    const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(id))
    const competition = team === undefined ? undefined : Object.values(world.competitions).find((item) => item.participantTeamIds.includes(team.id))
    const current = focus.evaluationDimension === undefined || focus.minimumCurrentLevel === undefined ? undefined : getOrganizationRatingEvaluation({ organizationId: focus.organizationId, playerId: id, dimension: focus.evaluationDimension, knowledge: world.organizationKnowledge, currentDate: world.currentDate, publicPosition: player.basketball.primaryPosition })
    const potential = focus.evaluationDimension === undefined || focus.minimumPotentialLevel === undefined ? undefined : getOrganizationRatingEvaluation({ organizationId: focus.organizationId, playerId: id, dimension: `potential:${focus.evaluationDimension}`, knowledge: world.organizationKnowledge, currentDate: world.currentDate, publicPosition: player.basketball.primaryPosition })
    const checks = [current, potential].filter((item) => item !== undefined)
    const unknown = checks.some((item) => item.mode === 'UNKNOWN' || item.estimate === undefined)
    const reasons = ['Position matches', `Age ${age} matches`, 'Within selected territory', ...(current === undefined ? [] : [current.mode === 'UNKNOWN' ? `${focus.evaluationDimension} evidence unknown` : current.estimate! >= focus.minimumCurrentLevel! ? `${focus.evaluationDimension} current estimate meets target` : `${focus.evaluationDimension} current estimate below target`]), ...(potential === undefined ? [] : [potential.mode === 'UNKNOWN' ? `${focus.evaluationDimension} potential evidence unknown` : potential.estimate! >= focus.minimumPotentialLevel! ? `${focus.evaluationDimension} potential estimate meets target` : `${focus.evaluationDimension} potential estimate below target`])]
    const confidence = checks.length === 0 ? (knowledge ? 65 : 35) : Math.round(checks.reduce((sum, item) => sum + (item.mode === 'UNKNOWN' ? 0 : item.confidence), 0) / checks.length)
    const activeAssignment = Object.values(world.scoutingAssignmentsById).find((assignment) => assignment.organizationId === focus.organizationId && assignment.subjectPlayerId === id && (assignment.status === 'ACTIVE' || assignment.status === 'QUEUED'))
    const hasReport = Object.values(world.evaluatorReportsById).some((report) => report.organizationId === focus.organizationId && report.subjectPlayerId === id)
    const activeScout = activeAssignment === undefined ? undefined : world.staffPeopleById[activeAssignment.evaluatorStaffId]
    return [{ playerId: id, name: `${player.firstName} ${player.lastName}`, position: player.basketball.primaryPosition, age, teamName: team?.name ?? 'Free agent', competitionName: competition?.name ?? '—', knowledge: knowledge ? 'EVALUATED' as const : 'DISCOVERED' as const, fit: unknown ? 'UNKNOWN' as const : 'ESTIMATED' as const, confidence, reasons, scoutingStatus: activeAssignment !== undefined ? 'IN_PROGRESS' as const : hasReport ? 'REPORTED' as const : 'NOT_SCOUTED' as const, ...(activeAssignment === undefined ? {} : { activeMission: activeAssignment.missionType, ...(activeScout === undefined ? {} : { activeScoutName: `${activeScout.identity.firstName} ${activeScout.identity.lastName}` }) }) }]
  }).sort((a, b) => a.age - b.age || a.name.localeCompare(b.name))
}

export function searchAddressableScoutingPlayers(world: GameWorld, teamId: TeamId, filters: { readonly name?: string; readonly position?: BasketballPosition | ''; readonly minimumAge?: number; readonly maximumAge?: number; readonly countryId?: string; readonly competitionId?: string; readonly rosterTeamId?: TeamId | ''; readonly marketStatus?: 'ANY' | 'ROSTERED' | 'FREE_AGENT'; readonly knowledge?: 'ANY' | 'UNKNOWN' | 'DISCOVERED' | 'EVALUATED'; readonly scoutingStatus?: 'ANY' | 'NOT_SCOUTED' | 'ACTIVE' | 'REPORTED'; readonly evaluationDimension?: 'finishing' | 'shooting' | 'creation' | 'perimeterDefense' | 'interiorDefense' | 'rebounding' | 'physical'; readonly minimumCurrentLevel?: number; readonly minimumPotentialLevel?: number }): readonly PlayerId[] {
  const organizationId = world.teams[teamId]?.organizationId
  return getAddressableScoutingPlayerIds(world, teamId).filter((id) => {
    const player = world.players[id]!
    const name = `${player.firstName} ${player.lastName}`.toLowerCase()
    const age = calculateAge(player.bio.dateOfBirth, world.currentDate)
    const team = Object.values(world.teams).find((item) => item.rosterPlayerIds.includes(id))
    const discovered = Object.values(world.organizationPlayerAwarenessById).some((item) => item.playerId === id && item.organizationId === organizationId)
    const evaluated = world.organizationKnowledge.some((item) => item.subjectPlayerId === id && item.organizationId === organizationId)
    const state = evaluated ? 'EVALUATED' : discovered ? 'DISCOVERED' : 'UNKNOWN'
    const active = Object.values(world.scoutingAssignmentsById).some((item) => item.organizationId === organizationId && item.subjectPlayerId === id && (item.status === 'ACTIVE' || item.status === 'QUEUED'))
    const reported = Object.values(world.evaluatorReportsById).some((item) => item.organizationId === organizationId && item.subjectPlayerId === id)
    const scoutingState = active ? 'ACTIVE' : reported ? 'REPORTED' : 'NOT_SCOUTED'
    const current = filters.evaluationDimension === undefined || filters.minimumCurrentLevel === undefined || organizationId === undefined ? undefined : getOrganizationRatingEvaluation({ organizationId, playerId: id, dimension: filters.evaluationDimension, knowledge: world.organizationKnowledge, currentDate: world.currentDate, publicPosition: player.basketball.primaryPosition })
    const potential = filters.evaluationDimension === undefined || filters.minimumPotentialLevel === undefined || organizationId === undefined ? undefined : getOrganizationRatingEvaluation({ organizationId, playerId: id, dimension: `potential:${filters.evaluationDimension}`, knowledge: world.organizationKnowledge, currentDate: world.currentDate, publicPosition: player.basketball.primaryPosition })
    return (!filters.name || name.includes(filters.name.toLowerCase())) && (!filters.position || player.basketball.primaryPosition === filters.position) && (filters.minimumAge === undefined || age >= filters.minimumAge) && (filters.maximumAge === undefined || age <= filters.maximumAge) && (!filters.countryId || team?.countryId === filters.countryId) && (!filters.competitionId || (team !== undefined && world.competitions[filters.competitionId as never]?.participantTeamIds.includes(team.id))) && (!filters.rosterTeamId || team?.id === filters.rosterTeamId) && (filters.marketStatus === undefined || filters.marketStatus === 'ANY' || (filters.marketStatus === 'ROSTERED' ? team !== undefined : team === undefined)) && (!filters.knowledge || filters.knowledge === 'ANY' || filters.knowledge === state) && (!filters.scoutingStatus || filters.scoutingStatus === 'ANY' || filters.scoutingStatus === scoutingState) && (filters.minimumCurrentLevel === undefined || current !== undefined && current.mode !== 'UNKNOWN' && (current.estimate ?? -1) >= filters.minimumCurrentLevel) && (filters.minimumPotentialLevel === undefined || potential !== undefined && potential.mode !== 'UNKNOWN' && (potential.estimate ?? -1) >= filters.minimumPotentialLevel)
  })
}

export function estimateRecruitmentFocusWorkloadImpact(world: GameWorld, scoutStaffIds: readonly StaffPersonId[]): string {
  return scoutStaffIds.map((id) => { const load = calculateStaffWorkload(world, id); const staff = world.staffPeopleById[id]; return `${staff === undefined ? id : `${staff.identity.firstName} ${staff.identity.lastName}`}: ${load.totalCapacityUsed}/${load.capacityLimit}` }).join(' Ã‚Â· ')
}
