import { addDevelopmentStimulus } from '@/domain/development/DevelopmentStimulus'
import { clampCareerFatigue } from '@/domain/careerFatigue/CareerFatigue'
import { clampTeamCohesion, dailyWorkloadScore, findCollidingSession, isPositionEligible, trainingDefinitionById, trainingLoad, type ScheduledTrainingSession, type TrainingDefinition, type TrainingIntensity } from '@/domain/training'
import { applyMoraleEvent, type MoraleEvent } from '@/domain/morale'
import { createDelegationOutcome, delegationOutcomeIdFromString, type DelegationOutcome } from '@/domain/responsibility'
import { addDays, type GameDate } from '@/domain/date'
import { updateGameWorld, type GameWorld } from '@/domain/world'
import type { CanonicalRatingKey } from '@/domain/player'
import type { PlayerId, TeamId } from '@/domain/ids'
import { resolveDelegatedResponsibility, trainingQuality } from '@/engine/staff'
import { effectiveIndividualDefinition, effectiveIntensity, effectiveTeamDefinition } from './DelegatedTraining'

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
  return updateGameWorld(world, { scheduledTrainingSessionsById: { ...world.scheduledTrainingSessionsById, [session.id]: session } })
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
 * `definitionId`/`intensity`. The persisted `ScheduledTrainingSession` itself — and therefore the
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

  let stimulus = { ...world.developmentStimulusByPlayerId }
  let fatigue = { ...world.careerFatigueByPlayerId }
  let moraleByPersonId = world.moraleByPersonId

  for (const playerId of playerIds) {
    const rosterPlayer = world.players[playerId]
    const eligible = rosterPlayer === undefined || isPositionEligible(definition, rosterPlayer.basketball.primaryPosition)
    if (eligible) {
      const efficiency = Math.max(0.4, 1 - (fatigue[playerId] ?? 0) / 150)
      const developmentDelta = distributeStimulus(definition, load.stimulus * efficiency)
      if (Object.keys(developmentDelta).length > 0) stimulus[playerId] = addDevelopmentStimulus(stimulus[playerId]!, developmentDelta)
    }
    const fatigueDelta = load.fatigue * definition.effects.fatigueMultiplier
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

/** Canonical decision-quality seed family (docs/STAFF_SYSTEM_V2.md §10.2): `staff-decision-quality-v1:${responsibilityId}:${gameDate}`. Stable IDs/dates only — never map/object iteration order — so results are order-independent across teams. */
function decisionQualitySeed(responsibilityId: string, gameDate: GameDate): string {
  return `staff-decision-quality-v1:${responsibilityId}:${gameDate}`
}

interface PlanDelegation { readonly definition: TrainingDefinition; readonly outcome: DelegationOutcome }
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
  return { definition, outcome }
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
