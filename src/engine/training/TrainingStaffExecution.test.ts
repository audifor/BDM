import { describe, expect, it } from 'vitest'
import { createAcbTestGame } from '@/app/game'
import { fireStaffFromTeam } from '@/app/staffCareer/StaffCareerService'
import { createScheduledTrainingSession } from '@/domain/training'
import type { PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import { deserializeGameWorldV1, serializeGameWorldV1 } from '@/save/GameWorldSaveV1'
import {
  executeScheduledTrainingSessions,
  nextEligibleTrainingDate,
  scheduleTrainingSession,
  trainingStaffExecutionMultiplier,
} from './ScheduledTrainingEngine'

function firstTeam(world: GameWorld) {
  return Object.values(world.teams)[0]!
}

function staffForRole(world: GameWorld, teamId: TeamId, role: string): StaffPersonId {
  const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.teamId === teamId && item.role === role)
  if (assignment === undefined) throw new Error(`Missing ${role} for ${teamId}`)
  return assignment.staffPersonId
}

function executeIndividual(world: GameWorld, input: { readonly teamId: TeamId; readonly playerId: PlayerId; readonly staffId: StaffPersonId; readonly definitionId: string; readonly sessionId: string }): GameWorld {
  const date = nextEligibleTrainingDate(world.currentDate)
  const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({
    id: input.sessionId,
    teamId: input.teamId,
    date,
    startTime: '09:00',
    durationMinutes: 60,
    scope: 'individual',
    playerId: input.playerId,
    definitionId: input.definitionId,
    intensity: 'normal',
    assignedStaffPersonIds: [input.staffId],
  }))
  return executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: date }))
}

function executeTeam(world: GameWorld, input: { readonly teamId: TeamId; readonly staffId: StaffPersonId; readonly definitionId: string; readonly sessionId: string }): GameWorld {
  const date = nextEligibleTrainingDate(world.currentDate)
  const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({
    id: input.sessionId,
    teamId: input.teamId,
    date,
    startTime: '09:00',
    durationMinutes: 90,
    scope: 'team',
    definitionId: input.definitionId,
    intensity: 'normal',
    assignedStaffPersonIds: [input.staffId],
  }))
  return executeScheduledTrainingSessions(updateGameWorld(scheduled, { currentDate: date }))
}

describe('Training Staff V2 execution assignments', () => {
  it('enforces active-team employment and real Staff scheduling conflicts at the engine boundary', () => {
    const world = createAcbTestGame()
    const team = firstTeam(world)
    const [playerA, playerB] = team.rosterPlayerIds
    expect(playerA).toBeDefined()
    expect(playerB).toBeDefined()
    const shooter = staffForRole(world, team.id, 'shootingCoach')
    const date = nextEligibleTrainingDate(world.currentDate)

    const first = scheduleTrainingSession(world, createScheduledTrainingSession({
      id: 'staff-conflict-a', teamId: team.id, date, startTime: '09:00', durationMinutes: 60,
      scope: 'individual', playerId: playerA!, definitionId: 'threePoint', intensity: 'normal', assignedStaffPersonIds: [shooter],
    }))
    // Different players may train concurrently, so this is legal at the player/team resource layer;
    // the rejection below therefore proves the shared Staff resource is the conflict.
    expect(() => scheduleTrainingSession(first, createScheduledTrainingSession({
      id: 'staff-conflict-b', teamId: team.id, date, startTime: '09:30', durationMinutes: 60,
      scope: 'individual', playerId: playerB!, definitionId: 'midRange', intensity: 'normal', assignedStaffPersonIds: [shooter],
    }))).toThrow(/already assigned to overlapping session/)

    const freeAgentEntry = Object.entries(world.staffEmploymentByStaffId).find(([, employment]) => employment.status === 'unemployed')
    expect(freeAgentEntry).toBeDefined()
    const freeAgent = freeAgentEntry![0] as StaffPersonId
    expect(() => scheduleTrainingSession(world, createScheduledTrainingSession({
      id: 'free-agent-staff', teamId: team.id, date, startTime: '12:00', durationMinutes: 60,
      scope: 'individual', playerId: playerA!, definitionId: 'threePoint', intensity: 'normal', assignedStaffPersonIds: [freeAgent],
    }))).toThrow(/not actively employed by this team/)

    const otherAssignment = Object.values(world.teamStaffAssignmentsById).find((assignment) => assignment.teamId !== team.id)!
    expect(() => scheduleTrainingSession(world, createScheduledTrainingSession({
      id: 'other-team-staff', teamId: team.id, date, startTime: '13:00', durationMinutes: 60,
      scope: 'individual', playerId: playerA!, definitionId: 'threePoint', intensity: 'normal', assignedStaffPersonIds: [otherAssignment.staffPersonId],
    }))).toThrow(/not actively employed by this team/)

    expect(() => scheduleTrainingSession(world, createScheduledTrainingSession({
      id: 'unknown-staff', teamId: team.id, date, startTime: '14:00', durationMinutes: 60,
      scope: 'individual', playerId: playerA!, definitionId: 'threePoint', intensity: 'normal', assignedStaffPersonIds: ['missing-training-staff' as StaffPersonId],
    }))).toThrow(/Unknown scheduled session staff/)
  })

  it('uses role speciality and bounded diminishing returns instead of raw headcount stacking', () => {
    const world = createAcbTestGame()
    const team = firstTeam(world)
    const shooter = staffForRole(world, team.id, 'shootingCoach')
    const skills = staffForRole(world, team.id, 'skillsCoach')
    const developer = staffForRole(world, team.id, 'playerDevelopmentCoach')
    const scout = staffForRole(world, team.id, 'regionalScout')
    const offensive = staffForRole(world, team.id, 'offensiveSpecialist')
    const defensive = staffForRole(world, team.id, 'defensiveSpecialist')
    const date = nextEligibleTrainingDate(world.currentDate)
    const shooting = createScheduledTrainingSession({ id: 'fit-shooting', teamId: team.id, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'normal', assignedStaffPersonIds: [shooter] })

    const shooterMultiplier = trainingStaffExecutionMultiplier(world, shooting)
    const scoutMultiplier = trainingStaffExecutionMultiplier(world, { ...shooting, assignedStaffPersonIds: [scout] })
    const twoStaff = trainingStaffExecutionMultiplier(world, { ...shooting, assignedStaffPersonIds: [shooter, skills] })
    const threeStaff = trainingStaffExecutionMultiplier(world, { ...shooting, assignedStaffPersonIds: [shooter, skills, developer] })
    expect(shooterMultiplier).toBeGreaterThan(scoutMultiplier)
    expect(twoStaff).toBeGreaterThanOrEqual(shooterMultiplier)
    expect(threeStaff).toBeGreaterThanOrEqual(twoStaff)
    expect(threeStaff).toBeLessThanOrEqual(1.18)
    expect(threeStaff - twoStaff).toBeLessThanOrEqual(twoStaff - shooterMultiplier + 1e-9)

    const offenseSession = { ...shooting, id: 'fit-offense', definitionId: 'offensiveSystem' }
    const defenseSession = { ...shooting, id: 'fit-defense', definitionId: 'defensiveSystem' }
    expect(trainingStaffExecutionMultiplier(world, { ...offenseSession, assignedStaffPersonIds: [offensive] })).toBeGreaterThan(trainingStaffExecutionMultiplier(world, { ...offenseSession, assignedStaffPersonIds: [defensive] }))
    expect(trainingStaffExecutionMultiplier(world, { ...defenseSession, assignedStaffPersonIds: [defensive] })).toBeGreaterThan(trainingStaffExecutionMultiplier(world, { ...defenseSession, assignedStaffPersonIds: [offensive] }))
  })

  it('makes specialist quality affect development but not ordinary positive fatigue', () => {
    const world = createAcbTestGame()
    const team = firstTeam(world)
    const playerId = team.rosterPlayerIds[0]!
    const shooter = staffForRole(world, team.id, 'shootingCoach')
    const scout = staffForRole(world, team.id, 'regionalScout')

    const withShooter = executeIndividual(world, { teamId: team.id, playerId, staffId: shooter, definitionId: 'threePoint', sessionId: 'exec-shooter' })
    const withScout = executeIndividual(world, { teamId: team.id, playerId, staffId: scout, definitionId: 'threePoint', sessionId: 'exec-scout' })
    expect(withShooter.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting!).toBeGreaterThan(withScout.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting!)
    expect(withShooter.careerFatigueByPlayerId[playerId]).toBe(withScout.careerFatigueByPlayerId[playerId])
    expect(withShooter.scheduledTrainingSessionsById['exec-shooter']!.status).toBe('completed')
    expect(withShooter.scheduledTrainingSessionsById['exec-shooter']!.assignedStaffPersonIds).toBeUndefined()
  })

  it('makes qualified recovery staff increase the magnitude of fatigue recovery', () => {
    const initial = createAcbTestGame()
    const team = firstTeam(initial)
    const playerId = team.rosterPlayerIds[0]!
    const physio = staffForRole(initial, team.id, 'physiotherapist')
    const scout = staffForRole(initial, team.id, 'regionalScout')
    const world = updateGameWorld(initial, { careerFatigueByPlayerId: { ...initial.careerFatigueByPlayerId, [playerId]: 50 } })

    const withPhysio = executeIndividual(world, { teamId: team.id, playerId, staffId: physio, definitionId: 'rest', sessionId: 'recovery-physio' })
    const withScout = executeIndividual(world, { teamId: team.id, playerId, staffId: scout, definitionId: 'rest', sessionId: 'recovery-scout' })
    expect(withPhysio.careerFatigueByPlayerId[playerId]!).toBeLessThan(withScout.careerFatigueByPlayerId[playerId]!)
    expect(withPhysio.careerFatigueByPlayerId[playerId]!).toBeLessThan(50)
  })

  it('makes tactical execution quality improve the real cohesion effect', () => {
    const world = createAcbTestGame()
    const team = firstTeam(world)
    const offensive = staffForRole(world, team.id, 'offensiveSpecialist')
    const scout = staffForRole(world, team.id, 'regionalScout')
    const withSpecialist = executeTeam(world, { teamId: team.id, staffId: offensive, definitionId: 'offensiveSystem', sessionId: 'tactical-specialist' })
    const withScout = executeTeam(world, { teamId: team.id, staffId: scout, definitionId: 'offensiveSystem', sessionId: 'tactical-scout' })
    expect(withSpecialist.teamCohesionByTeamId[team.id]!).toBeGreaterThan(withScout.teamCohesionByTeamId[team.id]!)
  })

  it('detaches pending work on firing and keeps firing safe after completed execution', () => {
    const world = createAcbTestGame()
    const team = firstTeam(world)
    const playerId = team.rosterPlayerIds[0]!
    const shooter = staffForRole(world, team.id, 'shootingCoach')
    const date = nextEligibleTrainingDate(world.currentDate)
    const pending = scheduleTrainingSession(world, createScheduledTrainingSession({
      id: 'pending-before-fire', teamId: team.id, date, startTime: '09:00', durationMinutes: 60,
      scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal', assignedStaffPersonIds: [shooter],
    }))
    const fired = fireStaffFromTeam(pending, shooter)
    expect(fired.staffEmploymentByStaffId[shooter]!.status).toBe('unemployed')
    expect(fired.scheduledTrainingSessionsById['pending-before-fire']!.assignedStaffPersonIds).toBeUndefined()

    const world2 = createAcbTestGame()
    const team2 = firstTeam(world2)
    const playerId2 = team2.rosterPlayerIds[0]!
    const shooter2 = staffForRole(world2, team2.id, 'shootingCoach')
    const executed = executeIndividual(world2, { teamId: team2.id, playerId: playerId2, staffId: shooter2, definitionId: 'threePoint', sessionId: 'completed-before-fire' })
    expect(executed.scheduledTrainingSessionsById['completed-before-fire']!.assignedStaffPersonIds).toBeUndefined()
    expect(() => fireStaffFromTeam(executed, shooter2)).not.toThrow()
  })

  it('round-trips pending execution assignments through the existing V1 save compatibility path', () => {
    const world = createAcbTestGame()
    const team = firstTeam(world)
    const playerId = team.rosterPlayerIds[0]!
    const shooter = staffForRole(world, team.id, 'shootingCoach')
    const date = nextEligibleTrainingDate(world.currentDate)
    const scheduled = scheduleTrainingSession(world, createScheduledTrainingSession({
      id: 'save-staff-session', teamId: team.id, date, startTime: '09:00', durationMinutes: 60,
      scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal', assignedStaffPersonIds: [shooter],
    }))
    const loaded = deserializeGameWorldV1(serializeGameWorldV1(scheduled, '2026-09-01T12:00:00.000Z'))
    expect(loaded.scheduledTrainingSessionsById['save-staff-session']!.assignedStaffPersonIds).toEqual([shooter])
  })
})
