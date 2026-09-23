import { compareGameDates, type GameDate } from '@/domain/date'
import type { CompetitionId, OrganizationId } from '@/domain/ids'
import type { OrganizationOwnershipActor } from '@/domain/ownership/OrganizationOwnership'
import type { GameWorld } from '@/domain/world/GameWorld'
import { findCommonControllers, findCommonOwnershipActors, resolveEffectiveOrganizationOwnership, type CommonControllerResolution, type CommonOwnershipActorResolution } from './MultiClubOwnershipGraph'
import { isMultiClubOwnershipPolicyActiveOn, type MultiClubOwnershipPolicy } from './MultiClubOwnershipPolicy'

export type MultiClubConflictReason = 'COMMON_CONTROL' | 'COMMON_DIRECT_OWNER' | 'COMMON_EFFECTIVE_OWNER_THRESHOLD' | 'OWNERSHIP_INFORMATION_INCOMPLETE' | 'OWNERSHIP_CYCLE'
export type MultiClubConflictVerdict = 'CLEAR' | 'CONFLICT' | 'INDETERMINATE'

export interface MultiClubRelationshipCandidate {
  readonly organizationAId: OrganizationId
  readonly organizationBId: OrganizationId
  readonly commonOwnershipActors: readonly CommonOwnershipActorResolution[]
  readonly commonControllers: readonly CommonControllerResolution[]
  readonly ownershipIndeterminate: boolean
  readonly ownershipHasCycle: boolean
}

export interface MultiClubConflictAssessment extends MultiClubRelationshipCandidate {
  readonly policyId: MultiClubOwnershipPolicy['id']
  readonly enforcement: MultiClubOwnershipPolicy['enforcement']
  readonly verdict: MultiClubConflictVerdict
  readonly reasons: readonly MultiClubConflictReason[]
}

export interface MultiClubScopePair {
  readonly organizationAId: OrganizationId
  readonly organizationBId: OrganizationId
}

export function deriveMultiClubRelationshipCandidate(world: GameWorld, organizationAId: OrganizationId, organizationBId: OrganizationId, onDate: GameDate = world.currentDate): MultiClubRelationshipCandidate {
  const [left, right] = sortOrganizationPair(organizationAId, organizationBId)
  if (left === right) return Object.freeze({ organizationAId: left, organizationBId: right, commonOwnershipActors: Object.freeze([]), commonControllers: Object.freeze([]), ownershipIndeterminate: false, ownershipHasCycle: false })
  const commonOwnershipActors = findCommonOwnershipActors(world, left, right, onDate)
  const graphA = resolveEffectiveOrganizationOwnership(world, left, onDate)
  const graphB = resolveEffectiveOrganizationOwnership(world, right, onDate)
  const commonControllers = findCommonControllers(world, left, right, onDate)
  return Object.freeze({
    organizationAId: left,
    organizationBId: right,
    commonOwnershipActors,
    commonControllers,
    ownershipIndeterminate: graphA.hasUnknownContribution || graphB.hasUnknownContribution || graphA.hasCycle || graphB.hasCycle,
    ownershipHasCycle: graphA.hasCycle || graphB.hasCycle,
  })
}

export function assessMultiClubConflict(world: GameWorld, policyOrId: MultiClubOwnershipPolicy | string, organizationAId: OrganizationId, organizationBId: OrganizationId, onDate: GameDate = world.currentDate): MultiClubConflictAssessment {
  const policy = typeof policyOrId === 'string' ? world.multiClubOwnershipPoliciesById[policyOrId as MultiClubOwnershipPolicy['id']] : policyOrId
  if (policy === undefined) throw new Error(`Multi-club ownership policy does not exist: ${String(policyOrId)}`)
  const candidate = deriveMultiClubRelationshipCandidate(world, organizationAId, organizationBId, onDate)
  if (!isMultiClubOwnershipPolicyActiveOn(policy, onDate) || candidate.organizationAId === candidate.organizationBId || !isPairInPolicyScope(world, policy, candidate.organizationAId, candidate.organizationBId, onDate)) {
    return Object.freeze({ ...candidate, policyId: policy.id, enforcement: policy.enforcement, verdict: 'CLEAR', reasons: Object.freeze([]) })
  }

  const reasons: MultiClubConflictReason[] = []
  if (policy.commonControlRule === 'CONFLICT' && candidate.commonControllers.length > 0) reasons.push('COMMON_CONTROL')
  const ownershipActors = policy.includeIndirectOwnership
    ? candidate.commonOwnershipActors
    : candidate.commonOwnershipActors.filter((actor) => actor.directPercentageA > 0 || actor.directPercentageB > 0 || actor.directHasUnknownContributionA || actor.directHasUnknownContributionB)
  if (ownershipActors.some((actor) => (actor.directPercentageA > 0 && actor.directPercentageB > 0) || (actor.directHasUnknownContributionA && actor.directHasUnknownContributionB))) reasons.push('COMMON_DIRECT_OWNER')

  const thresholdActors = ownershipActors.filter((actor) => {
    if (policy.ownershipThresholdPercentage === null) return false
    const percentageA = policy.includeIndirectOwnership ? actor.knownPercentageA : actor.directPercentageA
    const percentageB = policy.includeIndirectOwnership ? actor.knownPercentageB : actor.directPercentageB
    return percentageA >= policy.ownershipThresholdPercentage && percentageB >= policy.ownershipThresholdPercentage
  })
  if (thresholdActors.length > 0) reasons.push('COMMON_EFFECTIVE_OWNER_THRESHOLD')

  const incomplete = policy.ownershipThresholdPercentage !== null && ownershipActors.some((actor) => policy.includeIndirectOwnership ? actor.hasUnknownContributionA || actor.hasUnknownContributionB : actor.directHasUnknownContributionA || actor.directHasUnknownContributionB)
  if (incomplete) reasons.push('OWNERSHIP_INFORMATION_INCOMPLETE')
  const cyclic = policy.includeIndirectOwnership && candidate.ownershipHasCycle
  if (cyclic) reasons.push('OWNERSHIP_CYCLE')

  const hasConflict = reasons.includes('COMMON_CONTROL') || reasons.includes('COMMON_EFFECTIVE_OWNER_THRESHOLD')
  const verdict = hasConflict ? 'CONFLICT' : incomplete || cyclic ? 'INDETERMINATE' : 'CLEAR'
  return Object.freeze({ ...candidate, policyId: policy.id, enforcement: policy.enforcement, verdict, reasons: Object.freeze(reasons) })
}

export function getActiveMultiClubOwnershipPolicies(world: GameWorld, onDate: GameDate = world.currentDate): readonly MultiClubOwnershipPolicy[] {
  return Object.values(world.multiClubOwnershipPoliciesById)
    .filter((policy) => isMultiClubOwnershipPolicyActiveOn(policy, onDate))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function getOrganizationsInMultiClubPolicyScope(world: GameWorld, policy: MultiClubOwnershipPolicy, onDate: GameDate = world.currentDate): readonly OrganizationId[] {
  const teamIds = new Set<string>()
  if (policy.scope.kind === 'COMPETITION') {
    addCompetitionParticipants(world, policy.scope.competitionId, onDate, teamIds)
  } else {
    const ecosystemId = policy.scope.ecosystemId
    for (const competition of Object.values(world.competitions).filter((candidate) => candidate.ecosystemId === ecosystemId).sort((left, right) => left.id.localeCompare(right.id))) addCompetitionParticipants(world, competition.id, onDate, teamIds)
  }
  const organizationIds = new Set<OrganizationId>()
  for (const teamId of [...teamIds].sort((left, right) => left.localeCompare(right))) {
    const team = world.teams[teamId as keyof typeof world.teams]
    if (team !== undefined) organizationIds.add(team.organizationId)
  }
  return Object.freeze([...organizationIds].sort((left, right) => left.localeCompare(right)))
}

export function findMultiClubRelationshipCandidatesForPolicy(world: GameWorld, policyOrId: MultiClubOwnershipPolicy | string, onDate: GameDate = world.currentDate): readonly MultiClubRelationshipCandidate[] {
  const policy = typeof policyOrId === 'string' ? world.multiClubOwnershipPoliciesById[policyOrId as MultiClubOwnershipPolicy['id']] : policyOrId
  if (policy === undefined) throw new Error(`Multi-club ownership policy does not exist: ${String(policyOrId)}`)
  if (!isMultiClubOwnershipPolicyActiveOn(policy, onDate)) return Object.freeze([])
  const organizations = getOrganizationsInMultiClubPolicyScope(world, policy, onDate)
  const result: MultiClubRelationshipCandidate[] = []
  for (let left = 0; left < organizations.length; left += 1) {
    for (let right = left + 1; right < organizations.length; right += 1) result.push(deriveMultiClubRelationshipCandidate(world, organizations[left]!, organizations[right]!, onDate))
  }
  return Object.freeze(result)
}

export function assessMultiClubConflictsForPolicy(world: GameWorld, policyOrId: MultiClubOwnershipPolicy | string, onDate: GameDate = world.currentDate): readonly MultiClubConflictAssessment[] {
  const policy = typeof policyOrId === 'string' ? world.multiClubOwnershipPoliciesById[policyOrId as MultiClubOwnershipPolicy['id']] : policyOrId
  if (policy === undefined) throw new Error(`Multi-club ownership policy does not exist: ${String(policyOrId)}`)
  return Object.freeze(findMultiClubRelationshipCandidatesForPolicy(world, policy, onDate).map((candidate) => assessMultiClubConflict(world, policy, candidate.organizationAId, candidate.organizationBId, onDate)))
}

export function assessMultiClubImpactsForOrganization(world: GameWorld, organizationId: OrganizationId, onDate: GameDate = world.currentDate): readonly MultiClubConflictAssessment[] {
  const assessments: MultiClubConflictAssessment[] = []
  for (const policy of getActiveMultiClubOwnershipPolicies(world, onDate)) {
    const organizations = getOrganizationsInMultiClubPolicyScope(world, policy, onDate)
    if (!organizations.includes(organizationId)) continue
    for (const other of organizations) {
      if (other === organizationId) continue
      const [left, right] = sortOrganizationPair(organizationId, other)
      assessments.push(assessMultiClubConflict(world, policy, left, right, onDate))
    }
  }
  return Object.freeze(assessments.sort((left, right) => left.policyId.localeCompare(right.policyId) || left.organizationAId.localeCompare(right.organizationAId) || left.organizationBId.localeCompare(right.organizationBId)))
}

export function isBlockingMultiClubAssessment(assessment: MultiClubConflictAssessment): boolean {
  return assessment.enforcement === 'BLOCK' && (assessment.verdict === 'CONFLICT' || assessment.verdict === 'INDETERMINATE')
}

export function assertNoBlockingMultiClubImpact(world: GameWorld, organizationId: OrganizationId, onDate: GameDate): void {
  const assessments = assessMultiClubImpactsForOrganization(world, organizationId, onDate)
  const blocked = assessments.find(isBlockingMultiClubAssessment)
  if (blocked !== undefined) throw new Error(`Multi-club ownership policy ${blocked.policyId} blocks ${blocked.verdict} for ${blocked.organizationAId} and ${blocked.organizationBId}`)
}

function addCompetitionParticipants(world: GameWorld, competitionId: CompetitionId, onDate: GameDate, teamIds: Set<string>): void {
  const competition = world.competitions[competitionId]
  if (competition === undefined) return
  const activeSeasons = Object.values(world.seasons).filter((season) => season.competitionId === competitionId && compareGameDates(season.startDate, onDate) <= 0 && compareGameDates(onDate, season.endDate) <= 0)
  const participants = activeSeasons.flatMap((season) => season.participantTeamIds ?? competition.participantTeamIds)
  for (const teamId of (participants.length === 0 ? competition.participantTeamIds : participants)) teamIds.add(teamId)
}

function isPairInPolicyScope(world: GameWorld, policy: MultiClubOwnershipPolicy, organizationAId: OrganizationId, organizationBId: OrganizationId, onDate: GameDate): boolean {
  const organizations = getOrganizationsInMultiClubPolicyScope(world, policy, onDate)
  return organizations.includes(organizationAId) && organizations.includes(organizationBId)
}

function sortOrganizationPair(left: OrganizationId, right: OrganizationId): readonly [OrganizationId, OrganizationId] {
  return left.localeCompare(right) <= 0 ? [left, right] : [right, left]
}
