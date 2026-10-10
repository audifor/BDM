import { describe, expect, it } from 'vitest'

import { createNewGame } from '@/app/game'
import { createGameDate } from '@/domain/date'
import { gameIdFromString, staffPersonIdFromString, teamStaffAssignmentIdFromString } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import { getNextScheduledGame, updateGameWorld, type GameWorld } from '@/domain/world'

import { getAddressableScoutingPlayerIds, getAvailableScoutingEvaluators, requestPlayerScouting } from './ScoutingOperationsService'

describe('Player scouting addressability from public fixtures', () => {
  it('allows a later scheduled opponent instead of limiting evaluation to the very next match', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((entry) => entry.coachId === world.userCoachId)!
    const before = new Set(getAddressableScoutingPlayerIds(world, team.id))
    const futureRival = Object.values(world.teams).find((entry) =>
      entry.id !== team.id && entry.rosterPlayerIds.some((id) => !before.has(id)))
    expect(futureRival).toBeDefined()
    const fixtureTemplate = Object.values(world.games)[0]!
    expect(fixtureTemplate).toBeDefined()
    const laterFixture = {
      ...fixtureTemplate,
      id: gameIdFromString('scouting-public-opponent-later-game'),
      homeTeamId: team.id,
      awayTeamId: futureRival!.id,
      date: createGameDate(2099, 1, 1),
      status: 'scheduled' as const,
    }
    // Pure selector fixture. A future scheduled fixture is a public identity
    // source; no knowledge record or Player Truth is added to the world.
    const scheduled: GameWorld = {
      ...world,
      games: { ...world.games, [laterFixture.id]: laterFixture },
    }
    const available = new Set(getAddressableScoutingPlayerIds(scheduled, team.id))
    for (const playerId of futureRival!.rosterPlayerIds) {
      expect(available.has(playerId)).toBe(true)
    }
    const currentNext = getNextScheduledGame(world, team.id)
    if (currentNext !== undefined) {
      expect(getNextScheduledGame(scheduled, team.id)?.id).toBe(currentNext.id)
    }
    expect(scheduled.organizationKnowledge).toBe(world.organizationKnowledge)
  })

  it('submits a real scouting assignment for a public opponent through the existing command authority', () => {
    const original = createNewGame()
    const userTeam = Object.values(original.teams).find((entry) => entry.coachId === original.userCoachId)!
    const fixture = getNextScheduledGame(original, userTeam.id)
    expect(fixture).toBeDefined()
    const opponentId = fixture!.homeTeamId === userTeam.id ? fixture!.awayTeamId : fixture!.homeTeamId
    const opponentPlayerId = original.teams[opponentId]!.rosterPlayerIds[0]!
    expect(opponentPlayerId).toBeDefined()

    const staffId = staffPersonIdFromString('player-fow-scouting-evaluator')
    const attributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 65]))
      as Record<(typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS)[number], number>
    const role = 'advanceScout' as const
    const world = updateGameWorld(original, {
      staffPeople: [...Object.values(original.staffPeopleById), {
        id: staffId, identity: { firstName: 'Test', lastName: 'Scout' },
        professional: { attributes },
      }],
      teamStaffAssignments: [...Object.values(original.teamStaffAssignmentsById), {
        id: teamStaffAssignmentIdFromString('player-fow-scouting-assignment'),
        staffPersonId: staffId, teamId: userTeam.id, role, assignedOn: original.currentDate,
      }],
      staffEmploymentByStaffId: {
        ...original.staffEmploymentByStaffId,
        [staffId]: { status: 'employed', teamId: userTeam.id, roleId: role, startedOn: original.currentDate },
      },
    })
    expect(getAvailableScoutingEvaluators(world, userTeam.id, 'QUICK_LOOK')).toContain(staffId)
    const next = requestPlayerScouting(world, {
      teamId: userTeam.id,
      playerId: opponentPlayerId,
      missionType: 'QUICK_LOOK',
      evaluatorStaffId: staffId,
    })
    const job = Object.values(next.scoutingAssignmentsById)
      .find((entry) => entry.subjectPlayerId === opponentPlayerId && entry.evaluatorStaffId === staffId)
    expect(job).toBeDefined()
    expect(job?.requestedBy).toBe('HEAD_COACH')
    // A request creates a job, not instant hidden attribute knowledge.
    expect(next.organizationKnowledge).toEqual(world.organizationKnowledge)
  })

  it('does not reveal every roster worldwide without knowledge or fixture context', () => {
    const world = createNewGame()
    const team = Object.values(world.teams).find((entry) => entry.coachId === world.userCoachId)!
    const addressable = new Set(getAddressableScoutingPlayerIds(world, team.id))
    const undiscovered = Object.values(world.teams).flatMap((entry) => entry.rosterPlayerIds)
      .filter((id) => !addressable.has(id))
    expect(undiscovered.length).toBeGreaterThan(0)
  })
})
