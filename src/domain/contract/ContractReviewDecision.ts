import { compareGameDates, parseGameDate, type GameDate } from '@/domain/date'
import type { CoachId, ContractId, PlayerId, TeamId } from '@/domain/ids'

declare const contractReviewDecisionIdBrand: unique symbol
export type ContractReviewDecisionId = string & { readonly [contractReviewDecisionIdBrand]: 'ContractReviewDecisionId' }

export type ContractReviewIntent = 'PURSUE_EXTENSION' | 'ALLOW_EXPIRY' | 'REVIEW_RELEASE' | 'DEFER'

export interface ContractReviewDecision {
  readonly id: ContractReviewDecisionId
  readonly teamId: TeamId
  readonly playerId: PlayerId
  readonly contractId: ContractId
  readonly intent: ContractReviewIntent
  readonly decidedOn: GameDate
  readonly decidedByCoachId: CoachId
  readonly reviewAgainOn?: GameDate
}

export function contractReviewDecisionIdFor(teamId: TeamId, playerId: PlayerId, contractId: ContractId): ContractReviewDecisionId {
  return `contract-review:${teamId}:${playerId}:${contractId}` as ContractReviewDecisionId
}

export function createContractReviewDecision(input: ContractReviewDecision): ContractReviewDecision {
  const id = contractReviewDecisionIdFor(input.teamId, input.playerId, input.contractId)
  const decidedOn = parseGameDate(input.decidedOn)
  const reviewAgainOn = input.reviewAgainOn === undefined ? undefined : parseGameDate(input.reviewAgainOn)
  if (!['PURSUE_EXTENSION', 'ALLOW_EXPIRY', 'REVIEW_RELEASE', 'DEFER'].includes(input.intent)) throw new TypeError(`Invalid contract review intent: ${String(input.intent)}`)
  if (input.intent === 'DEFER' && (reviewAgainOn === undefined || compareGameDates(reviewAgainOn, decidedOn) <= 0)) throw new RangeError('A deferred contract review needs a later revisit date')
  if (input.intent !== 'DEFER' && reviewAgainOn !== undefined) throw new TypeError('Only a deferred contract review can have a revisit date')
  return Object.freeze({ ...input, id, decidedOn, ...(reviewAgainOn === undefined ? {} : { reviewAgainOn }) })
}
