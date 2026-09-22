import { compareGameDates, type GameDate } from '@/domain/date'
import { deriveGovernanceDecisionStatus, resolveGovernanceDecisionRights, type GovernanceDecisionEvent } from '@/domain/governance'
import type { GameWorld } from '@/domain/world/GameWorld'

export function isLinkedGovernanceDecisionApproved(world: GameWorld, governanceDecisionId: string | undefined, onDate: GameDate): boolean {
  if (governanceDecisionId === undefined) return true
  const decision = world.governanceDecisionsById[governanceDecisionId]
  if (decision === undefined || decision.decisionType !== 'OWNERSHIP_CHANGE') return false
  const events = Object.values(world.governanceDecisionEventsById).filter((event) => event.decisionId === decision.id && compareGameDates(event.effectiveOn, onDate) <= 0)
  const rights = resolveGovernanceDecisionRights({
    decisionType: decision.decisionType,
    institutionId: decision.institutionId,
    asOfDate: onDate,
    bodies: Object.values(world.governanceBodiesById),
    authorityGrants: Object.values(world.governanceAuthorityGrantsById),
    participationGrants: Object.values(world.governanceDecisionParticipationGrantsById),
  })
  const status = deriveGovernanceDecisionStatus(events as readonly GovernanceDecisionEvent[], rights.approverBodyIds)
  return status === 'APPROVED' || status === 'EXECUTED'
}
