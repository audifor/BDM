import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { addDays, parseGameDate } from '@/domain/date'
import { deriveOrganizationPlayerValuation } from '@/domain/intelligence'
import { updateGameWorld } from '@/domain/world'
import { progressAiScoutingOperations } from './AiScoutingOperations'
import { progressScoutingAssignments, requestScouting } from './ScoutingEngine'
import { progressScoutingTerritoryAssignments } from './ScoutingTerritoryOperations'

function aiTeam(world: ReturnType<typeof createNewGame>) {
  return Object.values(world.teams).filter((team) => team.coachId !== undefined && team.coachId !== world.userCoachId).sort((a, b) => a.id.localeCompare(b.id)).find((team) =>
    Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.teamId === team.id && ['regionalScout', 'internationalScout', 'collegeScout', 'proScout', 'headScout'].includes(assignment.role) && world.staffEmploymentByStaffId[assignment.staffPersonId]?.status === 'employed'),
  )!
}

describe('AI Scouting operations', () => {
  it('creates a bounded, deterministic territory footprint for AI and leaves the human team alone', () => {
    const base = createNewGame()
    const ai = aiTeam(base)
    const planningWorld = updateGameWorld(base, { currentDate: parseGameDate(`${base.currentDate.slice(0, 8)}01`) })
    const first = progressAiScoutingOperations(planningWorld)
    const second = progressAiScoutingOperations(planningWorld)
    const ownCompetition = Object.values(base.competitions).find((competition) => competition.participantTeamIds.includes(ai.id))
    const operations = Object.values(first.scoutingTerritoryAssignmentsById).filter((assignment) => assignment.organizationId === ai.organizationId && assignment.status === 'ACTIVE')
    expect(operations.length).toBeGreaterThan(0)
    expect(operations.length).toBeLessThanOrEqual(3)
    expect(operations.map((item) => [item.scoutStaffId, item.territory])).toEqual(Object.values(second.scoutingTerritoryAssignmentsById).filter((item) => item.organizationId === ai.organizationId && item.status === 'ACTIVE').map((item) => [item.scoutStaffId, item.territory]))
    expect(operations.some((item) => item.territory.kind === 'COMPETITION' && item.territory.competitionId === ownCompetition?.id)).toBe(true)
    const human = Object.values(base.teams).find((team) => team.coachId === base.userCoachId)!
    expect(Object.values(first.scoutingTerritoryAssignmentsById).some((item) => item.requestingTeamId === human.id)).toBe(false)
    expect(Object.values(first.scoutingAssignmentsById).some((item) => item.organizationId === human.organizationId)).toBe(false)
  })

  it('discovers players and develops a small, non-universal body of knowledge over 30 in-game days', () => {
    const base = createNewGame()
    const ai = aiTeam(base)
    const initial = updateGameWorld(base, {
      currentDate: parseGameDate(`${base.currentDate.slice(0, 8)}01`),
      teams: Object.values(base.teams).map((team) => team.id === ai.id ? { ...team, rosterPlayerIds: team.rosterPlayerIds.filter((id) => base.players[id]?.basketball.primaryPosition !== 'PG') } : team),
    })
    let world = initial
    for (let day = 0; day < 30; day += 1) {
      world = progressAiScoutingOperations(world)
      world = progressScoutingTerritoryAssignments(world)
      world = progressScoutingAssignments(world)
      if (day < 29) world = updateGameWorld(world, { currentDate: addDays(world.currentDate, 1) })
    }
    const awareness = Object.values(world.organizationPlayerAwarenessById).filter((item) => item.organizationId === ai.organizationId)
    const reports = Object.values(world.evaluatorReportsById).filter((item) => item.organizationId === ai.organizationId)
    const knowledge = world.organizationKnowledge.filter((item) => item.organizationId === ai.organizationId)
    const assignments = Object.values(world.scoutingAssignmentsById).filter((item) => item.organizationId === ai.organizationId)
    const territoryOperations = Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.organizationId === ai.organizationId)
    const activeTerritories = Object.values(world.scoutingTerritoryAssignmentsById).filter((item) => item.organizationId === ai.organizationId && item.status === 'ACTIVE')
    expect(territoryOperations.length).toBeGreaterThan(0)
    expect(activeTerritories.length).toBeLessThanOrEqual(3)
    expect(awareness.length).toBeGreaterThan(0)
    expect(reports.length).toBeGreaterThan(0)
    expect(assignments.length).toBeLessThanOrEqual(10)
    expect(assignments.filter((item) => item.status === 'COMPLETED')).toHaveLength(reports.length)
    expect(knowledge.length).toBeGreaterThan(0)
    expect(knowledge.length).toBeLessThan(Object.keys(world.players).length)
    console.info('BS14F 30-day smoke', { territoryOperations: territoryOperations.length, activeTerritories: activeTerritories.length, awareness: awareness.length, reportsCompleted: reports.length, scoutingAssignments: assignments.length, organizationKnowledge: knowledge.length })
  }, 30000)

  it('does no strategic work between weekly planning dates', () => {
    const base = createNewGame()
    const offCycle = updateGameWorld(base, { currentDate: parseGameDate(`${base.currentDate.slice(0, 8)}03`) })
    expect(progressAiScoutingOperations(offCycle)).toBe(offCycle)
  })

  it('feeds completed scouting knowledge into the existing acquisition valuation', () => {
    const base = createNewGame()
    const ai = aiTeam(base)
    const evaluator = Object.values(base.teamStaffAssignmentsById).find((assignment) => assignment.teamId === ai.id && ['regionalScout', 'internationalScout', 'collegeScout', 'proScout', 'headScout'].includes(assignment.role))!
    const player = Object.values(base.players).find((candidate) => !ai.rosterPlayerIds.includes(candidate.id))!
    const before = deriveOrganizationPlayerValuation({ organizationId: ai.organizationId, playerId: player.id, knowledge: base.organizationKnowledge, currentDate: base.currentDate, context: 'FREE_AGENCY', publicPosition: player.basketball.primaryPosition })
    let completed = requestScouting(base, { organizationId: ai.organizationId, playerId: player.id, missionType: 'FULL_REPORT', evaluatorStaffId: evaluator.staffPersonId })
    for (let day = 0; day < 8; day += 1) completed = progressScoutingAssignments(updateGameWorld(completed, { currentDate: addDays(completed.currentDate, 1) }))
    const after = deriveOrganizationPlayerValuation({ organizationId: ai.organizationId, playerId: player.id, knowledge: completed.organizationKnowledge, currentDate: completed.currentDate, context: 'FREE_AGENCY', publicPosition: player.basketball.primaryPosition })
    expect(completed.organizationKnowledge.some((item) => item.organizationId === ai.organizationId && item.subjectPlayerId === player.id)).toBe(true)
    expect(after.priorityScore).not.toBe(before.priorityScore)
  })
})
