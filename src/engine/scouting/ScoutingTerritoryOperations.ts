import { createOrganizationPlayerAwareness, SCOUTING_TERRITORY_WORKLOAD_COST, scoutingTerritoryKey } from '@/domain/scouting'
import { getPlayersInScoutingTerritory, isStaffRoleSuitableForScoutingTerritory, updateGameWorld, type GameWorld } from '@/domain/world'
import { calculateStaffRoleProficiencyByRoleId, type StaffRoleId } from '@/domain/staff'
import type { StaffPersonId } from '@/domain/ids'
import { calculateStaffWorkload } from '@/domain/world'
import { hashStringToSeed } from '@/engine/random'
import { activeWorkload, evaluatorProfile } from './ScoutingEngine'

const MAX_DAILY_DISCOVERIES = 3

/** Progresses only persisted active operations. No rating or potential knowledge is produced. */
export function progressScoutingTerritoryAssignments(world: GameWorld): GameWorld {
  let next = world
  const assignments = Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.status === 'ACTIVE').sort((a, b) => a.id.localeCompare(b.id))
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
    const eligible = getPlayersInScoutingTerritory(next, assignment.territory).filter((id) => !awareness.has(id) && !evaluated.has(id) && !ownRoster.has(id))
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
