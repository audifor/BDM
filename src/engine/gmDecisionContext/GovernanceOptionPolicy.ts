import { resolveGovernanceDecisionRights } from '@/domain/governance/GovernanceDecision'
import type { GovernanceDecisionType } from '@/domain/governance/Governance'
import { deriveGovernanceRequestStatus } from '@/domain/governance/GovernanceRequest'
import type { GameDate } from '@/domain/date'
import type { TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import type { GMResponseOptionKind } from './GMDecisionContextEngine'

export type GovernanceOptionPolicyStatus = 'AUTHORIZED' | 'REQUIRES_APPROVAL' | 'BLOCKED' | 'UNKNOWN'
export type PlanningEligibility = 'SELECTABLE' | 'NOT_SELECTABLE'
export type ExecutionReadiness = 'AUTHORIZED' | 'REQUIRES_APPROVAL' | 'UNKNOWN_AUTHORITY' | 'BLOCKED'

export interface GovernanceOptionPolicy {
  /** This is the highest mapped Governance domain, not approval for a concrete later transaction. */
  readonly decisionType?: GovernanceDecisionType
  readonly status: GovernanceOptionPolicyStatus
  readonly authorityGrantIds: readonly string[]
  readonly proposerBodyIds: readonly string[]
  readonly approverBodyIds: readonly string[]
  readonly executorBodyIds: readonly string[]
  /** Request state is separate from formal authority. */
  readonly pendingRequestIds: readonly string[]
}

export interface GMOptionAuthorityAssessment {
  readonly planningEligibility: PlanningEligibility
  readonly executionReadiness: ExecutionReadiness
}

/** Only family/domain relations already represented in Governance V2 are mapped. */
export const GOVERNANCE_DECISION_TYPE_BY_RESPONSE_FAMILY: Partial<Readonly<Record<GMResponseOptionKind, GovernanceDecisionType>>> = Object.freeze({
  FINANCIAL_CONTAINMENT: 'BUDGET',
})

export function resolveGovernanceOptionPolicy(world: GameWorld, teamId: TeamId, kind: GMResponseOptionKind, asOfDate: GameDate): GovernanceOptionPolicy {
  const institutions = Object.values(world.governanceInstitutionsById).filter((institution) => institution.teamIds.includes(teamId)).sort((a, b) => a.id.localeCompare(b.id))
  const decisionType = GOVERNANCE_DECISION_TYPE_BY_RESPONSE_FAMILY[kind]
  const pendingRequestIds = Object.values(world.governanceRequestsById)
    .filter((request) => institutions.some((institution) => institution.id === request.institutionId))
    .filter((request) => kind === 'FINANCIAL_CONTAINMENT' ? request.category === 'BUDGET' : ['ROSTER', 'STRATEGY', 'BUDGET'].includes(request.category))
    .filter((request) => {
      const events = Object.values(world.governanceRequestEventsById).filter((event) => event.requestId === request.id && event.effectiveOn <= asOfDate)
      const status = deriveGovernanceRequestStatus(events)
      return status !== undefined && !['DECLINED', 'WITHDRAWN', 'FULFILLED'].includes(status)
    })
    .map((request) => request.id)
    .sort()

  if (decisionType === undefined || institutions.length !== 1) return Object.freeze({ status: 'UNKNOWN', authorityGrantIds: Object.freeze([]), proposerBodyIds: Object.freeze([]), approverBodyIds: Object.freeze([]), executorBodyIds: Object.freeze([]), pendingRequestIds: Object.freeze(pendingRequestIds) })

  const institution = institutions[0]!
  const rights = resolveGovernanceDecisionRights({
    decisionType,
    institutionId: institution.id,
    asOfDate,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  })
  const status: GovernanceOptionPolicyStatus = rights.approverBodyIds.length > 0
    ? 'REQUIRES_APPROVAL'
    : rights.executorBodyIds.length > 0
      ? 'AUTHORIZED'
      : 'UNKNOWN'
  return Object.freeze({ decisionType, status, authorityGrantIds: Object.freeze(rights.authorityGrantIds), proposerBodyIds: Object.freeze(rights.proposerBodyIds), approverBodyIds: Object.freeze(rights.approverBodyIds), executorBodyIds: Object.freeze(rights.executorBodyIds), pendingRequestIds: Object.freeze(pendingRequestIds) })
}

/** Broad planning may proceed without execution authority; only an explicit canonical block excludes it. */
export function assessGMOptionAuthority(policy: GovernanceOptionPolicy): GMOptionAuthorityAssessment {
  const planningEligibility: PlanningEligibility = policy.status === 'BLOCKED' ? 'NOT_SELECTABLE' : 'SELECTABLE'
  const executionReadiness: ExecutionReadiness = policy.status === 'BLOCKED'
    ? 'BLOCKED'
    : policy.status === 'REQUIRES_APPROVAL' || policy.pendingRequestIds.length > 0
      ? 'REQUIRES_APPROVAL'
      : policy.status === 'AUTHORIZED'
        ? 'AUTHORIZED'
        : 'UNKNOWN_AUTHORITY'
  return Object.freeze({ planningEligibility, executionReadiness })
}
