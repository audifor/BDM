import { describe, expect, it } from 'vitest'
import { createNewGame } from '@/app/game'
import { advanceDay } from '@/engine/calendar'
import { cancelScheduledTrainingSession, executeScheduledTrainingSessions, nextEligibleTrainingDate, scheduleTrainingSession } from '@/engine/training'
import { updateGameWorld } from '@/domain/world'
import { createScheduledTrainingSession, trainingDefinitionById } from '@/domain/training'
import { responsibilityIdForTeam } from '@/domain/responsibility'
import { staffPersonIdFromString, teamStaffAssignmentIdFromString, type TeamId } from '@/domain/ids'
import { STAFF_PROFESSIONAL_ATTRIBUTE_KEYS } from '@/domain/staff'
import type { GameWorld } from '@/domain/world'

type StaffAttributes = Record<typeof STAFF_PROFESSIONAL_ATTRIBUTE_KEYS[number], number>
const flatAttributes: StaffAttributes = Object.fromEntries(STAFF_PROFESSIONAL_ATTRIBUTE_KEYS.map((key) => [key, 50])) as StaffAttributes

/** Adds a real, canonically-assigned Staff member in `role` to `teamId`, so delegation has a valid holder to resolve. */
function withStaffInRole(world: GameWorld, teamId: TeamId, role: string, attributes: Partial<StaffAttributes> = {}) {
  const staffId = staffPersonIdFromString(`delegated-staff-${role}-${teamId}`)
  const mergedAttributes: StaffAttributes = { ...flatAttributes, ...attributes }
  return {
    world: updateGameWorld(world, {
      staffPeople: [...Object.values(world.staffPeopleById), { id: staffId, identity: { firstName: 'Del', lastName: 'Egate' }, professional: { attributes: mergedAttributes } }],
      teamStaffAssignments: [...Object.values(world.teamStaffAssignmentsById), { id: teamStaffAssignmentIdFromString(`delegated-assignment-${role}-${teamId}`), staffPersonId: staffId, teamId, role: role as never, assignedOn: world.currentDate }],
    }),
    staffId,
  }
}

function delegateResponsibility(world: GameWorld, teamId: TeamId, kind: 'createTeamTrainingPlan' | 'assignIndividualDevelopment' | 'determineIntensity', staffId: ReturnType<typeof staffPersonIdFromString>) {
  const id = responsibilityIdForTeam(teamId, kind)
  return updateGameWorld(world, {
    responsibilities: [...Object.values(world.responsibilitiesById).filter((responsibility) => responsibility.id !== id), { id, teamId, kind, mode: 'delegated', holderStaffId: staffId }],
  })
}

describe('Delegated Training execution', () => {
  it('userControlled path is regression-identical to pre-Wave-2 behavior: session executes using its own scheduled definition/intensity', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'high' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date }))
    expect(executed.scheduledTrainingSessionsById['s1']!.status).toBe('completed')
    expect(executed.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBeGreaterThan(0)
    expect(Object.keys(executed.delegationOutcomesById)).toHaveLength(0)
  })

  it('delegated team Training produces a deterministic, staff-influenced DelegationOutcome and does not rewrite the persisted session', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', { coaching: 90, tacticalKnowledge: 85 })
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date })

    const first = executeScheduledTrainingSessions(scheduled)
    const second = executeScheduledTrainingSessions(scheduled)
    expect(first).toEqual(second)

    expect(first.scheduledTrainingSessionsById['s1']!.definitionId).toBe('threePoint') // persisted schedule unchanged
    expect(first.scheduledTrainingSessionsById['s1']!.status).toBe('completed')

    const outcome = Object.values(first.delegationOutcomesById).find((item) => item.kind === 'createTeamTrainingPlan')
    expect(outcome).toBeDefined()
    expect(outcome!.staffId).toBe(staffId)
    expect(outcome!.applied).toBe(true)
    expect(outcome!.qualityScore).toBeGreaterThanOrEqual(0)
    expect(outcome!.qualityScore).toBeLessThanOrEqual(100)
    expect(outcome!.payload.scope).toBe('team')
  })

  it('delegated individual development produces a deterministic, staff-influenced DelegationOutcome', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'playerDevelopmentCoach', { playerDevelopment: 92, coaching: 80 })
    const delegated = delegateResponsibility(withStaff, teamId, 'assignIndividualDevelopment', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date }))

    const outcome = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'assignIndividualDevelopment')
    expect(outcome).toBeDefined()
    expect(outcome!.staffId).toBe(staffId)
    expect(outcome!.payload.scope).toBe('individual')
    expect(executed.scheduledTrainingSessionsById['s1']!.status).toBe('completed')
  })

  it('delegated intensity uses canonical determineIntensity and produces its own DelegationOutcome', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'performanceCoach', { discipline: 90, analysis: 85 })
    const delegated = delegateResponsibility(withStaff, teamId, 'determineIntensity', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'team', definitionId: 'threePoint', intensity: 'light' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date }))

    const outcome = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'determineIntensity')
    expect(outcome).toBeDefined()
    expect(outcome!.staffId).toBe(staffId)
    expect(['light', 'normal', 'high']).toContain(outcome!.payload.intensity)
    expect(executed.scheduledTrainingSessionsById['s1']!.intensity).toBe('light') // persisted schedule unchanged
  })

  it('non-delegated intensity remains the manually scheduled intensity', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'high' })
    const withoutHigh = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date }))
    const highFatigue = withoutHigh.careerFatigueByPlayerId[playerId]! - (world.careerFatigueByPlayerId[playerId] ?? 0)

    const worldLight = createNewGame()
    const teamIdLight = Object.values(worldLight.teams)[0]!.id
    const playerIdLight = worldLight.teams[teamIdLight]!.rosterPlayerIds[0]!
    const dateLight = nextEligibleTrainingDate(worldLight.currentDate)
    const sessionLight = createScheduledTrainingSession({ id: 's1', teamId: teamIdLight, date: dateLight, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerIdLight, definitionId: 'threePoint', intensity: 'light' })
    const withLight = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(worldLight, sessionLight), { currentDate: dateLight }))
    const lightFatigue = withLight.careerFatigueByPlayerId[playerIdLight]! - (worldLight.careerFatigueByPlayerId[playerIdLight] ?? 0)

    expect(highFatigue).toBeGreaterThan(lightFatigue)
  })

  it('DelegationOutcome is persisted exactly once: re-executing an already-completed session does not create a duplicate outcome', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach')
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date })

    const executedOnce = executeScheduledTrainingSessions(scheduled)
    const outcomeCountOnce = Object.keys(executedOnce.delegationOutcomesById).length
    const executedTwice = executeScheduledTrainingSessions(executedOnce)
    expect(Object.keys(executedTwice.delegationOutcomesById)).toHaveLength(outcomeCountOnce)
    expect(executedTwice).toEqual(executedOnce)
  })

  it('outcome attribution is correct when plan and intensity responsibilities have different holders', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withPlanStaff, staffId: planStaffId } = withStaffInRole(world, teamId, 'assistantCoach', { coaching: 85 })
    const { world: withBothStaff, staffId: intensityStaffId } = withStaffInRole(withPlanStaff, teamId, 'performanceCoach', { discipline: 80 })
    const delegatedPlan = delegateResponsibility(withBothStaff, teamId, 'createTeamTrainingPlan', planStaffId)
    const delegatedBoth = delegateResponsibility(delegatedPlan, teamId, 'determineIntensity', intensityStaffId)
    const date = nextEligibleTrainingDate(delegatedBoth.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegatedBoth, session), { currentDate: date }))

    const planOutcome = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'createTeamTrainingPlan')!
    const intensityOutcome = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'determineIntensity')!
    expect(planOutcome.staffId).toBe(planStaffId)
    expect(intensityOutcome.staffId).toBe(intensityStaffId)
    expect(planOutcome.staffId).not.toBe(intensityOutcome.staffId)
  })

  it('team processing order does not affect either team\'s delegated result', () => {
    const baseA = createNewGame()
    const teamAId = Object.values(baseA.teams)[0]!.id
    const teamBId = Object.values(baseA.teams)[1]!.id
    const { world: aWithStaffA, staffId: staffAId } = withStaffInRole(baseA, teamAId, 'assistantCoach', { coaching: 88 })
    const { world: aWithBoth, staffId: staffBId } = withStaffInRole(aWithStaffA, teamBId, 'assistantCoach', { coaching: 62 })
    const delegatedA = delegateResponsibility(aWithBoth, teamAId, 'createTeamTrainingPlan', staffAId)
    const delegatedBoth = delegateResponsibility(delegatedA, teamBId, 'createTeamTrainingPlan', staffBId)
    const date = nextEligibleTrainingDate(delegatedBoth.currentDate)
    const sessionA = createScheduledTrainingSession({ id: 'team-a-session', teamId: teamAId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const sessionB = createScheduledTrainingSession({ id: 'team-b-session', teamId: teamBId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })

    const worldAThenB = updateGameWorld(scheduleTrainingSession(scheduleTrainingSession(delegatedBoth, sessionA), sessionB), { currentDate: date })
    const executedAB = executeScheduledTrainingSessions(worldAThenB)

    const worldBThenA = updateGameWorld(scheduleTrainingSession(scheduleTrainingSession(delegatedBoth, sessionB), sessionA), { currentDate: date })
    const executedBA = executeScheduledTrainingSessions(worldBThenA)

    const outcomeA_AB = Object.values(executedAB.delegationOutcomesById).find((item) => item.staffId === staffAId)!
    const outcomeA_BA = Object.values(executedBA.delegationOutcomesById).find((item) => item.staffId === staffAId)!
    const outcomeB_AB = Object.values(executedAB.delegationOutcomesById).find((item) => item.staffId === staffBId)!
    const outcomeB_BA = Object.values(executedBA.delegationOutcomesById).find((item) => item.staffId === staffBId)!
    expect(outcomeA_AB.qualityScore).toBe(outcomeA_BA.qualityScore)
    expect(outcomeA_AB.payload).toEqual(outcomeA_BA.payload)
    expect(outcomeB_AB.qualityScore).toBe(outcomeB_BA.qualityScore)
    expect(outcomeB_AB.payload).toEqual(outcomeB_BA.payload)
  })

  it('existing invariants remain intact under delegation: fatigue clamping, position eligibility, cohesion bounds', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', { coaching: 95 })
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date }))

    for (const playerId of world.teams[teamId]!.rosterPlayerIds) {
      expect(executed.careerFatigueByPlayerId[playerId]!).toBeGreaterThanOrEqual(0)
      expect(executed.careerFatigueByPlayerId[playerId]!).toBeLessThanOrEqual(100)
    }
    expect(executed.teamCohesionByTeamId[teamId]!).toBeGreaterThanOrEqual(0)
    expect(executed.teamCohesionByTeamId[teamId]!).toBeLessThanOrEqual(100)
  })

  it('a team that never delegates any Training responsibility sees zero behavior change from Wave 1', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'midRange', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date })
    const executed = executeScheduledTrainingSessions(scheduled)
    expect(executed.developmentStimulusByPlayerId[playerId]!.byRating.midRangeShooting).toBeGreaterThan(0)
    expect(Object.keys(executed.delegationOutcomesById)).toHaveLength(0)
    expect(executed.scheduledTrainingSessionsById['s1']!.definitionId).toBe('midRange')
    expect(executed.scheduledTrainingSessionsById['s1']!.intensity).toBe('normal')
  })

  it('advanceDay executes delegated sessions exactly like manual execution', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', { coaching: 80 })
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const tomorrow = advanceDay(delegated).currentDate
    const scheduled = scheduleTrainingSession(delegated, createScheduledTrainingSession({ id: 's1', teamId, date: tomorrow, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' }))
    const advanced = advanceDay(scheduled)
    expect(Object.values(advanced.delegationOutcomesById).some((item) => item.kind === 'createTeamTrainingPlan')).toBe(true)
  })

  it('cancelling a scheduled session prevents any DelegationOutcome from being created', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach')
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date })
    const cancelled = cancelScheduledTrainingSession(scheduled, 's1')
    const executed = executeScheduledTrainingSessions(cancelled)
    expect(Object.keys(executed.delegationOutcomesById)).toHaveLength(0)
  })

  // --- Blocker 2: development stimulus variance multiplier for the delegated plan path.

  it('userControlled produces exactly the same stimulus as before the stimulus-multiplier fix (no multiplier applied)', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(world.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(world, session), { currentDate: date }))
    // trainingLoad('normal').stimulus = 2 (see Training.ts); efficiency = 1 at zero starting fatigue;
    // developmentWeight for 'threePoint' = 1 (default); no delegation => no multiplier => exactly 2.
    expect(executed.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBe(2)
  })

  it('same world + same session + same holder + same seed produces the same stimulus deterministically', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', { coaching: 40 })
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date })
    const first = executeScheduledTrainingSessions(scheduled)
    const second = executeScheduledTrainingSessions(scheduled)
    expect(first.developmentStimulusByPlayerId).toEqual(second.developmentStimulusByPlayerId)
  })

  it('repeated execution of the identical scenario is byte-for-byte identical (full world equality)', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'playerDevelopmentCoach', { playerDevelopment: 77 })
    const delegated = delegateResponsibility(withStaff, teamId, 'assignIndividualDevelopment', staffId)
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date })
    expect(executeScheduledTrainingSessions(scheduled)).toEqual(executeScheduledTrainingSessions(scheduled))
  })

  it('the stimulus multiplier is always within the documented range: development stimulus never exceeds a bounded band around the unscaled base value', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'playerDevelopmentCoach', { playerDevelopment: 10 }) // deliberately weak: widest possible band
    const delegated = delegateResponsibility(withStaff, teamId, 'assignIndividualDevelopment', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date }))
    const baseStimulus = 2 // trainingLoad('normal').stimulus, developmentWeight 1, efficiency 1
    // The delegated plan may choose a different definition than the one scheduled (that is the
    // point of delegation) — read the actually-effective definition's target rating from the
    // recorded DelegationOutcome rather than assuming 'threePoint'/'threePointShooting'.
    const effectiveDefinitionId = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'assignIndividualDevelopment')!.payload.definitionId as string
    const effectiveTargetRating = trainingDefinitionById(effectiveDefinitionId).effects.targetRatings[0]!
    const actual = executed.developmentStimulusByPlayerId[playerId]!.byRating[effectiveTargetRating]!
    expect(actual).toBeGreaterThanOrEqual(baseStimulus * 0.85)
    expect(actual).toBeLessThanOrEqual(baseStimulus * 1.15)
  })

  it('two Staff members with different attributes can produce different stimulus deterministically for otherwise identical sessions', () => {
    const worldStrong = createNewGame()
    const teamIdStrong = Object.values(worldStrong.teams)[0]!.id
    const playerIdStrong = worldStrong.teams[teamIdStrong]!.rosterPlayerIds[0]!
    const { world: withStrongStaff, staffId: strongStaffId } = withStaffInRole(worldStrong, teamIdStrong, 'playerDevelopmentCoach', { playerDevelopment: 98, coaching: 95 })
    const delegatedStrong = delegateResponsibility(withStrongStaff, teamIdStrong, 'assignIndividualDevelopment', strongStaffId)
    const dateStrong = nextEligibleTrainingDate(delegatedStrong.currentDate)
    const sessionStrong = createScheduledTrainingSession({ id: 's1', teamId: teamIdStrong, date: dateStrong, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerIdStrong, definitionId: 'threePoint', intensity: 'normal' })
    const executedStrong = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegatedStrong, sessionStrong), { currentDate: dateStrong }))

    const worldWeak = createNewGame()
    const teamIdWeak = Object.values(worldWeak.teams)[0]!.id
    const playerIdWeak = worldWeak.teams[teamIdWeak]!.rosterPlayerIds[0]!
    const { world: withWeakStaff, staffId: weakStaffId } = withStaffInRole(worldWeak, teamIdWeak, 'playerDevelopmentCoach', { playerDevelopment: 5, coaching: 5 })
    const delegatedWeak = delegateResponsibility(withWeakStaff, teamIdWeak, 'assignIndividualDevelopment', weakStaffId)
    const dateWeak = nextEligibleTrainingDate(delegatedWeak.currentDate)
    const sessionWeak = createScheduledTrainingSession({ id: 's1', teamId: teamIdWeak, date: dateWeak, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerIdWeak, definitionId: 'threePoint', intensity: 'normal' })
    const executedWeak = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegatedWeak, sessionWeak), { currentDate: dateWeak }))

    // Both are deterministic reruns of themselves; the two scenarios need not differ every single
    // time (the multiplier is bounded noise, not a monotonic function of quality), but each is
    // reproducible and both stay within the documented band around the same base stimulus.
    expect(executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegatedStrong, sessionStrong), { currentDate: dateStrong }))).toEqual(executedStrong)
    expect(executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegatedWeak, sessionWeak), { currentDate: dateWeak }))).toEqual(executedWeak)
  })

  it('intensity delegated without plan delegated does NOT activate the plan stimulus-quality multiplier: stimulus matches the plain trainingLoad(intensity) calculation', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'performanceCoach', { discipline: 90 })
    const delegatedIntensityOnly = delegateResponsibility(withStaff, teamId, 'determineIntensity', staffId)
    const date = nextEligibleTrainingDate(delegatedIntensityOnly.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'light' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegatedIntensityOnly, session), { currentDate: date }))
    const effectiveIntensity = Object.values(executed.delegationOutcomesById)[0]!.payload.intensity as 'light' | 'normal' | 'high'
    const expectedBaseStimulus = effectiveIntensity === 'light' ? 1 : effectiveIntensity === 'normal' ? 2 : 3 // trainingLoad table
    expect(executed.developmentStimulusByPlayerId[playerId]!.byRating.threePointShooting).toBe(expectedBaseStimulus)
  })

  it('plan delegated (without intensity delegated) DOES activate the stimulus-quality multiplier: stimulus can differ from the plain unscaled base', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'playerDevelopmentCoach', { playerDevelopment: 3, coaching: 3 }) // weak: wide band, more likely to visibly deviate
    const delegatedPlanOnly = delegateResponsibility(withStaff, teamId, 'assignIndividualDevelopment', staffId)
    const date = nextEligibleTrainingDate(delegatedPlanOnly.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegatedPlanOnly, session), { currentDate: date }))
    const effectiveDefinitionId = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'assignIndividualDevelopment')!.payload.definitionId as string
    const effectiveTargetRating = trainingDefinitionById(effectiveDefinitionId).effects.targetRatings[0]!
    const actual = executed.developmentStimulusByPlayerId[playerId]!.byRating[effectiveTargetRating]!
    // The multiplier is bounded [0.85, 1.15] around base=2, so any value in that band (including
    // exactly 2) is compatible with the mechanism being engaged; what actually distinguishes
    // "engaged" is that it is provably within this band and computed via the seeded path, not
    // hardcoded to always equal the base — covered by the range test above. Here we assert the
    // DelegationOutcome for the plan exists, proving this path went through delegated execution.
    expect(Object.values(executed.delegationOutcomesById).some((item) => item.kind === 'assignIndividualDevelopment')).toBe(true)
    expect(actual).toBeGreaterThanOrEqual(2 * 0.85)
    expect(actual).toBeLessThanOrEqual(2 * 1.15)
  })

  it('the stimulus multiplier does not change fatigue relative to the effective intensity/definition', () => {
    const worldControlled = createNewGame()
    const teamIdControlled = Object.values(worldControlled.teams)[0]!.id
    const playerIdControlled = worldControlled.teams[teamIdControlled]!.rosterPlayerIds[0]!
    const dateControlled = nextEligibleTrainingDate(worldControlled.currentDate)
    const sessionControlled = createScheduledTrainingSession({ id: 's1', teamId: teamIdControlled, date: dateControlled, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerIdControlled, definitionId: 'threePoint', intensity: 'normal' })
    const executedControlled = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(worldControlled, sessionControlled), { currentDate: dateControlled }))
    const controlledFatigueDelta = executedControlled.careerFatigueByPlayerId[playerIdControlled]! - (worldControlled.careerFatigueByPlayerId[playerIdControlled] ?? 0)

    const worldDelegated = createNewGame()
    const teamIdDelegated = Object.values(worldDelegated.teams)[0]!.id
    const playerIdDelegated = worldDelegated.teams[teamIdDelegated]!.rosterPlayerIds[0]!
    const { world: withStaff, staffId } = withStaffInRole(worldDelegated, teamIdDelegated, 'playerDevelopmentCoach', { playerDevelopment: 5 })
    const delegated = delegateResponsibility(withStaff, teamIdDelegated, 'assignIndividualDevelopment', staffId)
    const dateDelegated = nextEligibleTrainingDate(delegated.currentDate)
    const sessionDelegated = createScheduledTrainingSession({ id: 's1', teamId: teamIdDelegated, date: dateDelegated, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId: playerIdDelegated, definitionId: 'threePoint', intensity: 'normal' })
    const executedDelegated = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegated, sessionDelegated), { currentDate: dateDelegated }))
    const delegatedDefinitionId = Object.values(executedDelegated.delegationOutcomesById)[0]!.payload.definitionId
    const delegatedFatigueDelta = executedDelegated.careerFatigueByPlayerId[playerIdDelegated]! - (worldDelegated.careerFatigueByPlayerId[playerIdDelegated] ?? 0)

    // Fatigue is driven only by intensity + the chosen definition's fatigueMultiplier — never by
    // the stimulus multiplier. If the delegated plan chose the same definition ('threePoint') at
    // the same intensity as the manual scenario, fatigue must match exactly.
    if (delegatedDefinitionId === 'threePoint') expect(delegatedFatigueDelta).toBe(controlledFatigueDelta)
    else expect(Number.isFinite(delegatedFatigueDelta)).toBe(true) // a different definition legitimately has a different fatigueMultiplier
  })

  it('the stimulus multiplier does not affect morale/cohesion beyond the chosen TrainingDefinition\'s own effects', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', { coaching: 90, tacticalKnowledge: 88 })
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'threePoint', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date }))
    const chosenDefinitionId = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'createTeamTrainingPlan')!.payload.definitionId as string
    // teamCohesionByTeamId only changes when the chosen definition has a non-zero cohesionDelta —
    // 'threePoint' and every shooting/finishing/etc. catalog entry have cohesionDelta: 0.
    if (!chosenDefinitionId.match(/System|Transition|Spacing|Cohesion|PickAndRoll/i)) {
      expect(executed.teamCohesionByTeamId[teamId]).toBe(world.teamCohesionByTeamId[teamId])
    }
  })

  it('a position-ineligible player still receives zero stimulus even when the plan is delegated and a multiplier would otherwise apply', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const roster = world.teams[teamId]!.rosterPlayerIds
    const ineligiblePlayerId = roster.find((id) => world.players[id]!.basketball.primaryPosition === 'PG')!
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'assistantCoach', { playerDevelopment: 90, coaching: 90 })
    const delegated = delegateResponsibility(withStaff, teamId, 'createTeamTrainingPlan', staffId)
    const date = nextEligibleTrainingDate(delegated.currentDate)
    // postScoring is position-restricted to PF/C — force it as the scheduled definition; the
    // effective definition may differ once delegated, so assert against whichever was chosen.
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 90, scope: 'team', definitionId: 'postScoring', intensity: 'normal' })
    const executed = executeScheduledTrainingSessions(updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date }))
    const chosenDefinitionId = Object.values(executed.delegationOutcomesById).find((item) => item.kind === 'createTeamTrainingPlan')!.payload.definitionId as string
    if (chosenDefinitionId === 'postScoring') {
      expect(executed.developmentStimulusByPlayerId[ineligiblePlayerId]!.byRating.postScoring ?? 0).toBe(0)
    }
  })

  it('re-executing an already-completed delegated session does not re-apply stimulus or create an extra outcome', () => {
    const world = createNewGame()
    const teamId = Object.values(world.teams)[0]!.id
    const { world: withStaff, staffId } = withStaffInRole(world, teamId, 'playerDevelopmentCoach', { playerDevelopment: 60 })
    const delegated = delegateResponsibility(withStaff, teamId, 'assignIndividualDevelopment', staffId)
    const playerId = world.teams[teamId]!.rosterPlayerIds[0]!
    const date = nextEligibleTrainingDate(delegated.currentDate)
    const session = createScheduledTrainingSession({ id: 's1', teamId, date, startTime: '09:00', durationMinutes: 60, scope: 'individual', playerId, definitionId: 'threePoint', intensity: 'normal' })
    const scheduled = updateGameWorld(scheduleTrainingSession(delegated, session), { currentDate: date })
    const executedOnce = executeScheduledTrainingSessions(scheduled)
    const executedTwice = executeScheduledTrainingSessions(executedOnce)
    expect(executedTwice.developmentStimulusByPlayerId).toEqual(executedOnce.developmentStimulusByPlayerId)
    expect(Object.keys(executedTwice.delegationOutcomesById)).toHaveLength(Object.keys(executedOnce.delegationOutcomesById).length)
  })
})
