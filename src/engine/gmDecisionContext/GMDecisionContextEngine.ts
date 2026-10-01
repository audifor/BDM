import type { GameDate } from '@/domain/date'
import { organizationIdForTeam, type StaffPersonId, type TeamId } from '@/domain/ids'
import type { ClubStrategicMode } from '@/domain/clubStrategy'
import type { GMResponseOptionKind } from '@/domain/gmPlanning'
import type { ResponsibilityKind } from '@/domain/responsibility'
import { responsibilityDefinition } from '@/domain/responsibility'
import { getPersonality, getResponsibility, getStaffAssignment, getStaffPerson, type GameWorld } from '@/domain/world'
import { assessClubNeeds, type ClubNeed, type ClubNeedsAssessment, type ClubNeedsKnowledgePerspective } from '@/engine/clubNeeds'
import { assessClubStrategy } from '@/engine/clubStrategy/ClubStrategyEngine'
import { assessGMOptionAuthority, resolveGovernanceOptionPolicy, type ExecutionReadiness, type GovernanceOptionPolicy, type PlanningEligibility } from './GovernanceOptionPolicy'
export * from './GovernanceOptionPolicy'

export type { GMResponseOptionKind } from '@/domain/gmPlanning'
export type GMOptionRating = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
export type GMKnowledgeReadiness = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
export type GMDecisionReason = 'HIGH_PRIORITY_NEED' | 'CONTEND_WINDOW' | 'DEVELOPMENT_STRATEGY' | 'SELLING_STRATEGY' | 'FINANCIAL_CONSTRAINT' | 'KNOWN_MARKET_COVERAGE' | 'LOW_MARKET_KNOWLEDGE' | 'INTERNAL_DEPTH_AVAILABLE' | 'TEMPORARY_NEED' | 'STRUCTURAL_NEED' | 'CONTRACT_DEADLINE' | 'STAFF_STYLE_SIGNAL' | 'GOVERNANCE_REQUEST_OPEN' | 'NO_ASSIGNED_DECISION_MAKER'

export interface GMDecisionParticipant {
  readonly staffId: StaffPersonId
  readonly role: string
  readonly firstName: string
  readonly lastName: string
  readonly responsibilities: readonly ResponsibilityKind[]
  readonly temperament?: number
  readonly ambition?: number
  readonly competitiveness?: number
}

export interface GMResponseOption {
  readonly id: string
  readonly needId: string
  readonly kind: GMResponseOptionKind
  readonly strategicAlignment: GMOptionRating
  readonly staffStyleAlignment: GMOptionRating
  readonly feasibility: GMOptionRating
  readonly confidence: GMOptionRating
  readonly knowledgeReadiness: GMKnowledgeReadiness
  readonly governancePolicy: GovernanceOptionPolicy
  readonly planningEligibility: PlanningEligibility
  readonly executionReadiness: ExecutionReadiness
  readonly financialContext: ClubNeedsAssessment['financialContext']
  readonly reasons: readonly GMDecisionReason[]
  readonly blockers: readonly string[]
  /** Stable, inspectable sequence within the need; it is not a decision score. */
  readonly priority: number
}

export interface GMDecisionContext {
  readonly teamId: TeamId
  readonly asOfDate: GameDate
  readonly strategy: ClubStrategicMode
  readonly financialPressure: ReturnType<typeof assessClubStrategy>['financialPressure']
  readonly boardPressure: ReturnType<typeof assessClubStrategy>['boardPressure']
  readonly governancePressure: ReturnType<typeof assessClubStrategy>['governancePressure']
  readonly needsAssessment: ClubNeedsAssessment
  readonly decisionParticipants: readonly GMDecisionParticipant[]
  readonly decisionMakerStatus: 'ASSIGNED' | 'ORGANIZATIONAL_FALLBACK'
  readonly externalKnowledgeReadiness: GMKnowledgeReadiness
  readonly options: readonly GMResponseOption[]
}

const RESPONSIBILITY_KINDS: readonly ResponsibilityKind[] = ['recommendSignings', 'shortlistPlayers', 'contractRecommendation', 'tradeRecommendation']
const SORTED_OPTION_KINDS: readonly GMResponseOptionKind[] = ['INTERNAL_ROLE_REALLOCATION', 'INTERNAL_DEVELOPMENT', 'EXTERNAL_ACQUISITION', 'SHORT_TERM_COVER', 'CONTRACT_RETENTION_REVIEW', 'SUCCESSION_PLANNING', 'OUTGOING_MARKET_REVIEW', 'FINANCIAL_CONTAINMENT', 'SCOUTING_EXPANSION', 'WAIT_AND_MONITOR']

/** Pure, shared user/AI projection. It does not invoke market advice, persist, or mutate the world. */
export function assessGMDecisionContext(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate): GMDecisionContext {
  const team = world.teams[teamId]
  if (team === undefined) throw new RangeError(`Unknown Team ${teamId}`)
  const knowledgePerspective: ClubNeedsKnowledgePerspective = team.coachId === world.userCoachId ? 'USER_ANALYTICS' : 'ORGANIZATION_KNOWLEDGE'
  const needsAssessment = assessClubNeeds(world, teamId, onDate, knowledgePerspective)
  const strategyAssessment = assessClubStrategy(onDate === world.currentDate ? world : { ...world, currentDate: onDate }, teamId)
  const strategy = needsAssessment.strategy
  const decisionParticipants = resolveParticipants(world, teamId)
  const externalKnowledgeReadiness = marketKnowledgeReadiness(world, teamId)
  const options = needsAssessment.needs
    .filter((need) => isImportantNeed(need, strategy))
    .flatMap((need) => buildOptions(world, teamId, need, strategy, decisionParticipants, externalKnowledgeReadiness, needsAssessment.financialContext, strategyAssessment, onDate))
    .sort((a, b) => a.needId.localeCompare(b.needId) || a.priority - b.priority || SORTED_OPTION_KINDS.indexOf(a.kind) - SORTED_OPTION_KINDS.indexOf(b.kind) || a.id.localeCompare(b.id))
  return Object.freeze({ teamId, asOfDate: onDate, strategy, financialPressure: strategyAssessment.financialPressure, boardPressure: strategyAssessment.boardPressure, governancePressure: strategyAssessment.governancePressure, needsAssessment, decisionParticipants, decisionMakerStatus: decisionParticipants.length > 0 ? 'ASSIGNED' : 'ORGANIZATIONAL_FALLBACK', externalKnowledgeReadiness, options: Object.freeze(options) })
}

function resolveParticipants(world: GameWorld, teamId: TeamId): GMDecisionParticipant[] {
  const participants = new Map<StaffPersonId, GMDecisionParticipant>()
  for (const kind of RESPONSIBILITY_KINDS) {
    const responsibility = getResponsibility(world, teamId, kind)
    const staffId = responsibility?.holderStaffId
    if (responsibility === undefined || staffId === undefined) continue
    const staff = getStaffPerson(world, staffId)
    const assignment = getStaffAssignment(world, staffId)
    if (staff === undefined || assignment?.teamId !== teamId || !responsibilityDefinition(kind).eligibleRoleIds.includes(assignment.role)) continue
    const personality = getPersonality(world, staffId)
    const prior = participants.get(staffId)
    participants.set(staffId, {
      staffId,
      role: assignment.role,
      firstName: staff.identity.firstName,
      lastName: staff.identity.lastName,
      responsibilities: [...(prior?.responsibilities ?? []), kind].sort(),
      ...(personality === undefined ? {} : { temperament: personality.values.temperament, ambition: personality.values.ambition, competitiveness: personality.values.competitiveness }),
    })
  }
  return [...participants.values()].sort((a, b) => a.role.localeCompare(b.role) || a.staffId.localeCompare(b.staffId))
}

function marketKnowledgeReadiness(world: GameWorld, teamId: TeamId): GMKnowledgeReadiness {
  const organizationId = organizationIdForTeam(teamId)
  const ownPlayerIds = new Set(Object.values(world.teams).filter((team) => team.organizationId === world.teams[teamId]!.organizationId).flatMap((team) => team.rosterPlayerIds))
  const subjects = world.organizationKnowledge.filter((entry) => entry.organizationId === organizationId && !ownPlayerIds.has(entry.subjectPlayerId))
  if (subjects.length === 0) return 'LOW'
  const coverage = subjects.flatMap((entry) => Object.values(entry.dimensions).map((dimension) => dimension.coverage))
  if (coverage.length === 0) return 'LOW'
  const average = coverage.reduce((sum, value) => sum + value, 0) / coverage.length
  return average >= 0.7 ? 'HIGH' : average >= 0.35 ? 'MEDIUM' : 'LOW'
}

function isImportantNeed(need: ClubNeed, strategy: ClubStrategicMode): boolean { return need.severity === 'CRITICAL' || need.severity === 'HIGH' || need.urgency === 'IMMEDIATE' || need.urgency === 'SOON' || need.kind === 'POSITION_SURPLUS' && (strategy === 'SELL' || strategy === 'REBUILD') }

function buildOptions(world: GameWorld, teamId: TeamId, need: ClubNeed, strategy: ClubStrategicMode, participants: readonly GMDecisionParticipant[], knowledge: GMKnowledgeReadiness, financialContext: ClubNeedsAssessment['financialContext'], strategyAssessment: ReturnType<typeof assessClubStrategy>, onDate: GameDate): GMResponseOption[] {
  const kinds = responseKinds(need)
  const internalAvailable = need.relatedPlayerIds.length >= 2 || world.teams[teamId]!.rosterPlayerIds.length > 7
  const urgencyReasons: GMDecisionReason[] = []
  if (need.priorityRank <= 2 || need.severity === 'CRITICAL') urgencyReasons.push('HIGH_PRIORITY_NEED')
  if (need.temporalScope === 'TEMPORARY') urgencyReasons.push('TEMPORARY_NEED')
  if (need.temporalScope === 'STRUCTURAL') urgencyReasons.push('STRUCTURAL_NEED')
  if (need.deadline !== undefined) urgencyReasons.push('CONTRACT_DEADLINE')
  return kinds.map((kind) => {
    const reasons = [...urgencyReasons]
    if (kind === 'EXTERNAL_ACQUISITION' && (strategy === 'CONTEND' || strategy === 'COMPETE')) reasons.push('CONTEND_WINDOW')
    if (kind === 'INTERNAL_DEVELOPMENT' && (strategy === 'DEVELOP' || strategy === 'REBUILD')) reasons.push('DEVELOPMENT_STRATEGY')
    if (kind === 'OUTGOING_MARKET_REVIEW' && (strategy === 'SELL' || strategy === 'REBUILD')) reasons.push('SELLING_STRATEGY')
    if (kind === 'EXTERNAL_ACQUISITION' && (financialContext === 'STRESSED' || financialContext === 'CONSTRAINED')) reasons.push('FINANCIAL_CONSTRAINT')
    if (kind === 'EXTERNAL_ACQUISITION' && knowledge === 'HIGH') reasons.push('KNOWN_MARKET_COVERAGE')
    if (kind === 'SCOUTING_EXPANSION' && knowledge !== 'HIGH' || kind === 'EXTERNAL_ACQUISITION' && knowledge === 'LOW') reasons.push('LOW_MARKET_KNOWLEDGE')
    if ((kind === 'INTERNAL_ROLE_REALLOCATION' || kind === 'INTERNAL_DEVELOPMENT') && internalAvailable) reasons.push('INTERNAL_DEPTH_AVAILABLE')
    const style = styleAlignment(kind, participants)
    if (style !== 'UNKNOWN' && style !== 'MEDIUM') reasons.push('STAFF_STYLE_SIGNAL')
    if (participants.length === 0) reasons.push('NO_ASSIGNED_DECISION_MAKER')
    const governancePolicy = resolveGovernanceOptionPolicy(world, teamId, kind, onDate)
    const authorityAssessment = assessGMOptionAuthority(governancePolicy)
    const governanceBlockers = governancePolicy.pendingRequestIds.map((id) => world.governanceRequestsById[id]).filter((request) => request !== undefined).map((request) => `GOVERNANCE_REQUEST_OPEN:${request.category}`)
    if (governancePolicy.pendingRequestIds.length > 0) reasons.push('GOVERNANCE_REQUEST_OPEN')
    return Object.freeze({
      id: `${need.id}:${kind}`,
      needId: need.id,
      kind,
      strategicAlignment: kind === 'SCOUTING_EXPANSION' && knowledge === 'LOW' ? 'HIGH' : strategicAlignment(kind, strategy, need, strategyAssessment),
      staffStyleAlignment: style,
      feasibility: feasibility(kind, need, financialContext, internalAvailable),
      confidence: need.confidence === 'HIGH' ? 'HIGH' : need.confidence === 'MODERATE' ? 'MEDIUM' : 'LOW',
      knowledgeReadiness: kind === 'EXTERNAL_ACQUISITION' || kind === 'SCOUTING_EXPANSION' ? knowledge : 'UNKNOWN',
      governancePolicy,
      ...authorityAssessment,
      financialContext,
      reasons: Object.freeze([...new Set(reasons)]),
      blockers: Object.freeze(governanceBlockers),
      priority: 0,
    })
  }).sort((a, b) => ratingOrder(a.strategicAlignment) - ratingOrder(b.strategicAlignment) || ratingOrder(a.feasibility) - ratingOrder(b.feasibility) || ratingOrder(a.staffStyleAlignment) - ratingOrder(b.staffStyleAlignment) || ratingOrder(a.knowledgeReadiness) - ratingOrder(b.knowledgeReadiness) || SORTED_OPTION_KINDS.indexOf(a.kind) - SORTED_OPTION_KINDS.indexOf(b.kind))
    .map((option, index) => Object.freeze({ ...option, priority: index + 1 }))
}

function ratingOrder(value: GMOptionRating | GMKnowledgeReadiness): number { return value === 'HIGH' ? 0 : value === 'MEDIUM' ? 1 : value === 'LOW' ? 2 : 3 }

function responseKinds(need: ClubNeed): readonly GMResponseOptionKind[] {
  switch (need.kind) {
    case 'TEMPORARY_COVER': return ['SHORT_TERM_COVER', 'INTERNAL_ROLE_REALLOCATION', 'WAIT_AND_MONITOR']
    case 'CONTRACT_CONTINUITY': case 'CONTRACT_CLUSTER': return ['CONTRACT_RETENTION_REVIEW', 'WAIT_AND_MONITOR']
    case 'AGING_CORE': return ['SUCCESSION_PLANNING', 'OUTGOING_MARKET_REVIEW', 'WAIT_AND_MONITOR']
    case 'POSITION_SURPLUS': return ['OUTGOING_MARKET_REVIEW', 'INTERNAL_ROLE_REALLOCATION', 'WAIT_AND_MONITOR']
    case 'DEVELOPMENT_OPPORTUNITY': return ['INTERNAL_DEVELOPMENT', 'WAIT_AND_MONITOR']
    case 'FINANCIAL_PRESSURE': return ['FINANCIAL_CONTAINMENT', 'WAIT_AND_MONITOR']
    default: return ['INTERNAL_ROLE_REALLOCATION', 'INTERNAL_DEVELOPMENT', 'EXTERNAL_ACQUISITION', 'SCOUTING_EXPANSION', 'WAIT_AND_MONITOR']
  }
}

function strategicAlignment(kind: GMResponseOptionKind, strategy: ClubStrategicMode, need: ClubNeed, assessment: ReturnType<typeof assessClubStrategy>): GMOptionRating {
  if (kind === 'FINANCIAL_CONTAINMENT') return 'HIGH'
  if (kind === 'SHORT_TERM_COVER') return need.temporalScope === 'TEMPORARY' ? 'HIGH' : 'LOW'
  if (kind === 'OUTGOING_MARKET_REVIEW') return strategy === 'SELL' ? 'HIGH' : strategy === 'REBUILD' ? 'MEDIUM' : 'LOW'
  if (kind === 'INTERNAL_DEVELOPMENT') return strategy === 'DEVELOP' ? 'HIGH' : strategy === 'REBUILD' ? 'MEDIUM' : 'LOW'
  if (kind === 'EXTERNAL_ACQUISITION') return strategy === 'CONTEND' ? assessment.financialPressure === 'HIGH' ? 'MEDIUM' : 'HIGH' : strategy === 'COMPETE' || strategy === 'SURVIVE' ? 'MEDIUM' : 'LOW'
  if (kind === 'CONTRACT_RETENTION_REVIEW') return strategy === 'CONTEND' ? 'HIGH' : strategy === 'SELL' ? 'LOW' : 'MEDIUM'
  if (kind === 'SUCCESSION_PLANNING') return strategy === 'DEVELOP' || strategy === 'REBUILD' ? 'HIGH' : 'MEDIUM'
  if (kind === 'SCOUTING_EXPANSION') return 'MEDIUM'
  if (kind === 'INTERNAL_ROLE_REALLOCATION') return 'MEDIUM'
  return 'MEDIUM'
}

function styleAlignment(kind: GMResponseOptionKind, participants: readonly GMDecisionParticipant[]): GMOptionRating {
  const values = participants.map((person) => kind === 'EXTERNAL_ACQUISITION' || kind === 'OUTGOING_MARKET_REVIEW' ? person.ambition ?? person.competitiveness : kind === 'WAIT_AND_MONITOR' || kind === 'INTERNAL_DEVELOPMENT' ? person.temperament === undefined ? undefined : 100 - person.temperament : undefined).filter((value): value is number => value !== undefined)
  if (values.length === 0) return 'UNKNOWN'
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  return average >= 65 ? 'HIGH' : average <= 35 ? 'LOW' : 'MEDIUM'
}

function feasibility(kind: GMResponseOptionKind, need: ClubNeed, finance: ClubNeedsAssessment['financialContext'], internalAvailable: boolean): GMOptionRating {
  if (kind === 'EXTERNAL_ACQUISITION') return finance === 'STRESSED' ? 'LOW' : finance === 'CONSTRAINED' ? 'LOW' : finance === 'UNKNOWN' ? 'UNKNOWN' : 'MEDIUM'
  if (kind === 'INTERNAL_ROLE_REALLOCATION' || kind === 'INTERNAL_DEVELOPMENT') return internalAvailable ? 'HIGH' : 'MEDIUM'
  if (kind === 'SHORT_TERM_COVER') return need.temporalScope === 'TEMPORARY' ? 'MEDIUM' : 'LOW'
  if (kind === 'SCOUTING_EXPANSION' || kind === 'WAIT_AND_MONITOR') return 'HIGH'
  if (kind === 'FINANCIAL_CONTAINMENT') return finance === 'STRESSED' ? 'MEDIUM' : 'HIGH'
  return 'MEDIUM'
}
