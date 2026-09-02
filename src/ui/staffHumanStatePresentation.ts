import type { StaffPersonId, TeamId } from '@/domain/ids'
import { getMemoriesForEntity, getRelationshipsForPerson, getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import { getRelationshipBand } from '@/domain/relationships'
import { getRecentMemories } from '@/domain/memory'
import {
  STAFF_EXPECTATION_DIMENSIONS,
  STAFF_HUMAN_STATE_DIMENSIONS,
  classifyWorkloadBand,
  deriveExpectationGap,
  type StaffExpectationDimension,
  type StaffHumanContext,
  type StaffHumanStateDimension,
} from '@/domain/staffHumanState'
import { deriveStaffReality, deriveOverallSatisfaction, getStaffConsequenceSignals } from '@/engine/staff/StaffHumanAppraisalEngine'
import { calculateStaffWorkload } from '@/domain/world'
import { STAFF_ROLE_LABELS } from './staffPresentation'

/**
 * Wave 5A §38-44 — pure, read-only Staff Dynamics presentation. NEVER computes psychological
 * semantics itself beyond formatting/labeling what the domain/engine layers already derived
 * (`getStaffConsequenceSignals`, `deriveOverallSatisfaction`, `deriveExpectationGap`) — the UI
 * consumes this, it never re-derives interpretation on its own.
 */
export type StaffDynamicsInterpretedState = 'THRIVING' | 'CONTENT' | 'SETTLED' | 'MIXED' | 'CONCERNED' | 'FRUSTRATED' | 'STRAINED' | 'DISENGAGED'
export type StaffDynamicsTrend = 'IMPROVING' | 'STABLE' | 'WORSENING'

export type StaffSatisfactionBand = 'EXTREMELY_DISSATISFIED' | 'VERY_DISSATISFIED' | 'DISSATISFIED' | 'MIXED' | 'SATISFIED' | 'VERY_SATISFIED' | 'EXTREMELY_SATISFIED'
export type StaffIntensityBand = 'VERY_LOW' | 'LOW' | 'MILD' | 'MODERATE' | 'HIGH' | 'VERY_HIGH' | 'EXTREME'

export const SATISFACTION_BAND_LABELS: Readonly<Record<StaffSatisfactionBand, string>> = {
  EXTREMELY_DISSATISFIED: 'EXTREMELY DISSATISFIED',
  VERY_DISSATISFIED: 'VERY DISSATISFIED',
  DISSATISFIED: 'DISSATISFIED',
  MIXED: 'MIXED',
  SATISFIED: 'SATISFIED',
  VERY_SATISFIED: 'VERY SATISFIED',
  EXTREMELY_SATISFIED: 'EXTREMELY SATISFIED',
}
export const INTENSITY_BAND_LABELS: Readonly<Record<StaffIntensityBand, string>> = {
  VERY_LOW: 'VERY LOW', LOW: 'LOW', MILD: 'MILD', MODERATE: 'MODERATE', HIGH: 'HIGH', VERY_HIGH: 'VERY HIGH', EXTREME: 'EXTREME',
}

export function classifySatisfactionBand(value: number): StaffSatisfactionBand {
  if (value < 12) return 'EXTREMELY_DISSATISFIED'
  if (value < 28) return 'VERY_DISSATISFIED'
  if (value < 42) return 'DISSATISFIED'
  if (value < 58) return 'MIXED'
  if (value < 72) return 'SATISFIED'
  if (value < 88) return 'VERY_SATISFIED'
  return 'EXTREMELY_SATISFIED'
}

export function classifyIntensityBand(value: number): StaffIntensityBand {
  if (value < 12) return 'VERY_LOW'
  if (value < 28) return 'LOW'
  if (value < 42) return 'MILD'
  if (value < 58) return 'MODERATE'
  if (value < 72) return 'HIGH'
  if (value < 88) return 'VERY_HIGH'
  return 'EXTREME'
}

/** Dimensions bandied as satisfaction (higher = better); frustration/stress use intensity bands (higher = worse). */
const SATISFACTION_DIMENSIONS: readonly StaffHumanStateDimension[] = ['roleSatisfaction', 'responsibilitySatisfaction', 'autonomySatisfaction', 'influenceSatisfaction', 'contractSatisfaction', 'workloadSatisfaction', 'professionalFulfillment', 'recognitionSatisfaction', 'organizationalCommitment']
const INTENSITY_DIMENSIONS: readonly StaffHumanStateDimension[] = ['frustration', 'stress']

export interface StaffDynamicsPresentationItem {
  readonly staffId: StaffPersonId
  readonly staffName: string
  readonly role: string | undefined
  readonly interpretedState: StaffDynamicsInterpretedState
  readonly trend: StaffDynamicsTrend
  readonly overallSatisfaction: StaffSatisfactionBand
  readonly bands: Readonly<Record<StaffHumanStateDimension, StaffSatisfactionBand | StaffIntensityBand>>
  readonly needsAttention: boolean
  readonly signalKinds: readonly string[]
}

export function getStaffDynamicsForTeam(world: GameWorld, teamId: TeamId): readonly StaffDynamicsPresentationItem[] {
  return Object.values(world.staffHumanContextsById)
    .filter((context) => context.teamId === teamId && context.endedOn === undefined)
    .map((context) => toDynamicsItem(world, context))
    .filter((item): item is StaffDynamicsPresentationItem => item !== undefined)
    .sort((left, right) => left.staffName.localeCompare(right.staffName) || left.staffId.localeCompare(right.staffId))
}

function toDynamicsItem(world: GameWorld, context: StaffHumanContext): StaffDynamicsPresentationItem | undefined {
  const state = world.staffHumanStatesByContextId[context.id]
  const expectations = world.staffExpectationProfilesByContextId[context.id]
  const person = getStaffPerson(world, context.staffId)
  if (state === undefined || expectations === undefined || person === undefined) return undefined

  const assignment = getStaffAssignment(world, context.staffId)
  const personality = world.personalitiesByPersonId[context.staffId]
  const overall = deriveOverallSatisfaction(state, personality)
  const signals = getStaffConsequenceSignals(world, context, state, expectations, monthsSince(expectations.establishedOn, world.currentDate))

  const bands: Record<StaffHumanStateDimension, StaffSatisfactionBand | StaffIntensityBand> = {} as never
  for (const dimension of SATISFACTION_DIMENSIONS) bands[dimension] = classifySatisfactionBand(state[dimension])
  for (const dimension of INTENSITY_DIMENSIONS) bands[dimension] = classifyIntensityBand(state[dimension])

  return {
    staffId: context.staffId,
    staffName: `${person.identity.firstName} ${person.identity.lastName}`,
    role: assignment === undefined ? undefined : STAFF_ROLE_LABELS[assignment.role],
    interpretedState: interpretState(state, overall, signals.map((signal) => signal.kind)),
    trend: deriveTrend(world, context),
    overallSatisfaction: classifySatisfactionBand(overall),
    bands,
    needsAttention: signals.some((signal) => signal.severity >= 2),
    signalKinds: signals.map((signal) => signal.kind),
  }
}

/** §38 — never a plain alias of overall satisfaction: distinguishes stress/overload-dominated (STRAINED), frustration+voice-deficit (FRUSTRATED) and commitment+fulfillment collapse (DISENGAGED) from a plain low score. */
function interpretState(state: { readonly frustration: number; readonly stress: number; readonly influenceSatisfaction: number; readonly recognitionSatisfaction: number; readonly organizationalCommitment: number; readonly professionalFulfillment: number }, overall: number, signalKinds: readonly string[]): StaffDynamicsInterpretedState {
  if (state.organizationalCommitment <= 30 && state.professionalFulfillment <= 35) return 'DISENGAGED'
  if (state.stress >= 70 && (signalKinds.includes('sustainedOverload') || signalKinds.includes('sustainedHeavyWorkload'))) return 'STRAINED'
  if (state.frustration >= 65 && (state.influenceSatisfaction <= 35 || state.recognitionSatisfaction <= 35)) return 'FRUSTRATED'
  if (overall >= 78) return 'THRIVING'
  if (overall >= 62) return 'CONTENT'
  if (overall >= 50) return 'SETTLED'
  if (overall >= 38) return 'MIXED'
  return 'CONCERNED'
}

/** §43 — derived from recent ReactionRecord history, never persisted. */
function deriveTrend(world: GameWorld, context: StaffHumanContext): StaffDynamicsTrend {
  const recent = Object.values(world.staffReactionRecordsById)
    .filter((record) => record.contextId === context.id)
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id))
    .slice(0, 8)
  if (recent.length === 0) return 'STABLE'
  const net = recent.reduce((sum, record) => sum + Object.values(record.stateDelta).reduce((inner, value) => inner + (value ?? 0), 0), 0)
  if (net > 4) return 'IMPROVING'
  if (net < -4) return 'WORSENING'
  return 'STABLE'
}

function monthsSince(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth] = fromDate.split('-').map(Number)
  const [toYear, toMonth] = toDate.split('-').map(Number)
  return Math.max(0, (toYear! - fromYear!) * 12 + (toMonth! - fromMonth!))
}

// ---------------------------------------------------------------------------
// §41/§44 — inspector detail + explainability
// ---------------------------------------------------------------------------

export interface StaffDynamicsExpectationGapDisplay {
  readonly dimension: StaffExpectationDimension
  readonly label: string
  readonly band: 'STRONGLY_BELOW' | 'BELOW' | 'ABOVE' | 'STRONGLY_ABOVE'
}

export interface StaffDynamicsMemoryDisplay {
  readonly id: string
  readonly summary: string
  readonly occurredOn: string
  readonly positive: boolean
}

export interface StaffDynamicsRelationshipDisplay {
  readonly personId: string
  readonly personLabel: string
  readonly band: string
}

export interface StaffDynamicsExplanation {
  readonly currentState: StaffDynamicsInterpretedState
  readonly trend: StaffDynamicsTrend
  readonly concerns: readonly string[]
  readonly positives: readonly string[]
  readonly expectationGaps: readonly StaffDynamicsExpectationGapDisplay[]
  readonly recentDevelopments: readonly string[]
  readonly memories: readonly StaffDynamicsMemoryDisplay[]
  readonly relationships: readonly StaffDynamicsRelationshipDisplay[]
}

const EXPECTATION_LABELS: Readonly<Record<StaffExpectationDimension, string>> = {
  roleStature: 'Role stature', responsibility: 'Responsibility', autonomy: 'Autonomy', influence: 'Influence',
  compensation: 'Compensation', workload: 'Workload', progression: 'Progression', recognition: 'Recognition',
  jobSecurity: 'Job security', professionalChallenge: 'Professional challenge', development: 'Development',
  resourceSupport: 'Resource support', informationAccess: 'Information access', decisionAccess: 'Decision access',
  organizationalAmbition: 'Organizational ambition',
}

const CONCERN_PHRASES: Readonly<Partial<Record<StaffExpectationDimension, string>>> = {
  influence: 'Influence is below expectations.',
  decisionAccess: 'Decision involvement is below expectations.',
  recognition: 'Feels their contribution is under-recognized.',
  autonomy: 'Autonomy is below expectations.',
  responsibility: 'Responsibility is below expectations.',
  compensation: 'Compensation feels below expectations.',
  jobSecurity: 'Job security is a concern.',
  workload: 'Workload is not where they would expect.',
}
const POSITIVE_PHRASES: Readonly<Partial<Record<StaffExpectationDimension, string>>> = {
  compensation: 'Very satisfied with contract.',
  workload: 'Workload is healthy.',
  autonomy: 'Enjoys strong autonomy.',
  influence: 'Feels genuinely heard.',
  recognition: 'Feels well recognized.',
}

export function explainStaffHumanState(world: GameWorld, staffId: StaffPersonId): StaffDynamicsExplanation | undefined {
  const context = Object.values(world.staffHumanContextsById).filter((item) => item.staffId === staffId && item.endedOn === undefined).sort((a, b) => b.startedOn.localeCompare(a.startedOn))[0]
  if (context === undefined) return undefined
  const state = world.staffHumanStatesByContextId[context.id]
  const expectations = world.staffExpectationProfilesByContextId[context.id]
  if (state === undefined || expectations === undefined) return undefined

  const reality = deriveStaffReality(world, context)
  const gaps = STAFF_EXPECTATION_DIMENSIONS
    .map((dimension) => ({ dimension, gap: deriveExpectationGap(dimension, expectations.current[dimension], reality[dimension]) }))
    .filter((entry) => entry.gap.band !== 'MATCHED')

  const concerns: string[] = []
  const positives: string[] = []
  for (const entry of gaps) {
    if (entry.gap.band === 'BELOW' || entry.gap.band === 'STRONGLY_BELOW') {
      const phrase = CONCERN_PHRASES[entry.dimension]
      if (phrase !== undefined) concerns.push(phrase)
    } else {
      const phrase = POSITIVE_PHRASES[entry.dimension]
      if (phrase !== undefined) positives.push(phrase)
    }
  }
  if (state.stress >= 70) concerns.push('Stress is running high.')
  if (state.frustration >= 65) concerns.push('Frustration is building.')
  if (state.organizationalCommitment >= 70) positives.push('Strong organizational commitment.')
  if (classifyWorkloadBand(calculateStaffWorkload(world, staffId).utilization) === 'HEALTHY') positives.push('Workload is healthy.')

  const recentReactions = Object.values(world.staffReactionRecordsById)
    .filter((record) => record.contextId === context.id && (record.importance === 'IMPORTANT' || record.importance === 'CRITICAL'))
    .sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || b.id.localeCompare(a.id))
    .slice(0, 5)
  const recentDevelopments = recentReactions.map((record) => describeReaction(record.eventKind, record.occurredOn))

  const overall = deriveOverallSatisfaction(state, world.personalitiesByPersonId[staffId])
  const signals = getStaffConsequenceSignals(world, context, state, expectations, monthsSince(expectations.establishedOn, world.currentDate))

  const memories = getRecentMemories(getMemoriesForEntity(world, staffId), 5).map((memory) => ({
    id: memory.id,
    summary: describeMemory(memory.type, memory.valence),
    occurredOn: memory.occurredOn,
    positive: memory.valence > 0,
  }))

  const relationships = getRelationshipsForPerson(world, staffId)
    .filter((profile) => profile.sourceId === staffId || profile.targetId === staffId)
    .slice(0, 5)
    .map((profile) => {
      const otherId = profile.sourceId === staffId ? profile.targetId : profile.sourceId
      return { personId: otherId, personLabel: personLabel(world, otherId), band: getRelationshipBand(profile.value).toUpperCase() }
    })

  return {
    currentState: interpretState(state, overall, signals.map((signal) => signal.kind)),
    trend: deriveTrend(world, context),
    concerns: [...new Set(concerns)],
    positives: [...new Set(positives)],
    expectationGaps: gaps.filter((entry) => entry.gap.band !== 'MATCHED').map((entry) => ({ dimension: entry.dimension, label: EXPECTATION_LABELS[entry.dimension], band: entry.gap.band as 'STRONGLY_BELOW' | 'BELOW' | 'ABOVE' | 'STRONGLY_ABOVE' })),
    recentDevelopments,
    memories,
    relationships,
  }
}

function personLabel(world: GameWorld, personId: string): string {
  const staff = getStaffPerson(world, personId as never)
  if (staff !== undefined) return `${staff.identity.firstName} ${staff.identity.lastName}`
  const coach = world.coaches[personId as never]
  if (coach !== undefined) return `${coach.firstName} ${coach.lastName}`
  return personId
}

const EVENT_DESCRIPTIONS: Readonly<Record<string, string>> = {
  responsibilityGranted: 'Granted a new Responsibility.',
  responsibilityRemoved: 'Had a Responsibility removed.',
  responsibilityModeIncreased: 'Gained greater autonomy over a Responsibility.',
  responsibilityModeReduced: 'Autonomy over a Responsibility was reduced.',
  responsibilityReassignedAway: 'A Responsibility was reassigned away from them.',
  responsibilityReassignedToStaff: 'Received a reassigned Responsibility.',
  importantRecommendationAccepted: 'An important recommendation was accepted.',
  importantRecommendationRejected: 'An important recommendation was rejected.',
  recommendationAccepted: 'A recommendation was accepted.',
  actionableRecommendationRejected: 'A recommendation was rejected.',
  recommendationPatternPositive: 'Recent recommendations have been well received.',
  recommendationPatternNegative: 'Recent recommendations have repeatedly been rejected.',
  sustainedOverload: 'Has been consistently overloaded.',
  sustainedUnderutilization: 'Has been consistently underutilized.',
  workloadRelief: 'Workload pressure has eased.',
  staffAppointed: 'Was appointed to their current role.',
  professionalSuccess: 'Had a notable professional success.',
  professionalFailure: 'Had a notable professional setback.',
}

function describeReaction(kind: string, occurredOn: string): string {
  return `${EVENT_DESCRIPTIONS[kind] ?? kind} (${occurredOn})`
}

function describeMemory(type: string, valence: number): string {
  return valence >= 0 ? `Positive professional memory (${type}).` : `Negative professional memory (${type}).`
}

export { STAFF_HUMAN_STATE_DIMENSIONS }
