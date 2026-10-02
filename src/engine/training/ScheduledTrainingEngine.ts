import { addDevelopmentStimulus } from '@/domain/development/DevelopmentStimulus'
import { createDevelopmentStimulusEvent } from '@/domain/development/DevelopmentStimulusEvent'
import { clampCareerFatigue } from '@/domain/careerFatigue/CareerFatigue'
import { clampTeamCohesion, dailyWorkloadScore, findCollidingSession, isPositionEligible, timeToMinutes, trainingDefinitionById, trainingLoad, type ScheduledTrainingSession, type TrainingDefinition, type TrainingIntensity } from '@/domain/training'
import { calculateStaffRoleProficiencyByRoleId, isTrainingStaffRoleEligible, trainingStaffRoleFit } from '@/domain/staff'
import { applyMoraleEvent, type MoraleEvent } from '@/domain/morale'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome } from '@/domain/responsibility'
import { addDays, type GameDate } from '@/domain/date'
import { isPlayerAvailable, updateGameWorld, type GameWorld } from '@/domain/world'
import type { CanonicalRatingKey } from '@/domain/player'
import type { PlayerId, StaffPersonId, TeamId } from '@/domain/ids'
import { resolveDelegatedResponsibility, trainingQuality } from '@/engine/staff'
import { delegatedStimulusMultiplier, effectiveIndividualDefinition, effectiveIntensity, effectiveTeamDefinition } from './DelegatedTraining'
import { canTeamTrainOnDate } from './TrainingEngine'
import { trainingParticipationForPlayer } from './TrainingParticipation'
import { trainingInjuryProbability } from '@/engine/injury/TrainingInjuries'
import { createDeterministicInjury, deterministicInjuryKind } from '@/engine/injury/InjuryCreation'
import { boundedInjuryProbability, recurrenceRiskMultiplier } from '@/engine/injury/InjuryRisk'
import { hashStringToSeed, SeededRandomSource } from '@/engine/random'
import type { InjuryRecord } from '@/domain/injury'

/**
 * The earliest date a newly-scheduled session is guaranteed to actually execute.
 *
 * advanceDay() increments world.currentDate *before* running executeScheduledTrainingSessions,
 * so a session scheduled for world.currentDate after the current day has already started being
 * processed will never be picked up by a normal advanceDay() call. Scheduling for the next date
 * guarantees the very next advanceDay() executes it exactly once.
 */
export function nextEligibleTrainingDate(currentDate: GameDate): GameDate {
  return addDays(currentDate, 1)
}

/**
 * Schedules a new session (or replaces an existing one under the same id) after validating it
 * does not collide with any existing scheduled session and cannot become permanently dead.
 *
 * advanceDay() executes scheduled sessions only after incrementing currentDate, so a session
 * whose date is today or in the past can never be picked up by a normal advanceDay() call —
 * it would sit "scheduled" forever. Reject those at this canonical scheduling boundary rather
 * than relying only on UI validation.
 */
export function scheduleTrainingSession(world: GameWorld, session: ScheduledTrainingSession): GameWorld {
  if (session.date <= world.currentDate) {
    throw new RangeError(`Scheduled session date ${session.date} must be after the current date ${world.currentDate}; it would never execute`)
  }
  if (!canTeamTrainOnDate(world, session.teamId, session.date)) throw new RangeError(`Training cannot be scheduled on fixture date ${session.date}`)
  const existing = Object.values(world.scheduledTrainingSessionsById)
  const collision = findCollidingSession(session, existing)
  if (collision !== undefined) throw new RangeError(`Session collides with existing session ${collision.id}`)
  validateAssignedStaff(world, session, existing)
  return updateGameWorld(world, { scheduledTrainingSessionsById: { ...world.scheduledTrainingSessionsById, [session.id]: session } })
}

/** Replaces the executing staff on an existing future session through the same canonical validation boundary. */
export function assignStaffToScheduledTrainingSession(world: GameWorld, input: { readonly sessionId: string; readonly assignedStaffPersonIds: readonly StaffPersonId[] }): GameWorld {
  const session = world.scheduledTrainingSessionsById[input.sessionId]
  if (session === undefined) throw new RangeError(`Unknown scheduled training session ${input.sessionId}`)
  return scheduleTrainingSession(world, { ...session, assignedStaffPersonIds: input.assignedStaffPersonIds })
}

/** Called by canonical StaffCareer firing: pending work is detached, never left assigned to an unemployed person. */
export function detachStaffFromFutureTrainingSessions(world: GameWorld, staffId: StaffPersonId): GameWorld {
  let changed = false
  const sessions = Object.fromEntries(Object.entries(world.scheduledTrainingSessionsById).map(([id, session]) => {
    if (session.status !== 'scheduled' || session.date < world.currentDate || !session.assignedStaffPersonIds?.includes(staffId)) return [id, session]
    changed = true
    const assignedStaffPersonIds = session.assignedStaffPersonIds.filter((id) => id !== staffId)
    return [id, { ...session, assignedStaffPersonIds: assignedStaffPersonIds.length === 0 ? undefined : assignedStaffPersonIds }]
  })) as GameWorld['scheduledTrainingSessionsById']
  return changed ? updateGameWorld(world, { scheduledTrainingSessionsById: sessions }) : world
}

export function cancelScheduledTrainingSession(world: GameWorld, sessionId: string): GameWorld {
  const sessions = { ...world.scheduledTrainingSessionsById }
  delete sessions[sessionId]
  return updateGameWorld(world, { scheduledTrainingSessionsById: sessions })
}

/** Records a user's explicit player-level participation choice on one existing team session. */
export function setTrainingParticipation(world: GameWorld, input: { readonly sessionId: string; readonly playerId: PlayerId; readonly participation?: import('@/domain/training').TrainingParticipation }): GameWorld {
  const session = world.scheduledTrainingSessionsById[input.sessionId]
  if (session === undefined || session.scope !== 'team' || session.status !== 'scheduled') throw new RangeError('Participation requires a pending team session')
  if (!world.teams[session.teamId]!.rosterPlayerIds.includes(input.playerId)) throw new RangeError('Player is not on the session team roster')
  const participationByPlayerId = { ...(session.participationByPlayerId ?? {}) }
  if (input.participation === undefined) delete participationByPlayerId[input.playerId]
  else participationByPlayerId[input.playerId] = input.participation
  return updateGameWorld(world, { scheduledTrainingSessionsById: { ...world.scheduledTrainingSessionsById, [session.id]: { ...session, participationByPlayerId } } })
}

/** Executes every scheduled session whose date is world.currentDate and that has not already been completed. Idempotent: completed sessions are skipped. */
export function executeScheduledTrainingSessions(world: GameWorld): GameWorld {
  return executeScheduledTrainingSessionsWithEvidence(world).world
}

/** Due sessions that conflict with a fixture are preserved for inspection and never executed. */
export function executeScheduledTrainingSessionsWithEvidence(world: GameWorld): { readonly world: GameWorld; readonly matchConflictSessionIds: readonly string[] } {
  const due = Object.values(world.scheduledTrainingSessionsById).filter((session) => session.date === world.currentDate && session.status === 'scheduled')
  const blocked = due.filter((session) => !canTeamTrainOnDate(world, session.teamId, session.date))
  const executable = due.filter((session) => canTeamTrainOnDate(world, session.teamId, session.date))
  return {
    world: executable.reduce((next, session) => executeScheduledSession(next, session), world),
    matchConflictSessionIds: blocked.map((session) => session.id).sort(),
  }
}

/**
 * Position eligibility semantics for team sessions on a position-restricted definition:
 * every participating roster player receives the session's physical fatigue/load (they still
 * attend and exert themselves), but only players eligible for the definition's restricted
 * positions receive its targeted development stimulus. This models a coach running a
 * position-specific drill within a team session: everyone trains, only the relevant
 * specialists actually improve the targeted skill.
 *
 * Delegation (Wave 2, docs/STAFF_SYSTEM_V2.md §14.2) remains the decision layer: if the relevant
 * plan responsibility and/or determineIntensity are delegated, the holder determines the
 * effective definition/intensity and may contribute its bounded planning-quality multiplier.
 * assignedStaffPersonIds is a separate execution layer: those people run the concrete session
 * and contribute a bounded execution-quality multiplier based on role fit + canonical Staff
 * proficiency. A person may legitimately plan and execute the same session; those are distinct
 * responsibilities and remain independently bounded.
 *
 * No executing staff preserves the exact legacy execution multiplier of 1.0. Executing staff can
 * affect development stimulus, recovery magnitude for recovery modules, and cohesion for tactical
 * modules. It never changes ordinary positive fatigue, morale, or metadata-only injuryRiskWeight.
 * The scheduled definition/intensity remain immutable during execution. The active execution
 * assignment is consumed when the session completes so later dismissal does not rewrite history
 * or leave completed work coupled to current employment validation.
 */
function executeScheduledSession(world: GameWorld, session: ScheduledTrainingSession): GameWorld {
  const planDelegation = resolvePlanDelegation(world, session)
  const intensityDelegation = resolveIntensityDelegation(world, session)

  const definition = planDelegation === undefined ? trainingDefinitionById(session.definitionId) : planDelegation.definition
  const intensity = intensityDelegation === undefined ? session.intensity : intensityDelegation.intensity

  const playerIds = session.scope === 'individual' ? [session.playerId!] : world.teams[session.teamId]!.rosterPlayerIds
  const load = trainingLoad(intensity)
  const executionMultiplier = trainingStaffExecutionMultiplier(world, session, definition)

  let stimulus = { ...world.developmentStimulusByPlayerId }
  let fatigue = { ...world.careerFatigueByPlayerId }
  let moraleByPersonId = world.moraleByPersonId
  const trainingInjuries: InjuryRecord[] = []
  const stimulusEvents = [] as ReturnType<typeof createDevelopmentStimulusEvent>[]
  const participantEvidence: import('@/domain/training').TrainingParticipantExecutionEvidence[] = []
  let participatingLoad = 0

  for (const playerId of playerIds) {
    const available = isPlayerAvailable(world, playerId, world.currentDate)
    const participation = !available ? 'REST' : session.scope === 'team'
      ? trainingParticipationForPlayer(world, session.teamId, playerId, session.date, session.participationByPlayerId?.[playerId])
      : 'FULL'
    const participationMultiplier = participation === 'FULL' ? 1 : participation === 'REDUCED' ? .5 : 0
    if (participationMultiplier === 0) {
      participantEvidence.push({ playerId, participation, careerFatigueDelta: 0, injuryIds: [] })
      continue
    }
    participatingLoad += participationMultiplier
    const rosterPlayer = world.players[playerId]
    const eligible = rosterPlayer === undefined || isPositionEligible(definition, rosterPlayer.basketball.primaryPosition)
    const fatigueBefore = fatigue[playerId] ?? 0
    const moraleBefore = moraleByPersonId[playerId]?.value
    let developmentStimulusEventId: string | undefined
    if (eligible) {
      const efficiency = Math.max(0.4, 1 - (fatigue[playerId] ?? 0) / 150)
      const stimulusMultiplier = planDelegation === undefined ? 1 : delegatedStimulusMultiplier(planDelegation.qualityScore, stimulusVarianceSeed(planDelegation.responsibilityId, session.id, playerId, world.currentDate))
      const developmentDelta = distributeStimulus(definition, load.stimulus * efficiency * stimulusMultiplier * executionMultiplier * participationMultiplier)
      if (Object.keys(developmentDelta).length > 0) {
        stimulus[playerId] = addDevelopmentStimulus(stimulus[playerId]!, developmentDelta)
        const event = createDevelopmentStimulusEvent({ id: `training:${session.id}:${playerId}`, playerId, sourceType: 'training', sourceId: session.id, date: world.currentDate, byRating: developmentDelta })
        stimulusEvents.push(event)
        developmentStimulusEventId = event.id
      }
    }
    const fatigueExecutionMultiplier = definition.category === 'recovery' ? executionMultiplier : 1
    const fatigueDelta = load.fatigue * definition.effects.fatigueMultiplier * fatigueExecutionMultiplier * participationMultiplier
    fatigue[playerId] = clampCareerFatigue((fatigue[playerId] ?? 0) + fatigueDelta)
    if (eligible && definition.effects.moraleDelta !== 0) moraleByPersonId = applyMoraleForPlayer(moraleByPersonId, world, playerId, definition, session, participationMultiplier)

    const kind = deterministicInjuryKind('TRAINING', session.id, playerId)
    const probability = trainingInjuryProbability({
      riskWeight: definition.effects.injuryRiskWeight,
      intensity,
      durationMinutes: session.durationMinutes,
      fatigue: world.careerFatigueByPlayerId[playerId] ?? 0,
      recurrence: recurrenceRiskMultiplier(world, playerId, kind, world.currentDate),
      participationMultiplier,
    })
    if (new SeededRandomSource(hashStringToSeed(`training-injury-occurrence-v1:${session.id}:${playerId}`)).nextFloat(0, 1) < probability) {
      trainingInjuries.push(createDeterministicInjury({ playerId, injuredOn: world.currentDate, source: 'TRAINING', sourceId: session.id }))
    }
    participantEvidence.push({
      playerId,
      participation,
      careerFatigueDelta: fatigue[playerId]! - fatigueBefore,
      ...(developmentStimulusEventId === undefined ? {} : { developmentStimulusEventId }),
      injuryIds: trainingInjuries.filter((injury) => injury.playerId === playerId).map((injury) => injury.id),
      ...(moraleBefore === undefined || moraleByPersonId[playerId] === undefined || moraleByPersonId[playerId]!.value === moraleBefore ? {} : { moraleDelta: moraleByPersonId[playerId]!.value - moraleBefore }),
    })
  }

  const cohesionExecutionMultiplier = definition.category === 'tactical' ? executionMultiplier * (playerIds.length === 0 ? 0 : participatingLoad / playerIds.length) : 1
  const teamCohesionByTeamId = definition.effects.cohesionDelta === 0
    ? world.teamCohesionByTeamId
    : { ...world.teamCohesionByTeamId, [session.teamId]: clampTeamCohesion((world.teamCohesionByTeamId[session.teamId] ?? 50) + definition.effects.cohesionDelta * cohesionExecutionMultiplier) }

  const delegationOutcomes = [
    ...(planDelegation === undefined ? [] : [planDelegation.outcome]),
    ...(intensityDelegation === undefined ? [] : [intensityDelegation.outcome]),
  ]

  const plannedDefinition = trainingDefinitionById(session.definitionId)
  const plannedModuleName = (session.moduleId === undefined ? undefined : world.userTrainingModulesById[session.moduleId]?.name) ?? plannedDefinition.name
  const moduleName = planDelegation === undefined ? plannedModuleName : definition.name
  const completedSession: ScheduledTrainingSession = {
    ...session,
    assignedStaffPersonIds: undefined,
    status: 'completed',
    execution: {
      completedOn: world.currentDate,
      moduleName,
      category: definition.category,
      effectiveIntensity: intensity,
      executingStaffPersonIds: session.assignedStaffPersonIds ?? [],
      executingStaffRoles: (session.assignedStaffPersonIds ?? []).flatMap((staffId) => {
        const roleId = world.staffEmploymentByStaffId[staffId]?.roleId
        return roleId === undefined ? [] : [{ staffId, roleId }]
      }),
      plannedModuleName,
      executionQualityMultiplier: executionMultiplier,
      participants: participantEvidence,
      cohesionDelta: (teamCohesionByTeamId[session.teamId] ?? 50) - (world.teamCohesionByTeamId[session.teamId] ?? 50),
    },
  }

  return updateGameWorld(world, {
    developmentStimulusByPlayerId: stimulus,
    careerFatigueByPlayerId: fatigue,
    moraleByPersonId,
    teamCohesionByTeamId,
    ...(trainingInjuries.length === 0 ? {} : { injuries: [...Object.values(world.injuriesById), ...trainingInjuries] }),
    scheduledTrainingSessionsById: { ...world.scheduledTrainingSessionsById, [session.id]: completedSession },
    developmentStimulusEvents: [...Object.values(world.developmentStimulusEventsById), ...stimulusEvents],
    ...(delegationOutcomes.length === 0 ? {} : { delegationOutcomes: [...Object.values(world.delegationOutcomesById), ...delegationOutcomes] }),
  })
}

/** 0..100 execution suitability for one StaffPerson on this concrete session/definition. */
export function trainingStaffSuitabilityScore(world: GameWorld, session: ScheduledTrainingSession, staffId: StaffPersonId, definition = trainingDefinitionById(session.definitionId)): number {
  const person = world.staffPeopleById[staffId]
  if (person === undefined) return 0
  const assignments = Object.values(world.teamStaffAssignmentsById).filter((item) => item.staffPersonId === staffId && item.teamId === session.teamId)
  if (assignments.length === 0) return 0
  const fits = assignments.flatMap((assignment) => {
    const fit = trainingStaffRoleFit(assignment.role, definition.category, definition.id)
    return fit === undefined ? [] : [fit * calculateStaffRoleProficiencyByRoleId(person, assignment.role)]
  })
  if (fits.length === 0) return 0
  const best = Math.max(...fits)
  return Math.round(Math.max(0, Math.min(100, best)))
}

/**
 * Deterministic, bounded execution quality. No executing staff is exactly legacy behaviour.
 * Contributions are sorted best-first and decay geometrically (1, .55, .3025, ...), so extra
 * helpers can improve a session but can never stack linearly. Final multiplier is clamped to
 * [0.90, 1.18]. No assignment returns exactly 1.0.
 */
export function trainingStaffExecutionMultiplier(world: GameWorld, session: ScheduledTrainingSession, definition = trainingDefinitionById(session.definitionId)): number {
  const assigned = session.assignedStaffPersonIds
  if (assigned === undefined || assigned.length === 0) return 1
  const suitability = assigned
    .map((staffId) => trainingStaffSuitabilityScore(world, session, staffId, definition) / 100)
    .sort((a, b) => b - a)
  const combined = suitability.reduce((total, value, index) => total + value * Math.pow(.55, index), 0)
  return Math.max(.9, Math.min(1.18, 1 + (combined - .5) * .2))
}

function validateAssignedStaff(world: GameWorld, session: ScheduledTrainingSession, existing: readonly ScheduledTrainingSession[]): void {
  const assigned = session.assignedStaffPersonIds
  if (assigned === undefined) return
  if (new Set(assigned).size !== assigned.length) throw new RangeError('Scheduled session staff assignments must not contain duplicates')
  const definition = trainingDefinitionById(session.definitionId)
  for (const staffId of assigned) {
    if (world.staffPeopleById[staffId] === undefined) throw new RangeError(`Unknown scheduled session staff ${staffId}`)
    const employment = world.staffEmploymentByStaffId[staffId]
    const activeAssignments = Object.values(world.teamStaffAssignmentsById).filter((assignment) => assignment.staffPersonId === staffId && assignment.teamId === session.teamId)
    if (employment?.status !== 'employed' || employment.teamId !== session.teamId || activeAssignments.length === 0) throw new RangeError(`Scheduled session staff ${staffId} is not actively employed by this team`)
    if (!activeAssignments.some((assignment) => isTrainingStaffRoleEligible(assignment.role, definition.category, definition.id))) {
      throw new RangeError(`Staff ${staffId} is not eligible to execute ${definition.name}`)
    }
    const conflict = existing.find((other) => other.status === 'scheduled' && other.id !== session.id && other.assignedStaffPersonIds?.includes(staffId) && other.date === session.date && timeRangesOverlap(session, other))
    if (conflict !== undefined) throw new RangeError(`Staff ${staffId} is already assigned to overlapping session ${conflict.id}`)
  }
}

function timeRangesOverlap(a: ScheduledTrainingSession, b: ScheduledTrainingSession): boolean {
  return timeToMinutes(a.startTime) < timeToMinutes(b.startTime) + b.durationMinutes
    && timeToMinutes(b.startTime) < timeToMinutes(a.startTime) + a.durationMinutes
}

/** Canonical decision-quality seed family (docs/STAFF_SYSTEM_V2.md §10.2): `staff-decision-quality-v1:${responsibilityId}:${gameDate}`. Stable IDs/dates only — never map/object iteration order — so results are order-independent across teams. */
function decisionQualitySeed(responsibilityId: string, gameDate: GameDate): string {
  return `staff-decision-quality-v1:${responsibilityId}:${gameDate}`
}

/** Stimulus-variance seed (docs/STAFF_SYSTEM_V2.md §14.2): includes playerId so different players in the same team session do not all receive the exact same fluctuation. Stable IDs/dates only — never map/object iteration order. */
function stimulusVarianceSeed(responsibilityId: string, sessionId: string, playerId: PlayerId, gameDate: GameDate): string {
  return `staff-training-stimulus-v1:${responsibilityId}:${sessionId}:${playerId}:${gameDate}`
}

interface PlanDelegation { readonly definition: TrainingDefinition; readonly responsibilityId: string; readonly qualityScore: number; readonly outcome: DelegationOutcome }
interface IntensityDelegation { readonly intensity: TrainingIntensity; readonly outcome: DelegationOutcome }

/**
 * Resolves the effective definition AND the exactly-once `DelegationOutcome` for the plan
 * responsibility relevant to this session's scope, in a single pass — computing `trainingQuality`
 * exactly once per delegated decision (same seed => same score, so recomputing would be harmless
 * but wasteful and easy to accidentally desync).
 */
function resolvePlanDelegation(world: GameWorld, session: ScheduledTrainingSession): PlanDelegation | undefined {
  const kind = session.scope === 'individual' ? 'assignIndividualDevelopment' : 'createTeamTrainingPlan'
  const resolution = resolveDelegatedResponsibility(world, session.teamId, kind)
  if (resolution === undefined) return undefined
  const seed = decisionQualitySeed(resolution.responsibilityId, world.currentDate)
  const qualityScore = trainingQuality(resolution.context, seed)
  const player = session.scope === 'individual' ? world.players[session.playerId!] : undefined
  const definition = session.scope === 'individual' && player !== undefined
    ? effectiveIndividualDefinition(player, qualityScore, seed)
    : effectiveTeamDefinition(resolution.context.staff, qualityScore, seed)
  const outcome = createDelegationOutcome({
    id: delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${session.id}`),
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind,
    applied: true,
    qualityScore,
    staffRoleIdAtDecision: resolution.context.roleId,
    staffWasOverloadedAtDecision: resolution.context.workload.overloaded,
    payload: { sessionId: session.id, definitionId: definition.id, category: definition.category, scope: session.scope },
  })
  return { definition, responsibilityId: resolution.responsibilityId, qualityScore, outcome }
}

function resolveIntensityDelegation(world: GameWorld, session: ScheduledTrainingSession): IntensityDelegation | undefined {
  const resolution = resolveDelegatedResponsibility(world, session.teamId, 'determineIntensity')
  if (resolution === undefined) return undefined
  const seed = decisionQualitySeed(resolution.responsibilityId, world.currentDate)
  const qualityScore = trainingQuality(resolution.context, seed)
  const intensity = effectiveIntensity(qualityScore, seed)
  const outcome = createDelegationOutcome({
    id: delegationOutcomeIdFromString(`delegation-outcome:${resolution.responsibilityId}:${session.id}`),
    responsibilityId: resolution.responsibilityId,
    staffId: resolution.staffId,
    decidedOn: world.currentDate,
    kind: 'determineIntensity',
    applied: true,
    qualityScore,
    staffRoleIdAtDecision: resolution.context.roleId,
    staffWasOverloadedAtDecision: resolution.context.workload.overloaded,
    payload: { sessionId: session.id, intensity, scope: session.scope },
  })
  return { intensity, outcome }
}

function applyMoraleForPlayer(moraleByPersonId: GameWorld['moraleByPersonId'], world: GameWorld, playerId: PlayerId, definition: TrainingDefinition, session: ScheduledTrainingSession, participationMultiplier: number): GameWorld['moraleByPersonId'] {
  const profile = moraleByPersonId[playerId]
  const personality = world.personalitiesByPersonId[playerId]
  if (profile === undefined || personality === undefined) return moraleByPersonId
  const event: MoraleEvent = {
    id: `training-morale:${session.id}:${playerId}`,
    personId: playerId,
    gameDate: world.currentDate,
    source: 'developmentEvent',
    delta: Math.round(definition.effects.moraleDelta * participationMultiplier),
    context: { sessionId: session.id, definitionId: definition.id },
  }
  if (event.delta === 0) return moraleByPersonId
  return { ...moraleByPersonId, [playerId]: applyMoraleEvent(profile, personality, event) }
}

function distributeStimulus(definition: TrainingDefinition, base: number): Partial<Record<CanonicalRatingKey, number>> {
  if (definition.effects.developmentWeight === 0 || definition.effects.targetRatings.length === 0) return {}
  const perRating = base * definition.effects.developmentWeight
  return Object.fromEntries(definition.effects.targetRatings.map((key) => [key, perRating]))
}

/**
 * Total canonical daily workload score for a team on a given date, used for daily load
 * classification (calendar + Load Management). This is intentionally a distinct score from
 * persisted careerFatigue — see dailyWorkloadScore in domain/training/TrainingLoad.ts.
 */
export function dailyScheduledLoad(world: GameWorld, teamId: TeamId, date: GameWorld['currentDate']): number {
  return Object.values(world.scheduledTrainingSessionsById)
    .filter((session) => session.teamId === teamId && session.date === date)
    .reduce((total, session) => {
      const definition = trainingDefinitionById(session.definitionId)
      return total + dailyWorkloadScore(session.intensity, session.durationMinutes, definition.effects.fatigueMultiplier)
    }, 0)
}
