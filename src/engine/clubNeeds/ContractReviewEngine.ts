import { getPlayerContractStatus } from '@/domain/contract'
import { contractReviewDecisionIdFor, type ContractReviewDecision, type ContractReviewIntent } from '@/domain/contract/ContractReviewDecision'
import type { GameDate } from '@/domain/date'
import type { ContractId, PlayerId, TeamId } from '@/domain/ids'
import type { GameWorld } from '@/domain/world'
import { assessClubNeeds, type ClubNeed } from './ClubNeedsEngine'
import type { ContractRosterExpiry } from './ContractRosterPlanning'
import { hasContinuousContractSuccessor } from './ContractRosterPlanning'
import { assessActiveContractRosterIntegrity } from '@/engine/market/RosterContractIntegrity'

export type ContractReviewStatus = 'REVIEW_REQUIRED' | 'DEFERRED' | 'PURSUE_EXTENSION' | 'ALLOW_EXPIRY' | 'REVIEW_RELEASE' | 'RESOLVED_BY_SUCCESSOR' | 'RESOLVED_PLAYER_LEFT' | 'RESOLVED_EXPIRED' | 'RESOLVED_TERMINATED' | 'STALE'

export interface ContractReviewCandidate {
  readonly id: string
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly contractId: ContractId
  readonly needId: string
  readonly status: ContractReviewStatus
  readonly expiresOn: GameDate
  readonly expiryContext?: ContractRosterExpiry
  readonly decision?: ContractReviewIntent
  readonly decidedOn?: GameDate
  readonly reviewAgainOn?: GameDate
}

export interface ContractReviewOutlook {
  readonly teamId: TeamId
  readonly asOfDate: GameDate
  readonly reviews: readonly ContractReviewCandidate[]
}

export function contractReviewNeedForContract(world: GameWorld, teamId: TeamId, contractId: ContractId, onDate: GameDate = world.currentDate): ClubNeed | undefined {
  const contract = world.contractsById[contractId]
  if (contract === undefined || contract.teamId !== teamId || getPlayerContractStatus(contract, onDate) !== 'active'
    || assessActiveContractRosterIntegrity(world, contract.playerId, onDate) !== 'VALID'
    || hasContinuousContractSuccessor(world, contract.id)) return undefined
  return assessClubNeeds(world, teamId, onDate).needs.find((need) => need.kind === 'CONTRACT_CONTINUITY'
    && need.relatedPlayerIds.includes(contract.playerId)
    && need.evidence.some((evidence) => evidence.code === 'KEY_PLAYER_CONTRACT_EXPIRY' && evidence.values.contractId === contract.id))
}

export function assessContractReviewOutlook(world: GameWorld, teamId: TeamId, onDate: GameDate = world.currentDate): ContractReviewOutlook {
  if (world.teams[teamId] === undefined) throw new RangeError(`Unknown Team ${teamId}`)
  const assessment = assessClubNeeds(world, teamId, onDate)
  const active = assessment.needs.flatMap((need) => {
    if (need.kind !== 'CONTRACT_CONTINUITY') return []
    const evidence = need.evidence.find((item) => item.code === 'KEY_PLAYER_CONTRACT_EXPIRY')
    const contractId = typeof evidence?.values.contractId === 'string' ? evidence.values.contractId as ContractId : undefined
    const contract = contractId === undefined ? undefined : world.contractsById[contractId]
    if (contract === undefined || assessActiveContractRosterIntegrity(world, contract.playerId, onDate) !== 'VALID') return []
    const id = contractReviewDecisionIdFor(teamId, contract.playerId, contract.id)
    const decision = world.contractReviewDecisionsById[id]
    const expiredContext = assessment.contractRosterPlanning.horizons.flatMap((horizon) => horizon.unresolvedExpiries).find((expiry) => expiry.contractId === contract.id)
    const dueToRevisit = decision?.intent === 'DEFER' && decision.reviewAgainOn !== undefined && decision.reviewAgainOn <= onDate
    const status: ContractReviewStatus = decision === undefined || dueToRevisit ? 'REVIEW_REQUIRED'
      : decision.intent === 'DEFER' ? 'DEFERRED'
        : decision.intent
    return [Object.freeze({
      id, teamId, playerId: contract.playerId, contractId: contract.id, needId: need.id, status,
      expiresOn: contract.term.expiresOn,
      ...(expiredContext === undefined ? {} : { expiryContext: expiredContext }),
      ...(decision === undefined ? {} : { decision: decision.intent, decidedOn: decision.decidedOn, ...(decision.reviewAgainOn === undefined ? {} : { reviewAgainOn: decision.reviewAgainOn }) }),
    })]
  })
  const activeIds = new Set(active.map((review) => review.id))
  const historical = Object.values(world.contractReviewDecisionsById).filter((decision) => decision.teamId === teamId && !activeIds.has(decision.id)).map((decision) => {
    const contract = world.contractsById[decision.contractId]
    const playerStillHere = world.teams[teamId]!.rosterPlayerIds.includes(decision.playerId)
    const status: ContractReviewStatus = contract === undefined ? 'STALE'
      : contract.teamId !== teamId || !playerStillHere ? 'RESOLVED_PLAYER_LEFT'
        : getPlayerContractStatus(contract, onDate) === 'terminated' ? 'RESOLVED_TERMINATED'
          : getPlayerContractStatus(contract, onDate) === 'expired' ? 'RESOLVED_EXPIRED'
            : hasContinuousContractSuccessor(world, contract.id) ? 'RESOLVED_BY_SUCCESSOR'
              : 'STALE'
    return Object.freeze({ id: decision.id, teamId, playerId: decision.playerId, contractId: decision.contractId, needId: `${teamId}:CONTRACT_CONTINUITY:${decision.contractId}`, status, expiresOn: contract?.term.expiresOn ?? decision.decidedOn, decision: decision.intent, decidedOn: decision.decidedOn, ...(decision.reviewAgainOn === undefined ? {} : { reviewAgainOn: decision.reviewAgainOn }) })
  })
  const reviews = [...active, ...historical].sort((left, right) => left.expiresOn.localeCompare(right.expiresOn) || left.playerId.localeCompare(right.playerId) || left.id.localeCompare(right.id))
  return Object.freeze({ teamId, asOfDate: onDate, reviews: Object.freeze(reviews) })
}
