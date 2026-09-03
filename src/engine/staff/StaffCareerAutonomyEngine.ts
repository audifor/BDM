import type { GameWorld } from '@/domain/world'
import type { StaffHumanContext, StaffHumanState } from '@/domain/staffHumanState'
import type { StaffCareerAutonomyState, StaffCareerIntent, StaffCareerOutlook } from '@/domain/staffCareerAutonomy'
import type { StaffJobOffer, StaffJobOpening } from '@/domain/staffCareer'
import { calculateStaffRoleProficiencyByRoleId, staffRoleDefinition } from '@/domain/staff'
import type { StaffPersonId } from '@/domain/ids'

export const STAFF_CAREER_AUTONOMY_TUNING = {
  adaptation: 0.28,
  requestIntensity: 58,
  marketIntensity: 68,
  resignationIntensity: 90,
  minimumIntentAgeDays: 21,
} as const

export interface StaffCareerAppraisal {
  readonly progressionPressure: number
  readonly responsibilityPressure: number
  readonly autonomyPressure: number
  readonly recognitionPressure: number
  readonly contractPressure: number
  readonly workloadPressure: number
  readonly belongingPressure: number
  readonly conflictPressure: number
  readonly opportunityPressure: number
  readonly recommendedOutlook: StaffCareerOutlook
  readonly recommendedIntent: StaffCareerIntent
  readonly targetIntensity: number
  readonly reasons: readonly string[]
}

export interface StaffCareerOpportunityAssessment {
  readonly eligible: boolean
  readonly score: number
}

export type StaffAutonomousOfferDecision = 'ACCEPT' | 'DECLINE'

const low = (value: number) => Math.max(0, 50 - value) * 2
const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)))

/** Pure deterministic appraisal: all inputs come from canonical state; UNKNOWN expectations remain neutral in Human State. */
export function appraiseStaffCareer(world: GameWorld, context: StaffHumanContext, state: StaffHumanState): StaffCareerAppraisal {
  const personality = world.personalitiesByPersonId[context.staffId]?.values
  const ambition = personality?.ambition ?? 50
  const loyalty = personality?.loyalty ?? 50
  const resilience = personality?.resilience ?? 50
  const role = low(state.roleSatisfaction)
  const responsibility = clamp(low(state.responsibilitySatisfaction) * (0.55 + ambition / 200) + low(state.influenceSatisfaction) * 0.25)
  const progression = clamp((role * 0.45 + responsibility * 0.55) * (0.55 + ambition / 100))
  const autonomy = low(state.autonomySatisfaction)
  const recognition = low(state.recognitionSatisfaction)
  const contract = low(state.contractSatisfaction)
  const workload = clamp(low(state.workloadSatisfaction) + state.stress * 0.35)
  const culture = world.staffCultureStatesByScopeKey[context.teamId]
  const relationshipPressure = clamp(Object.values(world.relationshipsByKey).filter((relationship) => relationship.sourceId === context.staffId).reduce((sum, relationship) => sum + Math.max(0, -relationship.value), 0))
  const cohesionPressure = clamp(Object.values(world.staffUnitCohesionStatesByUnitKey).filter((unit) => unit.scopeKey === context.teamId).reduce((sum, unit) => sum + low(unit.current.mutualSupport) * 0.08 + low(unit.current.trustClimate) * 0.08, 0))
  const belonging = clamp(low(state.organizationalCommitment) * 0.65 + relationshipPressure * 0.12 + cohesionPressure * 0.08 + (culture === undefined ? 0 : low(culture.current.collaboration) * 0.075 + low(culture.current.communicationOpenness) * 0.075))
  const conflict = clamp(Object.values(world.staffConflictsById)
    .filter((item) => item.status === 'ACTIVE' && item.participants.some((participant) => participant.actorId === context.staffId))
    .reduce((sum, item) => sum + ({ MINOR: 12, MODERATE: 25, SERIOUS: 42, SEVERE: 60, CRITICAL: 60 }[item.severity] ?? 0), 0))
  const reputation = world.staffReputationProfilesByStaffId[context.staffId]
  const opportunity = clamp((reputation === undefined ? 0 : Object.values(reputation.values).reduce((sum, value) => sum + value, 0) / 40) + ambition * 0.2)
  const exitBase = clamp((belonging * 0.28 + conflict * 0.3 + workload * 0.12 + contract * 0.1 + state.frustration * 0.15 + state.stress * 0.05) * (1.25 - loyalty / 200) * (1.2 - resilience / 500))
  let intent: StaffCareerIntent = 'NONE'
  if (exitBase >= 78) intent = 'EXIT_NOW'
  else if (exitBase >= 60) intent = 'EXPLORE_MARKET'
  else if (progression + opportunity * 0.15 >= 55) intent = 'PROMOTION'
  else if (responsibility >= 48) intent = 'MORE_RESPONSIBILITY'
  else if (contract >= 55) intent = 'CONTRACT_IMPROVEMENT'
  const target = intent === 'PROMOTION' ? clamp(progression + opportunity * 0.15) : intent === 'MORE_RESPONSIBILITY' ? responsibility : intent === 'CONTRACT_IMPROVEMENT' ? contract : intent === 'EXPLORE_MARKET' || intent === 'EXIT_NOW' ? clamp(exitBase + opportunity * 0.1) : Math.max(0, 35 - exitBase)
  const outlook: StaffCareerOutlook = exitBase >= 75 ? 'EXIT_MINDED' : exitBase >= 48 ? 'RESTLESS' : target >= 35 ? 'OPEN' : state.organizationalCommitment >= 70 ? 'COMMITTED' : 'STABLE'
  const reasons: string[] = []
  if (progression >= 45) reasons.push('Feels capable of greater professional progression')
  if (responsibility >= 45) reasons.push('Current responsibility and influence feel below expectations')
  if (conflict >= 25) reasons.push('An unresolved professional conflict is weighing on the situation')
  if (belonging >= 45) reasons.push('Attachment to the organization has weakened')
  if (workload >= 45) reasons.push('Sustained workload pressure is a concern')
  if (reasons.length === 0) reasons.push('Current professional situation is broadly settled')
  return { progressionPressure: progression, responsibilityPressure: responsibility, autonomyPressure: autonomy, recognitionPressure: recognition, contractPressure: contract, workloadPressure: workload, belongingPressure: belonging, conflictPressure: conflict, opportunityPressure: opportunity, recommendedOutlook: outlook, recommendedIntent: intent, targetIntensity: clamp(target), reasons }
}

export function progressStaffCareerAutonomy(previous: StaffCareerAutonomyState | undefined, appraisal: StaffCareerAppraisal, context: StaffHumanContext, date: string): StaffCareerAutonomyState {
  const sameIntent = previous?.primaryIntent === appraisal.recommendedIntent
  const intensity = clamp((previous?.intensity ?? 0) + (appraisal.targetIntensity - (previous?.intensity ?? 0)) * STAFF_CAREER_AUTONOMY_TUNING.adaptation)
  return { contextId: context.id, staffId: context.staffId, teamId: context.teamId, outlook: appraisal.recommendedOutlook, primaryIntent: appraisal.recommendedIntent, intensity, intentSince: sameIntent ? previous!.intentSince : date as StaffCareerAutonomyState['intentSince'], lastEvaluatedOn: date as StaffCareerAutonomyState['lastEvaluatedOn'], ...(previous?.lastActionOn === undefined ? {} : { lastActionOn: previous.lastActionOn }) }
}

/** Pure Staff-side view of a real opening. It never represents employer interest or creates an opportunity. */
export function assessStaffCareerOpportunity(world: GameWorld, staffId: StaffPersonId, state: StaffCareerAutonomyState, opening: StaffJobOpening): StaffCareerOpportunityAssessment {
  const employment = world.staffEmploymentByStaffId[staffId]
  const staff = world.staffPeopleById[staffId]
  if (staff === undefined || employment?.status !== 'employed' || employment.teamId === opening.teamId || opening.status !== 'open') return { eligible: false, score: 0 }
  const personality = world.personalitiesByPersonId[staffId]?.values
  const currentSeniority = staffRoleDefinition(employment.roleId!).seniority
  const openingSeniority = staffRoleDefinition(opening.roleId).seniority
  const rank = (value: typeof currentSeniority) => ['junior', 'standard', 'senior', 'director'].indexOf(value)
  const promotion = (rank(openingSeniority) - rank(currentSeniority)) * 24
  const roleFit = calculateStaffRoleProficiencyByRoleId(staff, opening.roleId) * 0.12
  const lateralTolerance = state.outlook === 'EXIT_MINDED' ? 20 : 0
  const score = clamp(promotion + roleFit + state.intensity * 0.38 + (personality?.ambition ?? 50) * 0.16 - (personality?.loyalty ?? 50) * 0.1 + lateralTolerance)
  return { eligible: score >= 50, score }
}

/** Deterministic decision against an actual pending offer. Higher roles/pay help; loyalty and commitment resist marginal moves. */
export function decideStaffAutonomousOffer(world: GameWorld, staffId: StaffPersonId, state: StaffCareerAutonomyState, offer: StaffJobOffer): StaffAutonomousOfferDecision {
  const employment = world.staffEmploymentByStaffId[staffId]
  const currentHuman = world.staffHumanStatesByContextId[state.contextId]
  const opening = world.staffJobOpeningsById[offer.jobOpeningId]
  if (employment?.status !== 'employed' || opening === undefined) return 'DECLINE'
  const personality = world.personalitiesByPersonId[staffId]?.values
  const rank = (value: string) => ['junior', 'standard', 'senior', 'director'].indexOf(value)
  const roleGain = rank(staffRoleDefinition(opening.roleId).seniority) - rank(staffRoleDefinition(employment.roleId!).seniority)
  const currentSalary = Object.values(world.staffContractsById).find((contract) => contract.staffId === staffId && contract.teamId === employment.teamId && contract.termination === undefined)?.compensation.annualSalary ?? 0
  const salaryGain = currentSalary <= 0 ? 0 : Math.max(-20, Math.min(20, ((offer.annualSalary ?? currentSalary) - currentSalary) / currentSalary * 100))
  const pressure = state.intensity * 0.55 + roleGain * 18 + salaryGain + (100 - (currentHuman?.organizationalCommitment ?? 50)) * 0.25
  const resistance = (personality?.loyalty ?? 50) * 0.3 + (currentHuman?.organizationalCommitment ?? 50) * 0.25
  return pressure >= resistance + 22 ? 'ACCEPT' : 'DECLINE'
}
