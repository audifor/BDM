import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { createScoutingTerritoryAssignment } from '@/app/scouting'
import { addDays } from '@/domain/date'
import { organizationIdForTeam } from '@/domain/ids'
import { getPlayersInScoutingTerritory, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { progressScoutingAssignments, requestScouting } from './ScoutingEngine'
import { progressScoutingTerritoryAssignments, scoutingDiscoveryThroughput } from './ScoutingTerritoryOperations'
import { buildScoutingWorkspaceModel } from '@/ui-ng/applications/scouting/buildScoutingWorkspaceModel'

describe('scouting territory operations', () => {
  it('discovers identity without ratings, exposes the player, then Quick Look adds organization knowledge', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((candidate) => candidate.homeTeamId === team.id || candidate.awayTeamId === team.id)
    expect(game).toBeDefined()
    const competition = base.competitions[game!.competitionId]!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const assigned = createScoutingTerritoryAssignment(base, { requestingTeamId: team.id, scoutStaffId: scout.staffPersonId, territory: { kind: 'COMPETITION', competitionId: competition.id } })
    const discoveredWorld = progressScoutingTerritoryAssignments(assigned)
    const awareness = Object.values(discoveredWorld.organizationPlayerAwarenessById).find((entry) => entry.organizationId === team.organizationId)
    expect(awareness).toBeDefined()
    expect(discoveredWorld.organizationKnowledge.some((entry) => entry.organizationId === team.organizationId && entry.subjectPlayerId === awareness!.playerId)).toBe(false)
    const model = buildScoutingWorkspaceModel(discoveredWorld)!
    const row = model.knowledge.find((entry) => entry.playerId === awareness!.playerId)
    expect(row).toBeDefined()
    expect(row!.knownDomains).toEqual([])
    expect(row!.knowledgeState).toBe('DISCOVERED')
    const otherOrganization = Object.values(discoveredWorld.teams).find((candidate) => candidate.id !== team.id)!.organizationId
    expect(Object.values(discoveredWorld.organizationPlayerAwarenessById).some((entry) => entry.organizationId === otherOrganization && entry.playerId === awareness!.playerId)).toBe(false)

    const requested = requestScouting(discoveredWorld, { organizationId: organizationIdForTeam(team.id), playerId: awareness!.playerId, missionType: 'QUICK_LOOK', evaluatorStaffId: scout.staffPersonId })
    let completed = requested
    for (let day = 0; day < 8; day += 1) completed = progressScoutingAssignments(updateGameWorld(completed, { currentDate: addDays(completed.currentDate, 1) }))
    expect(completed.organizationKnowledge.some((entry) => entry.organizationId === team.organizationId && entry.subjectPlayerId === awareness!.playerId)).toBe(true)
    expect(buildScoutingWorkspaceModel(completed)!.knowledge.find((entry) => entry.playerId === awareness!.playerId)!.knownDomains.length).toBeGreaterThan(0)
  })

  it('is idempotent per date and ends an operation without processing it again', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((candidate) => candidate.homeTeamId === team.id || candidate.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const assigned = createScoutingTerritoryAssignment(base, { requestingTeamId: team.id, scoutStaffId: scout.staffPersonId, territory: { kind: 'COMPETITION', competitionId: game.competitionId } })
    const once = progressScoutingTerritoryAssignments(assigned)
    const twice = progressScoutingTerritoryAssignments(once)
    expect(Object.keys(twice.organizationPlayerAwarenessById)).toHaveLength(Object.keys(once.organizationPlayerAwarenessById).length)
    const operation = Object.values(once.scoutingTerritoryAssignmentsById)[0]!
    const ended = updateGameWorld(once, { scoutingTerritoryAssignments: [{ ...operation, status: 'ENDED', endedAt: once.currentDate }] })
    const afterEnd = progressScoutingTerritoryAssignments(ended)
    expect(Object.keys(afterEnd.organizationPlayerAwarenessById)).toHaveLength(Object.keys(once.organizationPlayerAwarenessById).length)

    const discoveredPlayerId = Object.values(once.organizationPlayerAwarenessById)[0]!.playerId
    const currentClub = Object.values(once.teams).find((candidate) => candidate.rosterPlayerIds.includes(discoveredPlayerId))!
    const moved = updateGameWorld(once, { teams: Object.values(once.teams).map((candidate) => candidate.id === currentClub.id ? { ...candidate, rosterPlayerIds: candidate.rosterPlayerIds.filter((id) => id !== discoveredPlayerId) } : candidate) })
    expect(moved.organizationPlayerAwarenessById[Object.keys(once.organizationPlayerAwarenessById)[0]!]).toBeDefined()
    expect(getPlayersInScoutingTerritory(moved, { kind: 'COMPETITION', competitionId: game.competitionId })).not.toContain(discoveredPlayerId)
  })

  it('admits one Full Report alongside territory workload', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((candidate) => candidate.homeTeamId === team.id || candidate.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const assigned = createScoutingTerritoryAssignment(base, { requestingTeamId: team.id, scoutStaffId: scout.staffPersonId, territory: { kind: 'COMPETITION', competitionId: game.competitionId } })
    const discovered = progressScoutingTerritoryAssignments(assigned)
    const playerId = Object.values(discovered.organizationPlayerAwarenessById)[0]!.playerId
    const queued = requestScouting(discovered, { organizationId: team.organizationId, playerId, missionType: 'FULL_REPORT', evaluatorStaffId: scout.staffPersonId })
    const progressed = progressScoutingAssignments(queued)
    expect(Object.values(progressed.scoutingAssignmentsById).find((item) => item.subjectPlayerId === playerId)!.status).toBe('ACTIVE')
  })

  it('uses Staff quality and active report workload in discovery throughput and rejects unsuitable roles', () => {
    const base = createNewGame()
    const team = getUserTeam(base)!
    const game = Object.values(base.games).find((candidate) => candidate.homeTeamId === team.id || candidate.awayTeamId === team.id)!
    const scout = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
    const territory = { kind: 'COMPETITION' as const, competitionId: game.competitionId }
    const operationWorld = createScoutingTerritoryAssignment(base, { requestingTeamId: team.id, scoutStaffId: scout.staffPersonId, territory })
    const operation = Object.values(operationWorld.scoutingTerritoryAssignmentsById)[0]!
    const current = operationWorld.staffPeopleById[scout.staffPersonId]!
    const strongStaff = { ...current, professional: { ...current.professional, attributes: Object.fromEntries(Object.entries(current.professional.attributes).map(([key, value]) => [key, key === 'talentEvaluation' || key === 'analysis' || key === 'adaptability' ? 100 : value])) as typeof current.professional.attributes } }
    const strong = updateGameWorld(operationWorld, { staffPeople: Object.values(operationWorld.staffPeopleById).map((item) => item.id === scout.staffPersonId ? strongStaff : item) })
    expect(scoutingDiscoveryThroughput(strong, operation.id)).toBeGreaterThanOrEqual(scoutingDiscoveryThroughput(operationWorld, operation.id))
    const overloaded = updateGameWorld(operationWorld, { scoutingAssignments: [...Object.values(operationWorld.scoutingAssignmentsById), { id: 'test:active-full-report', organizationId: team.organizationId, subjectPlayerId: team.rosterPlayerIds[0]!, evaluatorStaffId: scout.staffPersonId, missionType: 'FULL_REPORT', requestedBy: 'HEAD_COACH', priority: 'NORMAL', createdAt: operationWorld.currentDate, status: 'ACTIVE' }] })
    expect(scoutingDiscoveryThroughput(overloaded, operation.id)).toBeLessThanOrEqual(scoutingDiscoveryThroughput(operationWorld, operation.id))
    const unsuitable = Object.values(base.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role !== 'regionalScout')!
    expect(() => createScoutingTerritoryAssignment(base, { requestingTeamId: team.id, scoutStaffId: unsuitable.staffPersonId, territory })).toThrow(/not suitable/)
  })
})
