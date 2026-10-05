import { createOrganizationPlayerAwareness, createScoutingTerritoryAssignment as makeScoutingTerritoryAssignment, SCOUTING_TERRITORY_WORKLOAD_COST, scoutingTerritoryKey, type ScoutingTerritory, type ScoutingTerritoryAssignment } from '@/domain/scouting'
import { calculateStaffWorkload, getPlayersInScoutingTerritory, getTeamsInScoutingTerritory, isStaffRoleSuitableForScoutingTerritory, updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateStaffRoleProficiencyByRoleId, type StaffRoleId } from '@/domain/staff'
import type { StaffPersonId } from '@/domain/ids'
import { hashStringToSeed } from '@/engine/random'
import { activeWorkload, evaluatorProfile } from './ScoutingEngine'

const MAX_DAILY_DISCOVERIES = 3

export interface ScoutingTerritoryCoverage {
  readonly territory: ScoutingTerritory
  readonly eligiblePlayerCount: number
  readonly discoveredPlayerCount: number
  readonly knownPlayerCount: number
  readonly coverage: number
}

export function createScoutingTerritoryAssignment(world: GameWorld, input: { readonly requestingTeamId: import('@/domain/ids').TeamId; readonly scoutStaffId: StaffPersonId; readonly territory: ScoutingTerritory; readonly recruitmentFocusId?: string; readonly priority?: import('@/domain/scouting').ScoutingPriority }): GameWorld {
  const team = world.teams[input.requestingTeamId]
  if (team === undefined) throw new RangeError(`Unknown requesting Team ${input.requestingTeamId}`)
  const staff = world.staffPeopleById[input.scoutStaffId]
  if (staff === undefined) throw new RangeError(`Unknown Scout ${input.scoutStaffId}`)
  const employment = world.staffEmploymentByStaffId[input.scoutStaffId]
  const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.staffPersonId === input.scoutStaffId)
  if (employment?.status !== 'employed' || employment.teamId !== team.id || assignment === undefined) throw new RangeError('Scout must be employed and assigned to the requesting Team')
  if (!isStaffRoleSuitableForScoutingTerritory(world, team.id, assignment.role, input.territory)) throw new RangeError(`Staff role ${assignment.role} is not suitable for ${input.territory.kind} scouting`)
  if (getTeamsInScoutingTerritory(world, input.territory).length === 0) throw new RangeError('Scouting territory has no current basketball context')
  if (Object.values(world.scoutingTerritoryAssignmentsById).some((item) => item.organizationId === team.organizationId && item.requestingTeamId === team.id && item.scoutStaffId === input.scoutStaffId && item.status === 'ACTIVE' && item.recruitmentFocusId === input.recruitmentFocusId && scoutingTerritoryKey(item.territory) === scoutingTerritoryKey(input.territory))) return world
  const workload = calculateStaffWorkload(world, input.scoutStaffId)
  if (workload.overloaded || workload.totalCapacityUsed + SCOUTING_TERRITORY_WORKLOAD_COST > workload.capacityLimit) throw new RangeError('Scout does not have enough workload capacity for territory coverage')
  const prefix = `scouting-territory:${team.id}:${input.scoutStaffId}:${scoutingTerritoryKey(input.territory)}:${world.currentDate}`
  let sequence = 1
  while (world.scoutingTerritoryAssignmentsById[`${prefix}:${sequence}`] !== undefined) sequence += 1
  const record: ScoutingTerritoryAssignment = makeScoutingTerritoryAssignment({ id: `${prefix}:${sequence}`, organizationId: team.organizationId, requestingTeamId: team.id, scoutStaffId: input.scoutStaffId, territory: input.territory, ...(input.recruitmentFocusId === undefined ? {} : { recruitmentFocusId: input.recruitmentFocusId }), ...(input.priority === undefined ? {} : { priority: input.priority }), startedAt: world.currentDate, status: 'ACTIVE' })
  return updateGameWorld(world, { scoutingTerritoryAssignments: [...Object.values(world.scoutingTerritoryAssignmentsById), record] })
}

export function endScoutingTerritoryAssignment(world: GameWorld, assignmentId: string): GameWorld {
  const assignment = world.scoutingTerritoryAssignmentsById[assignmentId]
  if (assignment === undefined || assignment.status === 'ENDED') return world
  return updateGameWorld(world, { scoutingTerritoryAssignments: Object.values(world.scoutingTerritoryAssignmentsById).map((item) => item.id === assignmentId ? { ...item, status: 'ENDED', endedAt: world.currentDate } : item) })
}

export function getScoutingTerritoryCoverage(world: GameWorld, organizationId: import('@/domain/ids').OrganizationId, territory: ScoutingTerritory): ScoutingTerritoryCoverage {
  const eligible = getPlayersInScoutingTerritory(world, territory)
  const eligibleSet = new Set(eligible)
  const discovered = new Set(Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === organizationId && eligibleSet.has(item.playerId)).map((item) => item.playerId))
  const evaluated = new Set(world.organizationKnowledge.filter((item) => item.organizationId === organizationId && eligibleSet.has(item.subjectPlayerId)).map((item) => item.subjectPlayerId))
  const ownPlayers = new Set(Object.values(world.teams).filter((team) => team.organizationId === organizationId).flatMap((team) => team.rosterPlayerIds).filter((playerId) => eligibleSet.has(playerId)))
  const known = new Set([...discovered, ...evaluated, ...ownPlayers])
  return Object.freeze({ territory, eligiblePlayerCount: eligible.length, discoveredPlayerCount: discovered.size, knownPlayerCount: known.size, coverage: eligible.length === 0 ? 0 : known.size / eligible.length })
}

/** Progresses only persisted active operations. No rating or potential knowledge is produced. */
export function progressScoutingTerritoryAssignments(world: GameWorld): GameWorld {
  let next = world
  const priorityRank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const
  const assignments = Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.status === 'ACTIVE').sort((a, b) => priorityRank[a.priority ?? 'NORMAL'] - priorityRank[b.priority ?? 'NORMAL'] || a.id.localeCompare(b.id))
  for (const original of assignments) {
    const assignment = next.scoutingTerritoryAssignmentsById[original.id]
    if (assignment === undefined || assignment.status !== 'ACTIVE' || assignment.lastProcessedAt === next.currentDate) continue
    const team = next.teams[assignment.requestingTeamId]
    const staff = next.staffPeopleById[assignment.scoutStaffId]
    const staffAssignment = Object.values(next.teamStaffAssignmentsById).find((item) => item.teamId === assignment.requestingTeamId && item.staffPersonId === assignment.scoutStaffId)
    const employment = next.staffEmploymentByStaffId[assignment.scoutStaffId]
    if (team === undefined || team.organizationId !== assignment.organizationId || staff === undefined
      || staffAssignment === undefined || employment?.status !== 'employed' || employment.teamId !== team.id
      || !isStaffRoleSuitableForScoutingTerritory(next, team.id, staffAssignment.role, assignment.territory)) continue

    const awareness = new Set(Object.values(next.organizationPlayerAwarenessById).filter((item) => item.organizationId === assignment.organizationId).map((item) => item.playerId))
    const evaluated = new Set(next.organizationKnowledge.filter((item) => item.organizationId === assignment.organizationId).map((item) => item.subjectPlayerId))
    const ownRoster = new Set(Object.values(next.teams).filter((item) => item.organizationId === assignment.organizationId).flatMap((item) => item.rosterPlayerIds))
    const focus = assignment.recruitmentFocusId === undefined ? undefined : next.scoutingRecruitmentFocusesById[assignment.recruitmentFocusId]
    if (assignment.recruitmentFocusId !== undefined && (focus === undefined || focus.status !== 'ACTIVE')) continue
    const eligible = getPlayersInScoutingTerritory(next, assignment.territory).filter((id) => {
      if (awareness.has(id) || evaluated.has(id) || ownRoster.has(id)) return false
      if (focus === undefined) return true
      const player = next.players[id]!
      const age = player.bio.dateOfBirth
      const currentAge = Number(next.currentDate.slice(0, 4)) - Number(age.slice(0, 4)) - (next.currentDate.slice(5) < age.slice(5) ? 1 : 0)
      return focus.positions.includes(player.basketball.primaryPosition) && (focus.minimumAge === undefined || currentAge >= focus.minimumAge) && (focus.maximumAge === undefined || currentAge <= focus.maximumAge)
    })
    const quality = operationalQuality(next, assignment.scoutStaffId, staffAssignment.role)
    const loadPenalty = workloadPenalty(next, assignment.scoutStaffId)
    const throughput = Math.max(0, Math.min(MAX_DAILY_DISCOVERIES, 1 + Math.floor(quality / 40) - loadPenalty))
    const selectionSeed = `${assignment.organizationId}:${assignment.scoutStaffId}:${scoutingTerritoryKey(assignment.territory)}:${next.currentDate}`
    const selected = [...eligible].sort((left, right) => hashStringToSeed(`${selectionSeed}:${left}`) - hashStringToSeed(`${selectionSeed}:${right}`) || left.localeCompare(right)).slice(0, throughput)
    const added = selected.map((playerId) => createOrganizationPlayerAwareness({
      id: `player-awareness:${assignment.organizationId}:${playerId}`,
      organizationId: assignment.organizationId,
      playerId,
      discoveredAt: next.currentDate,
      source: 'TERRITORY_DISCOVERY',
      discoveredByStaffId: assignment.scoutStaffId,
      territory: assignment.territory,
    }))
    next = updateGameWorld(next, {
      organizationPlayerAwareness: [...Object.values(next.organizationPlayerAwarenessById), ...added],
      scoutingTerritoryAssignments: Object.values(next.scoutingTerritoryAssignmentsById).map((item) => item.id === assignment.id ? { ...item, lastProcessedAt: next.currentDate } : item),
    })
  }
  return next
}

export function scoutingDiscoveryThroughput(world: GameWorld, assignmentId: string): number {
  const assignment = world.scoutingTerritoryAssignmentsById[assignmentId]
  if (assignment === undefined || assignment.status !== 'ACTIVE') return 0
  const role = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === assignment.requestingTeamId && item.staffPersonId === assignment.scoutStaffId)?.role
  if (role === undefined) return 0
  const quality = operationalQuality(world, assignment.scoutStaffId, role)
  const penalty = workloadPenalty(world, assignment.scoutStaffId)
  return Math.max(0, Math.min(MAX_DAILY_DISCOVERIES, 1 + Math.floor(quality / 40) - penalty))
}

function workloadPenalty(world: GameWorld, staffId: StaffPersonId): number {
  const scoutingLoad = activeWorkload(world, staffId)
  const staffWorkload = calculateStaffWorkload(world, staffId)
  const territoryCost = Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.scoutStaffId === staffId && item.status === 'ACTIVE').length * SCOUTING_TERRITORY_WORKLOAD_COST
  const otherStaffWork = staffWorkload.capacityLimit > 0 && staffWorkload.totalCapacityUsed - territoryCost > staffWorkload.capacityLimit
  return Math.floor(Math.max(0, scoutingLoad - SCOUTING_TERRITORY_WORKLOAD_COST) / 2) + (otherStaffWork ? 1 : 0)
}

function operationalQuality(world: GameWorld, staffId: StaffPersonId, role: StaffRoleId): number {
  const staff = world.staffPeopleById[staffId]!
  const attributes = staff.professional.attributes
  const proficiency = calculateStaffRoleProficiencyByRoleId(staff, role)
  const experience = evaluatorProfile(world, staffId).experience
  return Math.round(proficiency * .4 + attributes.talentEvaluation * .25 + attributes.analysis * .15 + attributes.adaptability * .1 + experience * .1)
}
