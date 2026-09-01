import { addDevelopmentStimulus } from '@/domain/development/DevelopmentStimulus'
import { clampCareerFatigue } from '@/domain/careerFatigue/CareerFatigue'
import { clampTeamCohesion, dailyWorkloadScore, findCollidingSession, isPositionEligible, trainingDefinitionById, trainingLoad, type ScheduledTrainingSession, type TrainingDefinition, type TrainingIntensity } from '@/domain/training'
import { calculateStaffRoleProficiencyByRoleId } from '@/domain/staff'
import { applyMoraleEvent, type MoraleEvent } from '@/domain/morale'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome } from '@/domain/responsibility'
import { addDays, type GameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { CanonicalRatingKey } from '@/domain/player'
import type { PlayerId, TeamId } from '@/domain/ids'
import type { StaffPersonId } from '@/domain/ids'
import { resolveDelegatedResponsibility, trainingQuality } from '@/engine/staff'
import { delegatedStimulusMultiplier, effectiveIndividualDefinition, effectiveIntensity, effectiveTeamDefinition } from './DelegatedTraining'

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

/** Called by canonical StaffCareer firing: future work is detached, never left assigned to an unemployed person. */
export function detachStaffFromFutureTrainingSessions(world: GameWorld, staffId: StaffPersonId): GameWorld {
  let changed = false
  const sessions = Object.fromEntries(Object.entries(world.scheduledTrainingSessionsById).map(([id, session]) => {
    if (session.date < world.currentDate || !session.assignedStaffPersonIds?.includes(staffId)) return [id, session]
    changed = true
    const assignedStaffPersonIds = session.assignedStaffPersonIds.filter((id) => id !== staffId)
    return [id, { ...session, ...(assignedStaffPersonIds.length === 0 ? { assignedStaffPersonIds: undefined } : { assignedStaffPersonIds }) }]
  })) as GameWorld['scheduledTrainingSessionsById']
  return changed ? updateGameWorld(world, { scheduledTrainingSessionsById: sessions }) : world
}

export function cancelScheduledTrainingSession(world: GameWorld, sessionId: string): GameWorld {
  const sessions = { ...world.scheduledTrainingSessionsById }
  delete sessions[sessionId]
  return updateGameWorld(world, { scheduledTrainingSessionsById: sessions })
}

/** Executes every scheduled session whose date is world.currentDate and that has not already been completed. Idempotent: completed sessions are skipped. */
export function executeScheduledTrainingSessions(world: GameWorld): GameWorld {
  const due = Object.values(world.scheduledTrainingSessionsById).filter((session) => session.date === world.currentDate && session.status === 'scheduled')
  return due.reduce((next, session) => executeScheduledSession(next, session), world)
}

/**
 * Position eligibility semantics for team sessions on a position-restricted definition:
 * every participating roster player receives the session's physical fatigue/load (they still
 * attend and exert themselves), but only players eligible for the definition's restricted
 * positions receive its targeted development stimulus. This models a coach running a
 * position-specific drill within a team session: everyone trains, only the relevant
 * specialists actually improve the targeted skill.
 *
 * Delegation (Wave 2, docs/STAFF_SYSTEM_V2.md §14.2): if the relevant plan responsibility
 * (`createTeamTrainingPlan` for team sessions, `assignIndividualDevelopment` for individual
 * sessions) and/or `determineIntensity` are `mode: 'delegated'` with a valid holder, the
 * *effective* definition/intensity used for this execution are chosen deterministically from the
 * holder's canonical attributes (see `DelegatedTraining.ts`) instead of the session's own
 * `definitionId`/`intensity`. When the PLAN responsibility specifically is delegated, each
 * eligible player's development stimulus is additionally scaled by a bounded, deterministic
 * `delegatedStimulusMultiplier` — quality narrows the multiplier band toward 1.0, never widens it
 * beyond [0.85, 1.15]. This multiplier is scoped strictly to the plan holder's own decision: it
 * never applies when only `determineIntensity` is delegated (that would misattribute a quality
 * effect to a different responsibility/holder), and it never touches fatigue, morale, cohesion, or
 * `injuryRiskWeight`. The persisted `ScheduledTrainingSession` itself — and therefore the
 * calendar/scheduling authority — is never rewritten; only `status` changes. When neither
 * responsibility is delegated, execution is byte-for-byte identical to pre-Wave-2 behavior.
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

  for (const playerId of playerIds) {
    const rosterPlayer = world.players[playerId]
    const eligible = rosterPlayer === undefined || isPositionEligible(definition, rosterPlayer.basketball.primaryPosition)
    if (eligible) {
      const efficiency = Math.max(0.4, 1 - (fatigue[playerId] ?? 0) / 150)
      const stimulusMultiplier = planDelegation === undefined ? 1 : delegatedStimulusMultiplier(planDelegation.qualityScore, stimulusVarianceSeed(planDelegation.responsibilityId, session.id, playerId, world.currentDate))
      const developmentDelta = distributeStimulus(definition, load.stimulus * efficiency * stimulusMultiplier * executionMultiplier)
      if (Object.keys(developmentDelta).length > 0) stimulus[playerId] = addDevelopmentStimulus(stimulus[playerId]!, developmentDelta)
    }
    const fatigueDelta = load.fatigue * definition.effects.fatigueMultiplier * recoveryExecutionMultiplier(definition, executionMultiplier)
    fatigue[playerId] = clampCareerFatigue((fatigue[playerId] ?? 0) + fatigueDelta)
    if (eligible && definition.effects.moraleDelta !== 0) moraleByPersonId = applyMoraleForPlayer(moraleByPersonId, world, playerId, definition, session)
  }

  const teamCohesionByTeamId = definition.effects.cohesionDelta === 0
    ? world.teamCohesionByTeamId
    : { ...world.teamCohesionByTeamId, [session.teamId]: clampTeamCohesion((world.teamCohesionByTeamId[session.teamId] ?? 50) + definition.effects.cohesionDelta) }

  const delegationOutcomes = [
    ...(planDelegation === undefined ? [] : [planDelegation.outcome]),
    ...(intensityDelegation === undefined ? [] : [intensityDelegation.outcome]),
  ]

  return updateGameWorld(world, {
    developmentStimulusByPlayerId: stimulus,
    careerFatigueByPlayerId: fatigue,
    moraleByPersonId,
    teamCohesionByTeamId,
    scheduledTrainingSessionsById: { ...world.scheduledTrainingSessionsById, [session.id]: { ...session, status: 'completed' } },
    ...(delegationOutcomes.length === 0 ? {} : { delegationOutcomes: [...Object.values(world.delegationOutcomesById), ...delegationOutcomes] }),
  })
}

const ROLE_FIT: Readonly<Record<TrainingDefinition['category'], Readonly<Partial<Record<import('@/domain/staff').StaffRoleId, number>>>>> = {
  shooting: { shootingCoach: 1, skillsCoach: .9, playerDevelopmentCoach: .8 },
  finishing: { skillsCoach: 1, playerDevelopmentCoach: .85, bigManCoach: .7 },
  ballHandling: { skillsCoach: 1, playerDevelopmentCoach: .85 },
  playmaking: { assistantCoach: .9, associateCoach: 1, offensiveSpecialist: 1, playerDevelopmentCoach: .75 },
  defense: { defensiveSpecialist: 1, assistantCoach: .8, associateCoach: .85 },
  rebounding: { bigManCoach: 1, defensiveSpecialist: .8, assistantCoach: .7 },
  physical: { strengthConditioningCoach: 1, performanceCoach: .85, developmentSpecialist: .8 },
  recovery: { performanceCoach: 1, loadManagementSpecialist: .95, sportsScientist: .9, physiotherapist: .8, rehabilitationSpecialist: .75 },
  tactical: { associateCoach: .85, assistantCoach: .8, offensiveSpecialist: 1, defensiveSpecialist: 1 },
}

/** Deterministic, bounded execution quality. No assignment remains exactly legacy behaviour. */
export function trainingStaffExecutionMultiplier(world: GameWorld, session: ScheduledTrainingSession, definition = trainingDefinitionById(session.definitionId)): number {
  const assigned = session.assignedStaffPersonIds
  if (assigned === undefined || assigned.length === 0) return 1
  const fit = ROLE_FIT[definition.category]
  const suitability = assigned.map((staffId) => {
    const assignment = Object.values(world.teamStaffAssignmentsById).find((item) => item.staffPersonId === staffId && item.teamId === session.teamId)
    const person = world.staffPeopleById[staffId]
    if (assignment === undefined || person === undefined) return 0
    return (fit[assignment.role] ?? .15) * calculateStaffRoleProficiencyByRoleId(person, assignment.role) / 100
  }).sort((a, b) => b - a)
  const combined = suitability.reduce((total, value, index) => total + value * Math.pow(.55, index), 0)
  return Math.max(.9, Math.min(1.18, 1 + (combined - .5) * .2))
}

function recoveryExecutionMultiplier(definition: TrainingDefinition, executionMultiplier: number): number {
  return definition.category === 'recovery' ? Math.max(.8, 2 - executionMultiplier) : 1
}

function validateAssignedStaff(world: GameWorld, session: ScheduledTrainingSession, existing: readonly ScheduledTrainingSession[]): void {
  const assigned = session.assignedStaffPersonIds
  if (assigned === undefined) return
  if (new Set(assigned).size !== assigned.length) throw new RangeError('Scheduled session staff assignments must not contain duplicates')
  for (const staffId of assigned) {
    if (world.staffPeopleById[staffId] === undefined) throw new RangeError(`Unknown scheduled session staff ${staffId}`)
    const employment = world.staffEmploymentByStaffId[staffId]
    const activeAssignment = Object.values(world.teamStaffAssignmentsById).some((assignment) => assignment.staffPersonId === staffId && assignment.teamId === session.teamId)
    if (employment?.status !== 'employed' || employment.teamId !== session.teamId || !activeAssignment) throw new RangeError(`Scheduled session staff ${staffId} is not actively employed by this team`)
    const conflict = existing.find((other) => other.id !== session.id && other.assignedStaffPersonIds?.includes(staffId) && other.date === session.date && timeRangesOverlap(session, other))
    if (conflict !== undefined) throw new RangeError(`Staff ${staffId} is already assigned to overlapping session ${conflict.id}`)
  }
}

function timeRangesOverlap(a: ScheduledTrainingSession, b: ScheduledTrainingSession): boolean {
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  return minutes(a.startTime) < minutes(b.startTime) + b.durationMinutes && minutes(b.startTime) < minutes(a.startTime) + a.durationMinutes
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
    payload: { sessionId: session.id, intensity, scope: session.scope },
  })
  return { intensity, outcome }
}

function applyMoraleForPlayer(moraleByPersonId: GameWorld['moraleByPersonId'], world: GameWorld, playerId: PlayerId, definition: TrainingDefinition, session: ScheduledTrainingSession): GameWorld['moraleByPersonId'] {
  const profile = moraleByPersonId[playerId]
  const personality = world.personalitiesByPersonId[playerId]
  if (profile === undefined || personality === undefined) return moraleByPersonId
  const event: MoraleEvent = {
    id: `training-morale:${session.id}:${playerId}`,
    personId: playerId,
    gameDate: world.currentDate,
    source: 'developmentEvent',
    delta: Math.round(definition.effects.moraleDelta),
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
