import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game/createNewGame'
import { addDays } from '@/domain/date'
import { getPlayersInScoutingTerritory, updateGameWorld } from '@/domain/world'
import { getUserTeam } from '@/engine/calendar'
import { deserializeGameWorldV4, serializeGameWorldV4 } from '@/save/GameWorldSaveV4'
import { createScoutingTerritoryAssignment, endScoutingTerritoryAssignment } from '@/app/scouting'
import { cancelScoutingAssignment, progressScoutingAssignments, requestScouting, updateScoutingAssignmentPriority } from './ScoutingEngine'
import { progressScoutingTerritoryAssignments } from './ScoutingTerritoryOperations'

const SAVED_AT = '2032-10-01T00:00:00.000Z'

function userScoutingFixture() {
  const world = createNewGame()
  const team = getUserTeam(world)!
  const player = Object.values(world.players).find((candidate) => !team.rosterPlayerIds.includes(candidate.id))!
  const evaluator = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === team.id && item.role === 'regionalScout')!
  return { world, team, player, evaluator }
}

function advanceAssignments(world: ReturnType<typeof createNewGame>, days: number) {
  let current = world
  for (let day = 0; day < days; day += 1) {
    current = progressScoutingAssignments(updateGameWorld(current, { currentDate: addDays(current.currentDate, 1) }))
  }
  return current
}

describe('BS14H Scouting lifecycle certification', () => {
  it('resumes a saved active assignment and creates exactly one completion record set', () => {
    const { world, team, player, evaluator } = userScoutingFixture()
    const queued = requestScouting(world, { organizationId: team.organizationId, teamContextId: team.id, playerId: player.id, evaluatorStaffId: evaluator.staffPersonId, missionType: 'QUICK_LOOK' })
    const prioritized = updateScoutingAssignmentPriority(queued, Object.keys(queued.scoutingAssignmentsById)[0]!, 'URGENT')
    const active = progressScoutingAssignments(prioritized)
    expect(Object.values(active.scoutingAssignmentsById)[0]!.status).toBe('ACTIVE')

    const restored = deserializeGameWorldV4(serializeGameWorldV4(active, SAVED_AT))
    expect(restored.scoutingAssignmentsById).toEqual(active.scoutingAssignmentsById)
    const completed = advanceAssignments(restored, 8)
    expect(Object.values(completed.scoutingAssignmentsById)[0]!.status).toBe('COMPLETED')
    expect(Object.values(completed.evaluatorReportsById)).toHaveLength(1)
    expect(Object.values(completed.evidenceById)).toHaveLength(1)
    expect(completed.organizationKnowledge.filter((item) => item.organizationId === team.organizationId && item.subjectPlayerId === player.id)).toHaveLength(1)

    const sameDateReplay = progressScoutingAssignments(completed)
    expect(sameDateReplay.evaluatorReportsById).toEqual(completed.evaluatorReportsById)
    expect(sameDateReplay.evidenceById).toEqual(completed.evidenceById)
    expect(sameDateReplay.organizationKnowledge).toEqual(completed.organizationKnowledge)
  })

  it('keeps cancellation terminal across save/load and later Calendar progression', () => {
    const { world, team, player, evaluator } = userScoutingFixture()
    const active = progressScoutingAssignments(requestScouting(world, { organizationId: team.organizationId, teamContextId: team.id, playerId: player.id, evaluatorStaffId: evaluator.staffPersonId, missionType: 'FULL_REPORT' }))
    const assignment = Object.values(active.scoutingAssignmentsById)[0]!
    const cancelled = deserializeGameWorldV4(serializeGameWorldV4(cancelScoutingAssignment(active, assignment.id), SAVED_AT))
    const advanced = advanceAssignments(cancelled, 8)
    expect(advanced.scoutingAssignmentsById[assignment.id]?.status).toBe('CANCELLED')
    expect(advanced.evaluatorReportsById).toEqual({})
    expect(advanced.evidenceById).toEqual({})
  })

  it('resumes active territory discovery after reload and stops it after ending coverage', () => {
    const { world, team, evaluator } = userScoutingFixture()
    const territory = { kind: 'COMPETITION' as const, competitionId: Object.values(world.competitions).find((competition) => competition.participantTeamIds.includes(team.id))!.id }
    const active = createScoutingTerritoryAssignment(world, { requestingTeamId: team.id, scoutStaffId: evaluator.staffPersonId, territory })
    const discovered = progressScoutingTerritoryAssignments(active)
    const restored = deserializeGameWorldV4(serializeGameWorldV4(discovered, SAVED_AT))
    expect(restored.scoutingTerritoryAssignmentsById).toEqual(discovered.scoutingTerritoryAssignmentsById)
    expect(restored.organizationPlayerAwarenessById).toEqual(discovered.organizationPlayerAwarenessById)
    let resumed = restored
    for (let day = 0; day < 5; day += 1) {
      resumed = progressScoutingTerritoryAssignments(updateGameWorld(resumed, { currentDate: addDays(resumed.currentDate, 1) }))
    }
    expect(Object.keys(resumed.organizationPlayerAwarenessById).length).toBeGreaterThan(Object.keys(discovered.organizationPlayerAwarenessById).length)

    const operation = Object.values(resumed.scoutingTerritoryAssignmentsById)[0]!
    const ended = deserializeGameWorldV4(serializeGameWorldV4(endScoutingTerritoryAssignment(resumed, operation.id), SAVED_AT))
    const awarenessAtEnd = ended.organizationPlayerAwarenessById
    let afterEnd = ended
    for (let day = 0; day < 5; day += 1) {
      afterEnd = progressScoutingTerritoryAssignments(updateGameWorld(afterEnd, { currentDate: addDays(afterEnd.currentDate, 1) }))
    }
    expect(afterEnd.organizationPlayerAwarenessById).toEqual(awarenessAtEnd)
    expect(getPlayersInScoutingTerritory(afterEnd, territory).length).toBeGreaterThan(0)
    expect(afterEnd.scoutingTerritoryAssignmentsById[operation.id]?.status).toBe('ENDED')
  })
})
