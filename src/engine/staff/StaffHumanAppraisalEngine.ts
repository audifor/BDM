import { calculateAge } from '@/domain/player'
import { isStaffContractActiveOn } from '@/domain/staffContract'
import { staffReputationScore } from '@/domain/staffReputation'
import { staffRoleDefinition } from '@/domain/staff'
import {
  calculateStaffWorkload,
  getResponsibilitiesHeldByStaff,
  getStaffAssignment,
  getStaffPerson,
  getTeamResponsibilities,
  type GameWorld,
} from '@/domain/world'
import {
  STAFF_EXPECTATION_DIMENSIONS,
  STAFF_HUMAN_STATE_DIMENSIONS,
  clampHumanStateValue,
  classifyWorkloadBand,
  createStaffExpectationProfile,
  deriveCareerStage,
  deriveExpectationGap,
  knownReality,
  UNKNOWN_REALITY,
  type ExpectationGapDuration,
  type StaffExpectationDimension,
  type StaffExpectationProfile,
  type StaffExpectationValues,
  type StaffHumanContext,
  type StaffHumanState,
  type StaffHumanStateDimension,
  type StaffRealityProfile,
  type StaffRealityReading,
} from '@/domain/staffHumanState'
import { STAFF_CONSEQUENCE_SIGNAL_KINDS, type StaffConsequenceSignal, type StaffConsequenceSignalKind } from '@/domain/staffHumanState/StaffConsequenceSignals'

// ---------------------------------------------------------------------------
// §6/§19 — Reality Engine: one known/unknown reading per Expectation dimension,
// derived exclusively from existing canonical GameWorld authorities. Never fabricated.
// ---------------------------------------------------------------------------

export function deriveStaffReality(world: GameWorld, context: StaffHumanContext): StaffRealityProfile {
  const assignment = getStaffAssignment(world, context.staffId)
  const roleDefinition = assignment === undefined ? undefined : staffRoleDefinition(assignment.role)
  const held = getResponsibilitiesHeldByStaff(world, context.staffId)
  const teamResponsibilities = getTeamResponsibilities(world, context.teamId)
  const workload = calculateStaffWorkload(world, context.staffId)
  const contract = Object.values(world.staffContractsById).find((item) => item.staffId === context.staffId && item.teamId === context.teamId && isStaffContractActiveOn(item, world.currentDate))
  const reputation = world.staffReputationProfilesByStaffId[context.staffId]

  const delegatedOrAdvisoryHeld = held.filter((item) => item.mode === 'delegated' || item.mode === 'advisory')
  const decisionAccessCount = held.length
  const influenceReality = held.length === 0 ? UNKNOWN_REALITY : knownReality(30 + Math.min(60, held.reduce((sum, item) => sum + (item.mode === 'delegated' ? 18 : 12), 0)))
  const autonomyReality = held.length === 0 ? UNKNOWN_REALITY : knownReality(20 + Math.min(70, delegatedOrAdvisoryHeld.reduce((sum, item) => sum + (item.mode === 'delegated' ? 20 : 8), 0)))

  const reality: Record<StaffExpectationDimension, StaffRealityReading> = {
    roleStature: roleDefinition === undefined ? UNKNOWN_REALITY : knownReality(seniorityStature(roleDefinition.seniority)),
    responsibility: teamResponsibilities.length === 0 ? UNKNOWN_REALITY : knownReality(20 + Math.min(75, held.length * 15)),
    autonomy: autonomyReality,
    influence: influenceReality,
    compensation: contract === undefined ? UNKNOWN_REALITY : knownReality(compensationScore(contract.compensation.annualSalary, roleDefinition?.seniority)),
    workload: knownReality(workloadRealityScore(workload.utilization)),
    progression: UNKNOWN_REALITY, // no canonical career-trajectory authority yet — never fabricated
    recognition: reputation === undefined ? UNKNOWN_REALITY : knownReality(Math.round(staffReputationScore(reputation) / 10)),
    jobSecurity: contract === undefined ? UNKNOWN_REALITY : knownReality(jobSecurityScore(contract, world.currentDate)),
    professionalChallenge: assignment === undefined ? UNKNOWN_REALITY : knownReality(professionalChallengeScore(workload.utilization)),
    development: UNKNOWN_REALITY, // no canonical Staff development-track authority yet
    resourceSupport: UNKNOWN_REALITY, // no canonical Organization resource authority yet — Team !== Organization
    informationAccess: decisionAccessCount === 0 ? UNKNOWN_REALITY : knownReality(40 + Math.min(50, decisionAccessCount * 10)),
    decisionAccess: decisionAccessCount === 0 ? UNKNOWN_REALITY : knownReality(30 + Math.min(60, delegatedOrAdvisoryHeld.length * 15)),
    organizationalAmbition: UNKNOWN_REALITY, // no canonical organizational-ambition/project authority yet
  }
  return reality
}

function seniorityStature(seniority: string): number {
  return seniority === 'director' ? 90 : seniority === 'senior' ? 72 : seniority === 'standard' ? 52 : 32
}
function compensationScore(annualSalary: number, seniority: string | undefined): number {
  const baseline = seniority === 'director' ? 130_000 : seniority === 'senior' ? 90_000 : seniority === 'standard' ? 65_000 : 45_000
  return clampHumanStateValue(50 * (annualSalary / baseline))
}
function jobSecurityScore(contract: { readonly term: { readonly startsOn: string; readonly expiresOn: string } }, currentDate: string): number {
  const monthsRemaining = Math.max(0, monthsBetween(currentDate, contract.term.expiresOn))
  return clampHumanStateValue(30 + Math.min(70, monthsRemaining * 4))
}
function monthsBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth] = fromDate.split('-').map(Number)
  const [toYear, toMonth] = toDate.split('-').map(Number)
  return (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!)
}
function workloadRealityScore(utilization: number): number {
  if (!Number.isFinite(utilization)) return 0
  // Healthy utilization (around 0.6-0.85) reads as a strong workload reality; under/over reads lower.
  if (utilization <= 0.85) return clampHumanStateValue(40 + utilization * 70)
  return clampHumanStateValue(Math.max(0, 100 - (utilization - 0.85) * 150))
}
function professionalChallengeScore(utilization: number): number {
  if (!Number.isFinite(utilization)) return 30
  if (utilization < 0.3) return 25
  if (utilization > 1.1) return 30
  return clampHumanStateValue(50 + (0.65 - Math.abs(utilization - 0.65)) * 80)
}

// ---------------------------------------------------------------------------
// §6 — Expectation derivation at context creation. Uses PERSON/STAFF signals actually
// available: personality, career stage (age-derived), role, contract, reputation.
// ---------------------------------------------------------------------------

export function deriveInitialExpectations(world: GameWorld, context: StaffHumanContext): StaffExpectationValues {
  const person = getStaffPerson(world, context.staffId)
  const assignment = getStaffAssignment(world, context.staffId)
  const roleDefinition = assignment === undefined ? undefined : staffRoleDefinition(assignment.role)
  const personality = world.personalitiesByPersonId[context.staffId]
  const age = person?.identity.dateOfBirth === undefined ? undefined : calculateAge(person.identity.dateOfBirth, world.currentDate)
  const careerStage = deriveCareerStage(age)
  const ambition = personality?.values.ambition ?? 50
  const professionalism = personality?.values.professionalism ?? 50

  const seniorityBase = roleDefinition === undefined ? 50 : seniorityStature(roleDefinition.seniority)
  const stageAmbitionAdjust = careerStage === 'EARLY' ? 10 : careerStage === 'LATE_CAREER' ? -8 : 0
  const ambitionAdjust = (ambition - 50) / 3

  const values: Record<StaffExpectationDimension, number> = {
    roleStature: clampHumanStateValue(seniorityBase + ambitionAdjust * 0.4),
    responsibility: clampHumanStateValue(45 + ambitionAdjust + stageAmbitionAdjust * 0.5),
    autonomy: clampHumanStateValue(45 + ambitionAdjust),
    influence: clampHumanStateValue(40 + ambitionAdjust * 0.8),
    compensation: clampHumanStateValue(50 + (ambition - 50) / 4),
    workload: clampHumanStateValue(55),
    progression: clampHumanStateValue(50 + ambitionAdjust + stageAmbitionAdjust),
    recognition: clampHumanStateValue(45 + (ambition - 50) / 3),
    jobSecurity: clampHumanStateValue(careerStage === 'LATE_CAREER' || careerStage === 'VETERAN' ? 60 : 45),
    professionalChallenge: clampHumanStateValue(45 + (professionalism - 50) / 3),
    development: clampHumanStateValue(careerStage === 'EARLY' ? 65 : careerStage === 'ESTABLISHING' ? 55 : 40),
    resourceSupport: 50,
    informationAccess: clampHumanStateValue(45 + ambitionAdjust * 0.5),
    decisionAccess: clampHumanStateValue(40 + ambitionAdjust * 0.7),
    organizationalAmbition: clampHumanStateValue(40 + ambitionAdjust),
  }
  return values
}

// ---------------------------------------------------------------------------
// §34 — Context initialization: expectations + snapshot + initial Human State.
// ---------------------------------------------------------------------------

export function initializeStaffExpectationProfile(world: GameWorld, context: StaffHumanContext): StaffExpectationProfile {
  const values = deriveInitialExpectations(world, context)
  return createStaffExpectationProfile({
    contextId: context.id,
    staffId: context.staffId,
    initial: values,
    current: values,
    establishedOn: world.currentDate,
    lastAdjustedOn: world.currentDate,
  })
}

/** Initial Human State: measured from available Reality vs freshly-derived Expectations — never a uniform 50 unless that is genuinely what the evaluation yields. */
export function initializeStaffHumanState(world: GameWorld, context: StaffHumanContext, expectations: StaffExpectationValues): StaffHumanState {
  const reality = deriveStaffReality(world, context)
  const personality = world.personalitiesByPersonId[context.staffId]
  const resilience = personality?.values.resilience ?? 50

  const satisfactionFor = (dimensions: readonly StaffExpectationDimension[]): number => {
    const knownGaps = dimensions.map((dimension) => deriveExpectationGap(dimension, expectations[dimension], reality[dimension])).filter((gap) => reality[gap.dimension].known)
    if (knownGaps.length === 0) return 55 // no negative assumption from absent data
    const average = knownGaps.reduce((sum, gap) => sum + gap.gapValue, 0) / knownGaps.length
    return clampHumanStateValue(60 + average * 0.6)
  }

  return {
    contextId: context.id,
    staffId: context.staffId,
    roleSatisfaction: satisfactionFor(['roleStature']),
    responsibilitySatisfaction: satisfactionFor(['responsibility']),
    autonomySatisfaction: satisfactionFor(['autonomy']),
    influenceSatisfaction: satisfactionFor(['influence', 'decisionAccess']),
    contractSatisfaction: satisfactionFor(['compensation', 'jobSecurity']),
    workloadSatisfaction: satisfactionFor(['workload']),
    professionalFulfillment: satisfactionFor(['professionalChallenge', 'development']),
    recognitionSatisfaction: satisfactionFor(['recognition']),
    frustration: clampHumanStateValue(20 - (resilience - 50) / 10),
    stress: clampHumanStateValue(classifyWorkloadBand(calculateStaffWorkload(world, context.staffId).utilization) === 'OVERLOADED' ? 45 : 20),
    organizationalCommitment: clampHumanStateValue(50 + ((personality?.values.loyalty ?? 50) - 50) / 3),
    lastEvaluatedOn: world.currentDate,
  }
}

// ---------------------------------------------------------------------------
// §20/§21 — Appraisal: 15 expectations vs 15 realities vs gap duration -> persistent pressure.
// ---------------------------------------------------------------------------

const GAP_TO_DIMENSIONS: Readonly<Partial<Record<StaffExpectationDimension, readonly StaffHumanStateDimension[]>>> = {
  roleStature: ['roleSatisfaction'],
  responsibility: ['responsibilitySatisfaction'],
  autonomy: ['autonomySatisfaction'],
  influence: ['influenceSatisfaction'],
  decisionAccess: ['influenceSatisfaction'],
  informationAccess: ['influenceSatisfaction'],
  compensation: ['contractSatisfaction'],
  jobSecurity: ['contractSatisfaction'],
  workload: ['workloadSatisfaction'],
  progression: ['professionalFulfillment'],
  professionalChallenge: ['professionalFulfillment'],
  development: ['professionalFulfillment'],
  recognition: ['recognitionSatisfaction'],
  resourceSupport: ['workloadSatisfaction'],
  organizationalAmbition: ['organizationalCommitment'],
}

const DURATION_PRESSURE_SCALE: Readonly<Record<ExpectationGapDuration, number>> = {
  RECENT: 0.3,
  ESTABLISHED: 0.6,
  SUSTAINED: 1,
  CHRONIC: 1.4,
}

/** How long a gap has persisted, derived from how long the context has existed relative to `lastEvaluatedOn` cadence — a coarse, deterministic bucket, never a per-day counter. */
export function classifyGapDuration(monthsSinceEstablished: number): ExpectationGapDuration {
  if (monthsSinceEstablished < 1) return 'RECENT'
  if (monthsSinceEstablished < 3) return 'ESTABLISHED'
  if (monthsSinceEstablished < 8) return 'SUSTAINED'
  return 'CHRONIC'
}

export interface AppraisalResult {
  readonly state: StaffHumanState
  readonly expectations: StaffExpectationProfile
}

/** §21 — the periodic Appraisal pass. Never persisted gaps: derived fresh from current expectations vs current reality on every call. */
export function appraiseStaffHumanState(world: GameWorld, context: StaffHumanContext, currentState: StaffHumanState, expectations: StaffExpectationProfile, monthsSinceEstablished: number): AppraisalResult {
  const reality = deriveStaffReality(world, context)
  const duration = classifyGapDuration(monthsSinceEstablished)
  const durationScale = DURATION_PRESSURE_SCALE[duration]

  const pressureByStateDimension: Record<StaffHumanStateDimension, number> = {} as never
  for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) pressureByStateDimension[dimension] = 0

  for (const expectationDimension of STAFF_EXPECTATION_DIMENSIONS) {
    const reading = reality[expectationDimension]
    if (!reading.known) continue
    const gap = deriveExpectationGap(expectationDimension, expectations.current[expectationDimension], reading)
    const affected = GAP_TO_DIMENSIONS[expectationDimension]
    if (affected === undefined) continue
    // Gradual persistent pressure, never "-1 per day": bounded per-appraisal nudge scaled by gap size and duration.
    const nudge = Math.max(-6, Math.min(6, gap.gapValue * 0.08 * durationScale))
    for (const stateDimension of affected) pressureByStateDimension[stateDimension] += nudge
  }

  const nextValues: Record<StaffHumanStateDimension, number> = {} as never
  for (const dimension of STAFF_HUMAN_STATE_DIMENSIONS) {
    if (dimension === 'frustration' || dimension === 'stress' || dimension === 'organizationalCommitment') {
      nextValues[dimension] = currentState[dimension] // recovery/inertia handled by the dedicated Recovery step, not the gap-pressure appraisal
      continue
    }
    nextValues[dimension] = clampHumanStateValue(currentState[dimension] + pressureByStateDimension[dimension])
  }

  const nextExpectations = adaptExpectations(expectations, reality, duration)

  return {
    state: { ...currentState, ...nextValues, lastEvaluatedOn: world.currentDate },
    expectations: nextExpectations,
  }
}

/** §25 — Hedonic adaptation: positive adaptation is allowed and gradual; negative adaptation is strictly limited (a bad reality never fully becomes the new normal). */
function adaptExpectations(profile: StaffExpectationProfile, reality: StaffRealityProfile, duration: ExpectationGapDuration): StaffExpectationProfile {
  if (duration !== 'SUSTAINED' && duration !== 'CHRONIC') return profile
  const nextCurrent: Record<StaffExpectationDimension, number> = {} as never
  for (const dimension of STAFF_EXPECTATION_DIMENSIONS) {
    const reading = reality[dimension]
    const current = profile.current[dimension]
    if (!reading.known) { nextCurrent[dimension] = current; continue }
    const gap = reading.value - current
    const positive = gap > 0
    const adaptationRate = positive ? 0.06 : 0.02 // negative adaptation limited, per §25
    const capped = positive ? gap : Math.max(gap, -25) // a bad reality never drags current expectation down more than 25 points below its own trajectory in one pass
    nextCurrent[dimension] = clampHumanStateValue(current + capped * adaptationRate)
  }
  return { ...profile, current: nextCurrent, lastAdjustedOn: profile.lastAdjustedOn }
}

// ---------------------------------------------------------------------------
// §23 — Recovery: stress fast, frustration slower; satisfaction never blindly reverts to 50.
// ---------------------------------------------------------------------------

export function applyHumanStateRecovery(state: StaffHumanState, personality: { readonly values: Readonly<Record<string, number>> } | undefined): StaffHumanState {
  const resilience = personality?.values.resilience ?? 50
  const stressBaseline = clampHumanStateValue(15 - (resilience - 50) / 10)
  const frustrationBaseline = clampHumanStateValue(15 - (resilience - 50) / 15)
  const stressRecoveryRate = 0.18
  const frustrationRecoveryRate = 0.08
  return {
    ...state,
    stress: clampHumanStateValue(state.stress + (stressBaseline - state.stress) * stressRecoveryRate),
    frustration: clampHumanStateValue(state.frustration + (frustrationBaseline - state.frustration) * frustrationRecoveryRate),
  }
}

// ---------------------------------------------------------------------------
// §27 — Overall Satisfaction: derived, never persisted, individualized by PERSON/STAFF weights.
// ---------------------------------------------------------------------------

const SATISFACTION_DIMENSIONS: readonly StaffHumanStateDimension[] = ['roleSatisfaction', 'responsibilitySatisfaction', 'autonomySatisfaction', 'influenceSatisfaction', 'contractSatisfaction', 'workloadSatisfaction', 'professionalFulfillment', 'recognitionSatisfaction']

export function deriveOverallSatisfaction(state: StaffHumanState, personality: { readonly values: Readonly<Record<string, number>> } | undefined): number {
  const ambition = personality?.values.ambition ?? 50
  const weight = (dimension: StaffHumanStateDimension): number => {
    if ((dimension === 'influenceSatisfaction' || dimension === 'recognitionSatisfaction') && ambition > 60) return 1.3
    if (dimension === 'contractSatisfaction' && ambition < 40) return 1.2
    return 1
  }
  const weighted = SATISFACTION_DIMENSIONS.reduce((sum, dimension) => sum + state[dimension] * weight(dimension), 0)
  const totalWeight = SATISFACTION_DIMENSIONS.reduce((sum, dimension) => sum + weight(dimension), 0)
  const base = weighted / totalWeight
  const commitmentBlend = base * 0.85 + state.organizationalCommitment * 0.15
  const penalty = (state.frustration * 0.25 + state.stress * 0.15) / 2
  return clampHumanStateValue(commitmentBlend - penalty * 0.3)
}

// ---------------------------------------------------------------------------
// §28 — 40 Consequence Signals, fully derived, never persisted as booleans.
// ---------------------------------------------------------------------------

export function getStaffConsequenceSignals(world: GameWorld, context: StaffHumanContext, state: StaffHumanState, expectations: StaffExpectationProfile, sustainedMonths: number): readonly StaffConsequenceSignal[] {
  const reality = deriveStaffReality(world, context)
  const signals: StaffConsequenceSignal[] = []
  const add = (kind: StaffConsequenceSignalKind, severity: 1 | 2 | 3) => signals.push({ kind, severity })

  if (state.frustration >= 75) add('chronicFrustration', state.frustration >= 90 ? 3 : 2)
  if (state.stress >= 70) add('sustainedHighStress', state.stress >= 88 ? 3 : 2)
  if (state.stress >= 92) add('extremeStressRisk', 3)
  if (state.frustration >= 70 && state.stress >= 70) add('professionalBurnoutRisk', 3)
  if (state.frustration <= 25 && state.stress <= 25) add('emotionalRecovery', 1)

  const gapFor = (dimension: StaffExpectationDimension) => deriveExpectationGap(dimension, expectations.current[dimension], reality[dimension])

  const roleGap = gapFor('roleStature')
  if (roleGap.band === 'BELOW' || roleGap.band === 'STRONGLY_BELOW') add('roleExpectationMismatch', roleGap.band === 'STRONGLY_BELOW' ? 3 : 2)
  if (roleGap.band === 'STRONGLY_ABOVE') add('roleStatusGrowth', 1)
  if (roleGap.band === 'STRONGLY_BELOW') add('roleStatusErosion', 2)

  const responsibilityGap = gapFor('responsibility')
  if (responsibilityGap.band === 'BELOW' || responsibilityGap.band === 'STRONGLY_BELOW') add('responsibilityExpectationMismatch', responsibilityGap.band === 'STRONGLY_BELOW' ? 3 : 2)
  if (responsibilityGap.band === 'ABOVE' || responsibilityGap.band === 'STRONGLY_ABOVE') add('responsibilityRecognition', 1)

  const workloadBand = classifyWorkloadBand(calculateStaffWorkload(world, context.staffId).utilization)
  if (workloadBand === 'UNDERUTILIZED' && sustainedMonths >= 1) add('sustainedUnderutilization', 2)
  if (workloadBand === 'OVERLOADED' && sustainedMonths >= 1) add('responsibilityOverextension', 2)
  if (workloadBand === 'HEAVY' && sustainedMonths >= 1) add('sustainedHeavyWorkload', 1)
  if (workloadBand === 'OVERLOADED' && sustainedMonths >= 2) add('sustainedOverload', 3)
  if (workloadBand === 'HEALTHY' && state.workloadSatisfaction >= 60) add('workloadRecovery', 1)

  const challengeGap = gapFor('professionalChallenge')
  if (challengeGap.band === 'BELOW' || challengeGap.band === 'STRONGLY_BELOW') add('professionalChallengeDeficit', 2)
  if (challengeGap.band === 'MATCHED' && state.professionalFulfillment >= 60) add('professionalChallengeFit', 1)

  const autonomyGap = gapFor('autonomy')
  if (autonomyGap.band === 'BELOW' || autonomyGap.band === 'STRONGLY_BELOW') add('autonomyDeficit', autonomyGap.band === 'STRONGLY_BELOW' ? 3 : 2)
  if (autonomyGap.band === 'ABOVE' || autonomyGap.band === 'STRONGLY_ABOVE') add('autonomyFulfilled', 1)

  const influenceGap = gapFor('influence')
  if (influenceGap.band === 'BELOW' || influenceGap.band === 'STRONGLY_BELOW') add('influenceDeficit', influenceGap.band === 'STRONGLY_BELOW' ? 3 : 2)
  if (influenceGap.band === 'ABOVE' || influenceGap.band === 'STRONGLY_ABOVE') add('influenceGrowth', 1)

  const decisionGap = gapFor('decisionAccess')
  if (decisionGap.band === 'BELOW' || decisionGap.band === 'STRONGLY_BELOW') add('decisionAccessDeficit', 2)
  const infoGap = gapFor('informationAccess')
  if (infoGap.band === 'BELOW' || infoGap.band === 'STRONGLY_BELOW') add('informationAccessDeficit', 1)

  if (state.influenceSatisfaction >= 65) add('professionalVoiceValidated', 1)
  if (state.influenceSatisfaction <= 25 && state.frustration >= 60) add('repeatedProfessionalDisregard', 3)

  const recognitionGap = gapFor('recognition')
  if (recognitionGap.band === 'BELOW' || recognitionGap.band === 'STRONGLY_BELOW') add('recognitionDeficit', 2)
  if (recognitionGap.band === 'ABOVE' || recognitionGap.band === 'STRONGLY_ABOVE') add('recognitionSurplus', 1)

  if (state.professionalFulfillment <= 30) add('professionalFulfillmentDeficit', 2)
  if (state.professionalFulfillment >= 75) add('highProfessionalFulfillment', 1)

  if (state.recognitionSatisfaction >= 65 && state.professionalFulfillment >= 60) add('successAttributionPositive', 1)
  if (state.recognitionSatisfaction <= 30 && state.professionalFulfillment <= 35) add('successAttributionDeficit', 2)

  if (reality.resourceSupport.known && reality.resourceSupport.value <= 30) add('resourceSupportDeficit', 2)
  if (reality.resourceSupport.known && reality.resourceSupport.value >= 75) add('resourceSupportStrong', 1)

  const compensationGap = gapFor('compensation')
  if (compensationGap.band === 'BELOW' || compensationGap.band === 'STRONGLY_BELOW') add('contractMismatch', compensationGap.band === 'STRONGLY_BELOW' ? 3 : 2)
  const jobSecurityGap = gapFor('jobSecurity')
  if (jobSecurityGap.band === 'BELOW' || jobSecurityGap.band === 'STRONGLY_BELOW') add('jobSecurityConcern', 2)

  const developmentGap = gapFor('development')
  if (reality.development.known && (developmentGap.band === 'BELOW' || developmentGap.band === 'STRONGLY_BELOW')) add('developmentStagnation', 2)
  if (reality.development.known && (developmentGap.band === 'ABOVE' || developmentGap.band === 'STRONGLY_ABOVE')) add('developmentMomentum', 1)

  if (state.organizationalCommitment <= 30) add('lowOrganizationalCommitment', state.organizationalCommitment <= 15 ? 3 : 2)
  const ambitionGap = gapFor('organizationalAmbition')
  if (reality.organizationalAmbition.known && (ambitionGap.band === 'BELOW' || ambitionGap.band === 'STRONGLY_BELOW')) add('organizationalAmbitionMismatch', 2)

  return signals
}

export { STAFF_CONSEQUENCE_SIGNAL_KINDS }
